import { useEffect, useRef, useState } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
  ScrollView,
  Modal,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  ImageBackground,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  getStory,
  updateStory,
  buildHistoryContext,
  buildFullHistoryContext,
  type Story,
  type StorySegment,
  type CharacterCard,
  type DiceResult,
  type DifficultyLevel,
  type ImagePromptRecord,
  type StorySummaryRecord,
} from "@/lib/story-store";
import {
  isGenericCharacterAlias,
  resolveExistingCharacterCardForIncoming,
} from "@/lib/character-card-utils";
import {
  generateStory,
  continueStory,
  summarizeStory,
  generateSummaryTitle,
  generateImagePrompt,
  getLLMConfig,
  evaluateCustomAction,
  evaluateInitialAffinities,
  evaluateContinuationQuality,
  generateCharacterPortraitPrompt,
  PACE_MIN_CHARS,
} from "@/lib/llm-client";
import { buildDiceOutcomeContext } from "@/lib/llm-prompts";
import { generateImage, getImageConfig } from "@/lib/image-client";
import { rollDice, evaluateDiceResult } from "@/lib/dice";

const HISTORY_SUMMARY_TRIGGER_CHARS = 15_000;
const SUMMARY_REFRESH_DELTA_CHARS = Math.max(
  1200,
  Math.floor(HISTORY_SUMMARY_TRIGGER_CHARS * 0.4),
);
const AUTO_IMAGE_HISTORY_LIMIT = 30;
const AUTO_READ_SPEEDS = [1, 2, 3, 4] as const;
const BG_SCALE_PRESETS = [50, 75, 100, 125, 150] as const;
const SCALE_PANEL_AUTO_HIDE_MS = 2500;
const AUTO_READ_DELAY_MS: Record<(typeof AUTO_READ_SPEEDS)[number], number> = {
  1: 1800,
  2: 1200,
  3: 800,
  4: 550,
};
const BG_SCALE_TRACK_HEIGHT = 160;
const storyGenerationControllers = new Map<string, AbortController>();

interface LastSentContextMetrics {
  fullChars: number;
  rawChars: number;
  sentChars: number;
  truncated: boolean;
  pacing: keyof typeof PACE_MIN_CHARS;
  minCharsTarget: number;
  generatedChars: number;
  durationMs: number | null;
  at: number | null;
}

interface AffinityChange {
  cardId: string;
  name: string;
  before: number;
  after: number;
  delta: number;
  reason: "mention" | "recent-dialogue" | "summary";
}

interface AffinityApplyResult {
  changes: AffinityChange[];
  toastText: string;
  debugText: string;
}

interface ImageQueueBackgroundItem {
  id: string;
  storyId: string;
  trigger: string;
  summaryPreview: string;
}

interface ImageQueuePortraitItem {
  id: string;
  storyId: string;
  cardId: string;
  label: string;
}

interface ImageQueueSnapshot {
  backgroundRunning: boolean;
  backgroundInFlight: boolean;
  portraitRunning: boolean;
  backgroundPending: ImageQueueBackgroundItem[];
  portraitPending: ImageQueuePortraitItem[];
  portraitInFlight: ImageQueuePortraitItem[];
}

interface SummaryCompressionTask {
  sourceChars: number;
  sourceSegmentCount: number;
  summaryPromise: Promise<{
    summary: string;
    title: string;
    involvedCharacters: string[];
  } | null>;
}

function countSegmentChars(segments: StorySegment[]): number {
  return segments.reduce((sum, segment) => {
    const textChars =
      typeof segment.text === "string" ? segment.text.length : 0;
    const choiceChars = Array.isArray(segment.choices)
      ? segment.choices.join("").length
      : 0;
    return sum + textChars + choiceChars;
  }, 0);
}

// ─── Typewriter Hook ─────────────────────────────────────────────────

function useTypewriter(text: string, speed = 30) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    indexRef.current = 0;

    if (!text) {
      setDone(true);
      return;
    }

    timerRef.current = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) {
        if (timerRef.current) clearInterval(timerRef.current);
        setDone(true);
      }
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, speed]);

  function skip() {
    if (timerRef.current) clearInterval(timerRef.current);
    setDisplayed(text);
    setDone(true);
  }

  return { displayed, done, skip };
}

// ─── Main Component ──────────────────────────────────────────────────

export default function GameScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const router = useRouter();
  const colors = useColors();

  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [backgroundImageUri, setBackgroundImageUri] = useState<
    string | undefined
  >(undefined);
  const [backgroundScalePercent, setBackgroundScalePercent] = useState(100);
  const [characterScalePercent, setCharacterScalePercent] = useState(100);
  const [scalePanelVisible, setScalePanelVisible] = useState(false);
  const [scalePanelMode, setScalePanelMode] = useState<
    "background" | "character"
  >("background");
  const [showCustomInputModal, setShowCustomInputModal] = useState(false);
  const [showCharacterCards, setShowCharacterCards] = useState(false);
  const [showPromptHistory, setShowPromptHistory] = useState(false);
  const [showSummaryHistory, setShowSummaryHistory] = useState(false);
  const [editingCard, setEditingCard] = useState<CharacterCard | null>(null);
  const [editPersonality, setEditPersonality] = useState("");
  const [editBackground, setEditBackground] = useState("");
  const [editAppearance, setEditAppearance] = useState("");
  const [portraitGenerating, setPortraitGenerating] = useState<string | null>(
    null,
  );
  const [portraitPreview, setPortraitPreview] = useState<{
    uri: string;
    name: string;
  } | null>(null);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [showDiceModal, setShowDiceModal] = useState(false);
  const [showChoiceConfirmModal, setShowChoiceConfirmModal] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<{
    text: string;
    index?: number;
  } | null>(null);
  const [diceDisplayValue, setDiceDisplayValue] = useState(1);
  const [diceResult, setDiceResult] = useState<DiceResult | null>(null);
  const [diceSettled, setDiceSettled] = useState(false);
  const diceRollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const diceRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const diceProceedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const promptHistoryScrollRef = useRef<ScrollView | null>(null);
  const summaryHistoryScrollRef = useRef<ScrollView | null>(null);
  const [lastSentContextMetrics, setLastSentContextMetrics] =
    useState<LastSentContextMetrics>({
      fullChars: 0,
      rawChars: 0,
      sentChars: 0,
      truncated: false,
      pacing: "轻松",
      minCharsTarget: PACE_MIN_CHARS["轻松"],
      generatedChars: 0,
      durationMs: null,
      at: null,
    });
  const [historyStuckCount, setHistoryStuckCount] = useState(0);
  const [lastAffinityDebug, setLastAffinityDebug] =
    useState<string>("暂无好感结算");
  const [affinityToastText, setAffinityToastText] = useState<string>("");
  const [autoReadEnabled, setAutoReadEnabled] = useState(false);
  const [autoReadSpeedIndex, setAutoReadSpeedIndex] = useState(0);
  const isMountedRef = useRef(true);
  const activeStoryIdRef = useRef<string>("");
  const generationTokenRef = useRef(0);
  const generationAbortRef = useRef<AbortController | null>(null);
  const generationTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const autoReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const affinityToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const scalePanelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSceneTapAtRef = useRef(0);
  const backgroundTaskInFlightRef = useRef(false);
  const autoBackgroundQueueRef = useRef<
    { storyId: string; summary: string; trigger: string }[]
  >([]);
  const autoBackgroundRunningRef = useRef(false);
  const autoBackgroundSeenRef = useRef<Set<string>>(new Set());
  const summaryCompressionInFlightRef = useRef<Set<string>>(new Set());
  const autoPortraitQueueRef = useRef<{ storyId: string; cardId: string }[]>(
    [],
  );
  const autoPortraitQueuedRef = useRef<Set<string>>(new Set());
  const autoPortraitInFlightRef = useRef<Set<string>>(new Set());
  const autoPortraitRunningRef = useRef(false);
  const [showImageQueue, setShowImageQueue] = useState(false);
  const [imageQueueSnapshot, setImageQueueSnapshot] =
    useState<ImageQueueSnapshot>({
      backgroundRunning: false,
      backgroundInFlight: false,
      portraitRunning: false,
      backgroundPending: [],
      portraitPending: [],
      portraitInFlight: [],
    });

  // Current segment being displayed
  const [viewIndex, setViewIndex] = useState(0);
  const currentSegment = story?.segments[viewIndex] ?? null;
  const characterScaleFactor = characterScalePercent / 100;
  const isChoice = currentSegment?.type === "choice";
  const hasUsableChoices =
    isChoice &&
    Array.isArray(currentSegment?.choices) &&
    currentSegment.choices.length > 0;
  const currentFullHistoryChars = countSegmentChars(story?.segments ?? []);
  const currentHistoryChars = (story?.historyContext ?? "").trim().length;
  const currentSentChars = currentHistoryChars;
  const currentTruncated = currentHistoryChars < currentFullHistoryChars;
  const currentPacing = story?.currentPacing ?? "轻松";
  const currentMinCharsTarget = PACE_MIN_CHARS[currentPacing];
  const currentGeneratedChars = story?.lastGeneratedChars ?? 0;
  const autoReadSpeed = AUTO_READ_SPEEDS[autoReadSpeedIndex];
  const storyGeneratingActive =
    generating || story?.storyGenerationStatus === "generating";
  const imageQueuePendingCount =
    imageQueueSnapshot.backgroundPending.length +
    imageQueueSnapshot.portraitPending.length;
  const imageQueueRunningCount =
    (imageQueueSnapshot.backgroundInFlight ? 1 : 0) +
    imageQueueSnapshot.portraitInFlight.length;
  const displayCards = story
    ? [
        {
          id: "protagonist",
          name: story.protagonistName || "主角",
          hiddenName: story.protagonistName || "主角",
          isNameRevealed: true,
          gender: "",
          personality: story.protagonistDescription || "",
          background: story.protagonistDescription || "",
          appearance: story.protagonistAppearance || "",
          portraitUri: story.protagonistPortraitUri,
          affinity: 100,
          firstAppearance: 0,
          isProtagonist: true,
        },
        ...story.characterCards.map((c) => ({ ...c, isProtagonist: false })),
      ]
    : [];

  // Typewriter
  const displayText = currentSegment?.text ?? "";
  const { displayed, done, skip } = useTypewriter(displayText, 30);

  // Load story
  useEffect(() => {
    if (!storyId) return;
    loadStory();
  }, [storyId]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearDiceTimers() {
    if (diceRollIntervalRef.current) {
      clearInterval(diceRollIntervalRef.current);
      diceRollIntervalRef.current = null;
    }
    if (diceRevealTimeoutRef.current) {
      clearTimeout(diceRevealTimeoutRef.current);
      diceRevealTimeoutRef.current = null;
    }
    if (diceProceedTimeoutRef.current) {
      clearTimeout(diceProceedTimeoutRef.current);
      diceProceedTimeoutRef.current = null;
    }
  }

  function clearAutoReadTimer() {
    if (autoReadTimerRef.current) {
      clearTimeout(autoReadTimerRef.current);
      autoReadTimerRef.current = null;
    }
  }

  function clearAffinityToastTimer() {
    if (affinityToastTimerRef.current) {
      clearTimeout(affinityToastTimerRef.current);
      affinityToastTimerRef.current = null;
    }
  }

  function clearScalePanelTimer() {
    if (scalePanelTimerRef.current) {
      clearTimeout(scalePanelTimerRef.current);
      scalePanelTimerRef.current = null;
    }
  }

  function clearGenerationTimer() {
    if (generationTimerRef.current) {
      clearInterval(generationTimerRef.current);
      generationTimerRef.current = null;
    }
  }

  function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
  }

  function canUpdateGenerationUI(storyIdValue: string, token: number): boolean {
    return (
      isMountedRef.current &&
      generationTokenRef.current === token &&
      activeStoryIdRef.current === storyIdValue
    );
  }

  async function patchStoryGenerationState(
    storyIdValue: string,
    status: Story["storyGenerationStatus"],
    errorMessage = "",
  ) {
    const latest = await mutateLatestStory(storyIdValue, (draft) => {
      draft.storyGenerationStatus = status;
      draft.storyGenerationStartedAt =
        status === "generating"
          ? draft.storyGenerationStartedAt || Date.now()
          : 0;
      draft.lastStoryGenerationError = errorMessage;
    });
    if (
      latest &&
      isMountedRef.current &&
      activeStoryIdRef.current === latest.id
    ) {
      setStory((prev) =>
        prev && prev.id === latest.id ? { ...latest } : prev,
      );
    }
  }

  function cancelStoryGeneration() {
    const targetStoryId = activeStoryIdRef.current || story?.id;
    const controller =
      (targetStoryId ? storyGenerationControllers.get(targetStoryId) : null) ??
      generationAbortRef.current;
    if (!controller) {
      if (targetStoryId) {
        void patchStoryGenerationState(targetStoryId, "idle", "");
      }
      return;
    }
    controller.abort();
  }

  async function mutateLatestStory(
    storyIdValue: string,
    updater: (draft: Story) => void,
  ): Promise<Story | null> {
    const latest = await getStory(storyIdValue);
    if (!latest) return null;
    updater(latest);
    await updateStory(latest);
    return latest;
  }

  useEffect(() => {
    activeStoryIdRef.current = storyId || "";
    setGenerating(false);
    setGenerationElapsedSeconds(0);
    clearGenerationTimer();
    generationAbortRef.current =
      (storyId ? storyGenerationControllers.get(storyId) : null) ?? null;
  }, [storyId]);

  useEffect(() => {
    clearGenerationTimer();
    if (!storyGeneratingActive) {
      setGenerationElapsedSeconds(0);
      return;
    }
    const startedAt =
      story?.storyGenerationStartedAt && story.storyGenerationStartedAt > 0
        ? story.storyGenerationStartedAt
        : Date.now();
    setGenerationElapsedSeconds(
      Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
    );
    generationTimerRef.current = setInterval(() => {
      if (!isMountedRef.current) return;
      setGenerationElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
      );
    }, 250);
    return () => {
      clearGenerationTimer();
    };
  }, [storyGeneratingActive, story?.storyGenerationStartedAt, story?.id]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearAutoReadTimer();
      clearAffinityToastTimer();
      clearScalePanelTimer();
      clearDiceTimers();
      clearGenerationTimer();
      generationAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    clearAutoReadTimer();
    if (!autoReadEnabled) return;
    if (
      !story ||
      !currentSegment ||
      loading ||
      storyGeneratingActive ||
      showDiceModal ||
      showMenu ||
      showHistory ||
      showPromptHistory ||
      showSummaryHistory ||
      showCharacterCards ||
      showCustomInputModal ||
      showChoiceConfirmModal ||
      !done ||
      hasUsableChoices ||
      isChoice
    ) {
      return;
    }

    const delay = AUTO_READ_DELAY_MS[autoReadSpeed];
    autoReadTimerRef.current = setTimeout(() => {
      if (!story || viewIndex >= story.segments.length - 1) return;
      const next = viewIndex + 1;
      setViewIndex(next);
      void mutateLatestStory(story.id, (draft) => {
        draft.currentIndex = Math.max(
          0,
          Math.min(next, draft.segments.length - 1),
        );
      });
    }, delay);

    return () => {
      clearAutoReadTimer();
    };
  }, [
    autoReadEnabled,
    autoReadSpeed,
    story,
    currentSegment,
    loading,
    storyGeneratingActive,
    showDiceModal,
    showMenu,
    showHistory,
    showPromptHistory,
    showSummaryHistory,
    showCharacterCards,
    showCustomInputModal,
    showChoiceConfirmModal,
    done,
    hasUsableChoices,
    isChoice,
    viewIndex,
  ]);

  useEffect(() => {
    if (!showPromptHistory) return;
    const timer = setTimeout(() => {
      promptHistoryScrollRef.current?.scrollToEnd({ animated: false });
    }, 180);
    return () => clearTimeout(timer);
  }, [showPromptHistory]);

  useEffect(() => {
    if (!showSummaryHistory) return;
    const timer = setTimeout(() => {
      summaryHistoryScrollRef.current?.scrollToEnd({ animated: false });
    }, 180);
    return () => clearTimeout(timer);
  }, [showSummaryHistory]);

  useEffect(() => {
    if (!story || !currentSegment || currentSegment.type !== "choice") return;
    if (
      Array.isArray(currentSegment.choices) &&
      currentSegment.choices.length > 0
    )
      return;

    const fallbackChoices = [
      "继续当前行动",
      "先观察周围情况",
      "与关键人物对话",
    ];
    const patched: StorySegment = {
      ...currentSegment,
      text: currentSegment.text?.trim() || "接下来你要怎么做？",
      choices: fallbackChoices,
      judgmentValues:
        story.difficulty === "无随机"
          ? undefined
          : fallbackChoices.map(() => null),
    };

    setStory((prev) => {
      if (!prev || prev.id !== story.id) return prev;
      const nextSegments = [...prev.segments];
      if (viewIndex < 0 || viewIndex >= nextSegments.length) return prev;
      nextSegments[viewIndex] = patched;
      return { ...prev, segments: nextSegments };
    });
    void mutateLatestStory(story.id, (draft) => {
      if (viewIndex < 0 || viewIndex >= draft.segments.length) return;
      draft.segments[viewIndex] = patched;
    });
  }, [story, currentSegment, viewIndex]);

  useEffect(() => {
    syncImageQueueSnapshot(story ?? null);
  }, [story]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!story || generating) return;
    if (story.storyGenerationStatus !== "generating") return;
    const watchingStoryId = story.id;
    const timer = setInterval(() => {
      void (async () => {
        const latest = await getStory(watchingStoryId);
        if (!latest || !isMountedRef.current) return;
        if (activeStoryIdRef.current !== watchingStoryId) return;
        setStory((prev) => {
          if (!prev || prev.id !== latest.id) return prev;
          if (
            prev.updatedAt === latest.updatedAt &&
            prev.storyGenerationStatus === latest.storyGenerationStatus &&
            prev.segments.length === latest.segments.length &&
            prev.currentIndex === latest.currentIndex
          ) {
            return prev;
          }
          return latest;
        });
        if (latest.segments.length > 0) {
          setViewIndex(
            Math.max(
              0,
              Math.min(latest.currentIndex, latest.segments.length - 1),
            ),
          );
        }
      })();
    }, 1200);
    return () => clearInterval(timer);
  }, [story?.id, story?.storyGenerationStatus, story?.updatedAt, generating]);

  useEffect(() => {
    if (!story) return;
    const value = story.backgroundScalePercent ?? 100;
    if (value !== backgroundScalePercent) {
      setBackgroundScalePercent(value);
    }
    const characterValue = story.characterScalePercent ?? 100;
    if (characterValue !== characterScalePercent) {
      setCharacterScalePercent(characterValue);
    }
  }, [story?.id, story?.backgroundScalePercent, story?.characterScalePercent]);

  async function loadStory() {
    setLoading(true);
    const s = await getStory(storyId!);
    if (!s) {
      router.back();
      return;
    }
    if (applyAutoRevealByStableRealName(s)) {
      await updateStory(s);
    }
    setStory(s);
    syncImageQueueSnapshot(s);
    if (s.backgroundImageUri) {
      setBackgroundImageUri(s.backgroundImageUri);
    }
    setBackgroundScalePercent(s.backgroundScalePercent ?? 100);
    setCharacterScalePercent(s.characterScalePercent ?? 100);
    if (s.segments.length === 0) {
      if (s.storyGenerationStatus === "generating") {
        setLoading(false);
        return;
      }
      // Check API config before generating
      const config = await getLLMConfig();
      if (!config.apiKey) {
        Alert.alert(
          "未配置 API",
          "请先在设置中配置 AI API Key 才能使用剧情生成功能",
          [
            { text: "取消", style: "cancel" },
            { text: "去设置", onPress: () => router.push("/(tabs)/settings") },
          ],
        );
        setLoading(false);
        return;
      }
      // Generate initial story
      void generateInitial(s);
    } else {
      setViewIndex(s.currentIndex);
    }
    setLoading(false);
  }

  async function generateInitial(s: Story) {
    const targetStoryId = s.id;
    const token = generationTokenRef.current + 1;
    generationTokenRef.current = token;
    const abortController = new AbortController();
    storyGenerationControllers.set(targetStoryId, abortController);
    generationAbortRef.current = abortController;
    setGenerating(true);
    await patchStoryGenerationState(targetStoryId, "generating", "");
    try {
      const result = await generateStory(
        {
          title: s.title,
          premise: s.premise,
          genre: s.genre,
          protagonistName: s.protagonistName ?? "",
          protagonistDescription: s.protagonistDescription ?? "",
          protagonistAppearance: s.protagonistAppearance ?? "",
          difficulty: s.difficulty,
          pacing: s.currentPacing,
          characterCards: s.characterCards,
        },
        { signal: abortController.signal, timeoutMs: null },
      );
      if (!result.segments || result.segments.length === 0) {
        throw new Error("No valid story segments were returned. Please retry.");
      }
      const initialSegments = ensureChoiceSegment(
        result.segments as StorySegment[],
      );
      s.segments = initialSegments;
      s.currentPacing = result.pacing;
      s.lastGeneratedChars = result.generatedChars;
      s.latestGeneratedContext = buildImageContextFromSegments(initialSegments);
      const openingImageContext = [
        `故事开场：${s.premise}`,
        buildImageContextFromSegments(initialSegments.slice(0, 6)),
      ]
        .filter(Boolean)
        .join("\n")
        .trim();
      s.currentIndex = 0;
      const newCharacterCardIds = processNewCharacters(s, result.newCharacters);
      await applyAIInitialAffinityForNewCharacters(s, result.newCharacters);
      applyAutoRevealByStableRealName(s);
      try {
        const fullHistoryText = buildFullHistoryContext(s.segments);
        const summaryResult = await summarizeStory({
          history: fullHistoryText,
          recentTitles: getRecentSummaryTitles(s),
        });
        if (summaryResult.summary) {
          s.storySummary = summaryResult.summary.trim();
          addSummaryRecord(s, summaryResult, fullHistoryText.length);
        }
      } catch (summaryErr) {
        console.warn("Initial summary generation failed:", summaryErr);
      }
      s.storyGenerationStatus = "idle";
      s.storyGenerationStartedAt = 0;
      s.lastStoryGenerationError = "";
      await updateStory(s);
      if (canUpdateGenerationUI(targetStoryId, token)) {
        setStory({ ...s });
        setViewIndex(0);
      }
      if (openingImageContext) {
        enqueueAutoBackgroundGeneration(
          s.id,
          openingImageContext,
          "initial-opening",
        );
      }
      enqueueAutoPortraitGeneration(s.id, newCharacterCardIds);
    } catch (err) {
      const cancelled = isAbortError(err);
      if (!cancelled) {
        console.error("Generate failed:", err);
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      await patchStoryGenerationState(
        targetStoryId,
        cancelled ? "idle" : "failed",
        cancelled ? "" : message,
      );
      if (!cancelled && canUpdateGenerationUI(targetStoryId, token)) {
        Alert.alert("生成失败", message);
      }
    } finally {
      if (generationAbortRef.current === abortController) {
        generationAbortRef.current = null;
      }
      if (storyGenerationControllers.get(targetStoryId) === abortController) {
        storyGenerationControllers.delete(targetStoryId);
      }
      if (generationTokenRef.current === token && isMountedRef.current) {
        setGenerating(false);
      }
    }
  }

  function generateLocalId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function getCharacterDisplayName(card: CharacterCard): string {
    if (card.isNameRevealed) return card.name;
    return card.hiddenName?.trim() || "陌生人";
  }

  function findCharacterCardBySegmentName(name?: string): CharacterCard | null {
    if (!name || !story) return null;
    const normalized = name.trim();
    if (!normalized) return null;
    return (
      story.characterCards.find(
        (card) =>
          card.name.trim() === normalized ||
          card.hiddenName.trim() === normalized,
      ) || null
    );
  }

  function getDisplayedSegmentCharacterName(name?: string): string {
    if (!name) return "";
    const matchedCard = findCharacterCardBySegmentName(name);
    if (!matchedCard) return name;
    return getCharacterDisplayName(matchedCard);
  }

  function addSummaryRecord(
    targetStory: Story,
    result: { title: string; summary: string; involvedCharacters: string[] },
    sourceChars?: number,
  ) {
    const trimmed = result.summary.trim();
    if (!trimmed) return;
    let title = (result.title || "").trim();
    const recentTitles = getRecentSummaryTitles(targetStory, 5);
    if (!title) {
      title = trimmed.replace(/\s+/g, "").slice(0, 10);
    }
    if (recentTitles.includes(title)) {
      const fallback = trimmed.replace(/\s+/g, "").slice(0, 10);
      title =
        fallback && !recentTitles.includes(fallback)
          ? fallback
          : `${title}-新进展`;
    }
    const latest = targetStory.summaryHistory?.[0]?.summary?.trim();
    if (latest && latest === trimmed) return;
    if (!targetStory.summaryHistory) targetStory.summaryHistory = [];
    const record: StorySummaryRecord = {
      id: generateLocalId(),
      title,
      summary: trimmed,
      involvedCharacters: result.involvedCharacters || [],
      sourceChars,
      createdAt: Date.now(),
    };
    targetStory.summaryHistory = [record, ...targetStory.summaryHistory].slice(
      0,
      50,
    );
  }

  function getRecentSummaryTitles(targetStory: Story, limit = 5): string[] {
    return (targetStory.summaryHistory ?? [])
      .map((item) => item.title?.trim())
      .filter((title): title is string => !!title)
      .slice(0, limit);
  }

  function getRecentContinuationFeedback(
    targetStory: Story,
    limit = 3,
  ): string[] {
    return (targetStory.continuationFeedbackHistory ?? [])
      .slice(0, limit)
      .map((item) => item.content?.trim())
      .filter((item): item is string => !!item);
  }

  function formatContinuationEvaluationLine(input: {
    score: number;
    advice: string;
    issues: string[];
  }): string {
    const issueText = input.issues.length
      ? `问题: ${input.issues.join("；")}`
      : "问题: 无明显硬伤";
    return `评分${input.score}/100；${issueText}；建议: ${input.advice}`;
  }

  function processNewCharacters(
    s: Story,
    newCharacters?: {
      name: string;
      hiddenName?: string;
      knownToPlayer?: boolean;
      gender: string;
      personality: string;
      background: string;
      appearance?: string;
    }[],
  ): string[] {
    const createdCardIds: string[] = [];
    const inferInitialAffinity = (text: string): number => {
      const normalized = text || "";
      if (
        /(相依为命|亲妹妹|亲生妹妹|抚养长大|养父|养母|亲生父母)/.test(
          normalized,
        )
      ) {
        return 85;
      }
      if (/(妹妹|弟弟|父亲|母亲|爸爸|妈妈|家人|亲人)/.test(normalized)) {
        return 45;
      }
      return 0;
    };

    if (!newCharacters || newCharacters.length === 0) return createdCardIds;
    for (const nc of newCharacters) {
      const realName = (nc.name || "").trim();
      if (!realName) continue;

      const hiddenName = nc.hiddenName?.trim() || "陌生人";
      const reveal =
        typeof nc.knownToPlayer === "boolean" ? nc.knownToPlayer : true;
      const initialAffinity = inferInitialAffinity(
        `${nc.personality || ""}\n${nc.background || ""}`,
      );
      const resolved = resolveExistingCharacterCardForIncoming(
        s.characterCards,
        realName,
        hiddenName,
      );

      if (resolved.aliasConflict) {
        console.warn(
          `[character-cards] ambiguous hidden alias "${hiddenName}" for "${realName}", candidates=${resolved.aliasCandidates.join(",")}; creating a new card`,
        );
      }

      const legacyAlias = resolved.match;

      if (legacyAlias) {
        legacyAlias.name = realName;
        const existingHidden = legacyAlias.hiddenName?.trim() || "";
        if (!existingHidden || isGenericCharacterAlias(existingHidden)) {
          legacyAlias.hiddenName = hiddenName;
        }
        legacyAlias.isNameRevealed = legacyAlias.isNameRevealed || reveal;
        legacyAlias.gender = nc.gender || legacyAlias.gender;
        legacyAlias.personality = nc.personality || legacyAlias.personality;
        legacyAlias.background = nc.background || legacyAlias.background;
        legacyAlias.appearance = nc.appearance || legacyAlias.appearance || "";
        if (typeof legacyAlias.affinity !== "number") {
          legacyAlias.affinity = initialAffinity;
        }
      } else {
        const cardId = generateLocalId();
        s.characterCards.push({
          id: cardId,
          name: realName,
          hiddenName,
          isNameRevealed: reveal,
          gender: nc.gender,
          personality: nc.personality,
          background: nc.background,
          appearance: nc.appearance || "",
          affinity: initialAffinity,
          firstAppearance: s.segments.length,
        });
        createdCardIds.push(cardId);
      }
    }
    return createdCardIds;
  }

  function applyAutoRevealByStableRealName(s: Story): boolean {
    const recentDialogues = s.segments
      .slice(-18)
      .filter((segment) => segment.type === "dialogue" && segment.character)
      .map((segment) => (segment.character || "").trim())
      .filter(Boolean);

    if (recentDialogues.length === 0) return false;

    let changed = false;
    for (const card of s.characterCards) {
      if (card.isNameRevealed) continue;
      const realName = card.name?.trim();
      if (!realName) continue;
      const hitCount = recentDialogues.filter(
        (name) => name === realName,
      ).length;
      if (hitCount >= 2) {
        card.isNameRevealed = true;
        changed = true;
      }
    }
    return changed;
  }

  async function applyAIInitialAffinityForNewCharacters(
    s: Story,
    newCharacters?: {
      name: string;
      hiddenName?: string;
      knownToPlayer?: boolean;
      gender: string;
      personality: string;
      background: string;
      appearance?: string;
    }[],
  ) {
    if (!newCharacters || newCharacters.length === 0) return;
    try {
      const affinityMap = await evaluateInitialAffinities({
        title: s.title,
        premise: s.premise,
        genre: s.genre,
        protagonistName: s.protagonistName,
        protagonistDescription: s.protagonistDescription,
        protagonistAppearance: s.protagonistAppearance,
        characters: newCharacters.map((c) => ({
          name: c.name,
          gender: c.gender,
          personality: c.personality,
          background: c.background,
          appearance: c.appearance,
        })),
      });

      for (const incoming of newCharacters) {
        const affinity = affinityMap[incoming.name];
        if (typeof affinity !== "number" || Number.isNaN(affinity)) continue;
        const matched = s.characterCards.find(
          (card) => card.name === incoming.name,
        );
        if (!matched) continue;
        matched.affinity = Math.max(0, Math.min(100, Math.round(affinity)));
      }
    } catch (error) {
      console.warn("Initial affinity AI evaluation failed:", error);
    }
  }

  function buildImageContextFromSegments(segments: StorySegment[]): string {
    return segments
      .map((segment) => {
        if (segment.type === "dialogue" && segment.character) {
          return `${segment.character}：${segment.text}`;
        }
        if (segment.type === "choice") {
          const options = Array.isArray(segment.choices)
            ? segment.choices.join(" / ")
            : "";
          return options
            ? `选择：${segment.text}（可选：${options}）`
            : `选择：${segment.text}`;
        }
        return segment.text;
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function getCardPortraitByName(name?: string): string | undefined {
    if (!name || !story) return undefined;
    if (name === story.protagonistName) {
      return story.protagonistPortraitUri || undefined;
    }
    const card = findCharacterCardBySegmentName(name);
    return card?.portraitUri;
  }

  function getUnlockedTextByAffinity(text: string, affinity: number): string {
    const normalized = (text || "").trim();
    if (!normalized) return "";
    const tier = Math.max(
      0,
      Math.min(4, Math.floor(Math.max(0, affinity) / 25)),
    );
    if (tier <= 0) return "（好感度达到 25 解锁）";
    const chunk = Math.ceil(normalized.length / 4);
    const visible = normalized.slice(0, chunk * tier).trim();
    return visible || "（内容待解锁）";
  }

  function applyAffinityFromChoice(
    choiceText: string,
    diceOutcome?: DiceResult["outcome"],
  ): AffinityApplyResult {
    if (!story) {
      return {
        changes: [],
        toastText: "好感变化：本次无变化",
        debugText: "无存档",
      };
    }

    const text = choiceText.trim();
    if (!text) {
      return {
        changes: [],
        toastText: "好感变化：本次无变化",
        debugText: "空选择文本",
      };
    }

    const positive =
      /(帮助|保护|救|安慰|支持|信任|照顾|协助|陪伴|挡在前面|承担|道歉|坦白|配合|维护|安抚|鼓励|接纳)/;
    const negative =
      /(欺骗|威胁|伤害|背叛|抛下|利用|抢夺|攻击|羞辱|讽刺|冷落|隐瞒|诬陷|胁迫|出卖|推开)/;

    const hasPositive = positive.test(text);
    const hasNegative = negative.test(text);
    const inferredPolarity: 1 | -1 =
      hasPositive && !hasNegative
        ? 1
        : !hasPositive && hasNegative
          ? -1
          : diceOutcome === "worse"
            ? -1
            : 1;

    const difficultyMagnitudeMap: Record<
      DifficultyLevel,
      {
        positive: { strong: number; weak: number };
        negative: { strong: number; weak: number };
      }
    > = {
      简单: {
        positive: { strong: 12, weak: 10 },
        negative: { strong: 2, weak: 1 },
      },
      普通: {
        positive: { strong: 8, weak: 6 },
        negative: { strong: 4, weak: 3 },
      },
      困难: {
        positive: { strong: 5, weak: 3 },
        negative: { strong: 7, weak: 6 },
      },
      噩梦: {
        positive: { strong: 2, weak: 1 },
        negative: { strong: 10, weak: 8 },
      },
      无随机: {
        positive: { strong: 7, weak: 5 },
        negative: { strong: 4, weak: 3 },
      },
    };
    const magnitudePreset = difficultyMagnitudeMap[story.difficulty];

    // 每次互动最多影响 2 名关联角色，确保“有互动就有变化”且反馈稳定。
    const reasonPriority: Array<AffinityChange["reason"]> = [
      "mention",
      "recent-dialogue",
      "summary",
    ];
    const recentNames = story.segments
      .slice(-10)
      .filter((s) => s.type === "dialogue" && s.character)
      .map((s) => (s.character || "").trim())
      .filter(Boolean);
    const summaryNames = (story.summaryHistory ?? [])
      .slice(0, 3)
      .flatMap((item) => item.involvedCharacters ?? [])
      .map((name) => name.trim())
      .filter(Boolean);

    const getReason = (
      card: CharacterCard,
    ): AffinityChange["reason"] | null => {
      const name = card.name?.trim() || "";
      const hidden = card.hiddenName?.trim() || "";
      if ((name && text.includes(name)) || (hidden && text.includes(hidden))) {
        return "mention";
      }
      if (
        (name && recentNames.includes(name)) ||
        (hidden && recentNames.includes(hidden))
      ) {
        return "recent-dialogue";
      }
      if (
        (name && summaryNames.includes(name)) ||
        (hidden && summaryNames.includes(hidden))
      ) {
        return "summary";
      }
      return null;
    };

    const candidates = story.characterCards
      .map((card) => ({ card, reason: getReason(card) }))
      .filter(
        (
          item,
        ): item is { card: CharacterCard; reason: AffinityChange["reason"] } =>
          !!item.reason,
      )
      .sort(
        (a, b) =>
          reasonPriority.indexOf(a.reason) - reasonPriority.indexOf(b.reason),
      )
      .slice(0, 2);

    if (candidates.length === 0) {
      return {
        changes: [],
        toastText: "好感变化：本次无变化",
        debugText: "未匹配到相关角色",
      };
    }

    const changes: AffinityChange[] = [];
    for (const { card, reason } of candidates) {
      const before = Math.max(0, Math.min(100, Math.round(card.affinity || 0)));
      const isStrong = reason === "mention";
      let magnitude =
        inferredPolarity > 0
          ? isStrong
            ? magnitudePreset.positive.strong
            : magnitudePreset.positive.weak
          : isStrong
            ? magnitudePreset.negative.strong
            : magnitudePreset.negative.weak;

      if (diceOutcome === "better") {
        magnitude += inferredPolarity > 0 ? 1 : -1;
      } else if (diceOutcome === "worse") {
        magnitude += inferredPolarity > 0 ? -1 : 1;
      }
      magnitude = Math.max(1, magnitude);

      const delta = inferredPolarity * magnitude;

      const after = Math.max(0, Math.min(100, before + delta));
      if (after === before) continue;

      card.affinity = after;
      changes.push({
        cardId: card.id,
        name: getCharacterDisplayName(card),
        before,
        after,
        delta: after - before,
        reason,
      });
    }

    if (changes.length === 0) {
      return {
        changes: [],
        toastText: "好感变化：本次无变化",
        debugText: "变化为 0 或已触达边界",
      };
    }

    const changeText = changes
      .map(
        (item) =>
          `${item.name}${item.delta > 0 ? `+${item.delta}` : item.delta}`,
      )
      .join("，");
    const reasonCount = changes.reduce(
      (acc, item) => {
        acc[item.reason] += 1;
        return acc;
      },
      { mention: 0, "recent-dialogue": 0, summary: 0 },
    );

    return {
      changes,
      toastText: `好感变化：${changeText}`,
      debugText: `影响${changes.length}人（难度${story.difficulty}，方向${inferredPolarity > 0 ? "增" : "减"}，点名${reasonCount.mention}/近期对话${reasonCount["recent-dialogue"]}/摘要${reasonCount.summary}）`,
    };
  }

  function getAffinityAdjustedJudgment(
    base: number | null,
    choiceText: string,
  ): number | null {
    if (base === null || !story) return base;
    let maxAffinity = 0;
    for (const card of story.characterCards) {
      if (
        choiceText.includes(card.name) ||
        choiceText.includes(card.hiddenName)
      ) {
        maxAffinity = Math.max(maxAffinity, card.affinity || 0);
      }
    }
    const recentSpeaker = story.segments
      .slice(-4)
      .reverse()
      .find((s) => s.type === "dialogue" && s.character)?.character;
    if (recentSpeaker) {
      const speakerCard = story.characterCards.find(
        (c) => c.name === recentSpeaker || c.hiddenName === recentSpeaker,
      );
      if (speakerCard)
        maxAffinity = Math.max(maxAffinity, speakerCard.affinity || 0);
    }

    let reduction = 0;
    if (maxAffinity >= 100) reduction = 3;
    else if (maxAffinity >= 75) reduction = 2;
    else if (maxAffinity >= 50) reduction = 1;
    return Math.max(1, base - reduction);
  }

  function createSummaryCompressionTask(
    targetStory: Story,
  ): SummaryCompressionTask | null {
    const sourceHistory = buildFullHistoryContext(targetStory.segments);
    const sourceChars = sourceHistory.length;
    if (sourceChars < HISTORY_SUMMARY_TRIGGER_CHARS) {
      return null;
    }

    const latestSourceChars = targetStory.summaryHistory?.[0]?.sourceChars ?? 0;
    if (
      targetStory.storySummary?.trim() &&
      latestSourceChars > 0 &&
      sourceChars - latestSourceChars < SUMMARY_REFRESH_DELTA_CHARS
    ) {
      return null;
    }

    const taskKey = `${targetStory.id}:${sourceChars}`;
    if (summaryCompressionInFlightRef.current.has(taskKey)) {
      return null;
    }
    summaryCompressionInFlightRef.current.add(taskKey);

    const summaryPromise = (async () => {
      try {
        const summaryResult = await summarizeStory({
          history: sourceHistory,
          recentTitles: getRecentSummaryTitles(targetStory),
        });
        const summaryText = summaryResult.summary?.trim();
        if (!summaryText) return null;

        let shortTitle = (summaryResult.title || "").trim();
        try {
          shortTitle =
            (await generateSummaryTitle({
              summary: summaryText,
              recentTitles: getRecentSummaryTitles(targetStory),
            })) || shortTitle;
        } catch (titleErr) {
          console.warn("Summary title generation failed:", titleErr);
        }

        return {
          summary: summaryText,
          title: shortTitle,
          involvedCharacters: summaryResult.involvedCharacters ?? [],
        };
      } catch (summaryErr) {
        console.warn("Summary generation failed:", summaryErr);
        return null;
      } finally {
        summaryCompressionInFlightRef.current.delete(taskKey);
      }
    })();

    return {
      sourceChars,
      sourceSegmentCount: targetStory.segments.length,
      summaryPromise,
    };
  }

  async function applySummaryCompressionTask(
    storyIdValue: string,
    task: SummaryCompressionTask,
    trigger: string,
  ) {
    const resolved = await task.summaryPromise;
    if (!resolved) return;

    const latest = await getStory(storyIdValue);
    if (!latest) return;

    const latestSourceChars = latest.summaryHistory?.[0]?.sourceChars ?? 0;
    if (latestSourceChars >= task.sourceChars) return;

    // 历史压缩仅更新摘要，不裁剪 segments，确保最近剧情段上下文完整可追溯。
    latest.storySummary = resolved.summary;
    addSummaryRecord(latest, resolved, task.sourceChars);
    await updateStory(latest);

    setStory((prev) => {
      if (!prev || prev.id !== latest.id) return prev;
      return { ...latest };
    });
    setViewIndex(latest.currentIndex);
  }

  function confirmChoice(choiceText: string, choiceIndex?: number) {
    setPendingChoice({ text: choiceText, index: choiceIndex });
    setShowChoiceConfirmModal(true);
  }

  function cancelChoiceConfirm() {
    setShowChoiceConfirmModal(false);
    setPendingChoice(null);
  }

  function submitChoiceConfirm() {
    if (!pendingChoice) return;
    const payload = pendingChoice;
    cancelChoiceConfirm();
    void handleChoice(payload.text, payload.index);
  }

  function getImageStatusLabel(): string {
    if (imageGenerating || story?.imageGenerationStatus === "generating") {
      return "生图中";
    }
    if (story?.imageGenerationStatus === "success") {
      return "生图完成";
    }
    if (story?.imageGenerationStatus === "failed") {
      return "生图失败";
    }
    return "未生图";
  }

  function formatPromptTime(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function sleep(ms: number) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function showAffinityToast(text: string) {
    const message = text.trim();
    if (!message) return;
    clearAffinityToastTimer();
    setAffinityToastText(message);
    affinityToastTimerRef.current = setTimeout(() => {
      setAffinityToastText("");
      affinityToastTimerRef.current = null;
    }, 2600);
  }

  function buildAutoSummaryKey(storyIdValue: string, summary: string): string {
    return `${storyIdValue}:${summary.replace(/\s+/g, "").slice(0, 200)}`;
  }

  function buildAutoPortraitKey(storyIdValue: string, cardId: string): string {
    return `${storyIdValue}:${cardId}`;
  }

  function buildAutoPortraitLabel(
    taskStoryId: string,
    cardId: string,
    targetStory: Story | null,
  ): string {
    if (cardId === "protagonist") return "主角";
    if (targetStory && targetStory.id === taskStoryId) {
      const found = targetStory.characterCards.find(
        (item) => item.id === cardId,
      );
      if (found) return getCharacterDisplayName(found);
    }
    return `角色 ${cardId.slice(0, 8)}`;
  }

  function parseAutoPortraitTaskKey(taskKey: string): {
    storyId: string;
    cardId: string;
  } {
    const splitIndex = taskKey.indexOf(":");
    if (splitIndex < 0) {
      return { storyId: "", cardId: taskKey };
    }
    return {
      storyId: taskKey.slice(0, splitIndex),
      cardId: taskKey.slice(splitIndex + 1),
    };
  }

  function buildSummaryPreview(summary: string, max = 36): string {
    const normalized = summary.replace(/\s+/g, " ").trim();
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max)}...`;
  }

  function getScaledSize(base: number): number {
    const scaled = Math.round(base * characterScaleFactor);
    return Math.max(32, Math.min(180, scaled));
  }

  function normalizeScalePercent(raw: number): number {
    const closest = BG_SCALE_PRESETS.reduce((best, value) => {
      return Math.abs(value - raw) < Math.abs(best - raw) ? value : best;
    }, BG_SCALE_PRESETS[0]);
    return closest;
  }

  function restartScalePanelAutoHide() {
    clearScalePanelTimer();
    scalePanelTimerRef.current = setTimeout(() => {
      setScalePanelVisible(false);
      scalePanelTimerRef.current = null;
    }, SCALE_PANEL_AUTO_HIDE_MS);
  }

  function showScalePanel(mode: "background" | "character") {
    setScalePanelMode(mode);
    setScalePanelVisible(true);
    restartScalePanelAutoHide();
  }

  function updateBackgroundScalePercent(nextRaw: number) {
    const next = normalizeScalePercent(nextRaw);
    if (next === backgroundScalePercent) {
      restartScalePanelAutoHide();
      return;
    }
    restartScalePanelAutoHide();
    setBackgroundScalePercent(next);
    if (!story) return;
    void mutateLatestStory(story.id, (draft) => {
      draft.backgroundScalePercent = next;
    });
  }

  function updateCharacterScalePercent(nextRaw: number) {
    const next = normalizeScalePercent(nextRaw);
    if (next === characterScalePercent) {
      restartScalePanelAutoHide();
      return;
    }
    restartScalePanelAutoHide();
    setCharacterScalePercent(next);
    if (!story) return;
    void mutateLatestStory(story.id, (draft) => {
      draft.characterScalePercent = next;
    });
  }

  function getScalePercentByMode(mode: "background" | "character") {
    return mode === "background"
      ? backgroundScalePercent
      : characterScalePercent;
  }

  function updateScaleByMode(
    mode: "background" | "character",
    nextRaw: number,
  ) {
    if (mode === "background") {
      updateBackgroundScalePercent(nextRaw);
      return;
    }
    updateCharacterScalePercent(nextRaw);
  }

  function applyScaleFromTrack(
    mode: "background" | "character",
    locationY: number,
  ) {
    const clampedY = Math.max(0, Math.min(BG_SCALE_TRACK_HEIGHT, locationY));
    const ratio = 1 - clampedY / BG_SCALE_TRACK_HEIGHT;
    const value = 50 + ratio * 100;
    updateScaleByMode(mode, value);
  }

  function handleSceneDecorationTap() {
    const now = Date.now();
    const elapsed = now - lastSceneTapAtRef.current;
    lastSceneTapAtRef.current = now;
    if (elapsed > 0 && elapsed < 280) {
      showScalePanel("background");
    }
  }

  function buildImageQueueSnapshot(
    targetStory: Story | null,
  ): ImageQueueSnapshot {
    const backgroundPending = autoBackgroundQueueRef.current.map(
      (task, index) => ({
        id: `bg-${task.storyId}-${index}`,
        storyId: task.storyId,
        trigger: task.trigger,
        summaryPreview: buildSummaryPreview(task.summary),
      }),
    );
    const portraitPending = autoPortraitQueueRef.current.map((task, index) => ({
      id: `pt-pending-${task.storyId}-${task.cardId}-${index}`,
      storyId: task.storyId,
      cardId: task.cardId,
      label: buildAutoPortraitLabel(task.storyId, task.cardId, targetStory),
    }));
    const portraitInFlight = Array.from(autoPortraitInFlightRef.current).map(
      (taskKey, index) => {
        const { storyId: taskStoryId, cardId } =
          parseAutoPortraitTaskKey(taskKey);
        return {
          id: `pt-flight-${taskKey}-${index}`,
          storyId: taskStoryId,
          cardId,
          label: buildAutoPortraitLabel(taskStoryId, cardId, targetStory),
        };
      },
    );
    return {
      backgroundRunning: autoBackgroundRunningRef.current,
      backgroundInFlight: backgroundTaskInFlightRef.current,
      portraitRunning: autoPortraitRunningRef.current,
      backgroundPending,
      portraitPending,
      portraitInFlight,
    };
  }

  function syncImageQueueSnapshot(targetStory: Story | null = story ?? null) {
    if (!isMountedRef.current) return;
    setImageQueueSnapshot(buildImageQueueSnapshot(targetStory));
  }

  async function getAutoBackgroundEveryChoices(): Promise<number> {
    const config = await getLLMConfig();
    const raw = Number(config.autoBackgroundEveryChoices);
    if (!Number.isFinite(raw)) return 3;
    return Math.max(1, Math.min(100, Math.floor(raw)));
  }

  async function triggerAutoBackgroundOnChoiceProgress(
    storyIdValue: string,
    latestChoiceText: string,
  ) {
    const latest = await getStory(storyIdValue);
    if (!latest) return;
    const interval = await getAutoBackgroundEveryChoices();
    const choiceCount = Math.max(0, latest.choiceCount ?? 0);
    const checkpoint = Math.max(0, latest.autoBgChoiceCheckpoint ?? 0);

    const crossed =
      Math.floor(choiceCount / interval) > Math.floor(checkpoint / interval);
    if (!crossed) return;

    const summary =
      latest.latestGeneratedContext?.trim() ||
      `玩家选择推进：${latestChoiceText.trim()}`;
    enqueueAutoBackgroundGeneration(storyIdValue, summary, "choice-interval");

    latest.autoBgChoiceCheckpoint = choiceCount;
    await updateStory(latest);
    if (isMountedRef.current) {
      setStory((prev) =>
        prev && prev.id === latest.id
          ? { ...prev, autoBgChoiceCheckpoint: choiceCount }
          : prev,
      );
    }
  }

  function enqueueAutoBackgroundGeneration(
    targetStoryId: string,
    summary: string,
    trigger: string,
  ) {
    const trimmed = summary.trim();
    if (!targetStoryId || !trimmed) return;
    const key = buildAutoSummaryKey(targetStoryId, trimmed);
    if (autoBackgroundSeenRef.current.has(key)) return;

    autoBackgroundSeenRef.current.add(key);
    if (autoBackgroundSeenRef.current.size > 240) {
      autoBackgroundSeenRef.current.clear();
      autoBackgroundSeenRef.current.add(key);
    }
    autoBackgroundQueueRef.current.push({
      storyId: targetStoryId,
      summary: trimmed,
      trigger,
    });
    syncImageQueueSnapshot();
    void drainAutoBackgroundQueue();
  }

  async function drainAutoBackgroundQueue() {
    if (autoBackgroundRunningRef.current) return;
    autoBackgroundRunningRef.current = true;
    syncImageQueueSnapshot();
    try {
      while (autoBackgroundQueueRef.current.length > 0) {
        const task = autoBackgroundQueueRef.current.shift();
        if (!task) continue;
        syncImageQueueSnapshot();

        // Wait for manual background generation to finish.
        while (backgroundTaskInFlightRef.current) {
          await sleep(250);
        }
        backgroundTaskInFlightRef.current = true;

        const promptRecordId =
          Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const createdAt = Date.now();
        let imagePrompt = "";
        try {
          const imageConfig = await getImageConfig();
          if (!imageConfig.imageApiUrl || !imageConfig.imageModel) {
            continue;
          }

          imagePrompt = await generateImagePrompt(task.summary);
          const uri = await generateImage(imagePrompt);
          const latest = await getStory(task.storyId);
          if (!latest) continue;

          const record: ImagePromptRecord = {
            id: promptRecordId,
            prompt: imagePrompt,
            summary: `[auto:${task.trigger}] ${task.summary}`,
            status: "success",
            createdAt,
            imageUri: uri,
          };
          latest.imagePromptHistory = [
            record,
            ...(latest.imagePromptHistory ?? []),
          ].slice(0, AUTO_IMAGE_HISTORY_LIMIT);
          latest.backgroundImageUri = uri;
          latest.imageGenerationStatus = "success";
          latest.lastImageGenerationAt = Date.now();
          await updateStory(latest);

          if (isMountedRef.current) {
            setStory((prev) => {
              if (!prev || prev.id !== latest.id) return prev;
              return {
                ...prev,
                backgroundImageUri: latest.backgroundImageUri,
                imageGenerationStatus: latest.imageGenerationStatus,
                lastImageGenerationAt: latest.lastImageGenerationAt,
                imagePromptHistory: latest.imagePromptHistory,
              };
            });
            if (storyId === latest.id) {
              setBackgroundImageUri(latest.backgroundImageUri);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "未知错误";
          const latest = await getStory(task.storyId);
          if (latest) {
            const record: ImagePromptRecord = {
              id: promptRecordId,
              prompt: imagePrompt || "[自动背景图提示词生成失败]",
              summary: `[auto:${task.trigger}] ${task.summary}`,
              status: "failed",
              createdAt,
              error: message,
            };
            latest.imagePromptHistory = [
              record,
              ...(latest.imagePromptHistory ?? []),
            ].slice(0, AUTO_IMAGE_HISTORY_LIMIT);
            latest.imageGenerationStatus = "failed";
            latest.lastImageGenerationAt = Date.now();
            await updateStory(latest);

            if (isMountedRef.current) {
              setStory((prev) => {
                if (!prev || prev.id !== latest.id) return prev;
                return {
                  ...prev,
                  imageGenerationStatus: latest.imageGenerationStatus,
                  lastImageGenerationAt: latest.lastImageGenerationAt,
                  imagePromptHistory: latest.imagePromptHistory,
                };
              });
            }
          }
          console.warn("[auto-bg] generation failed:", message);
        } finally {
          backgroundTaskInFlightRef.current = false;
          syncImageQueueSnapshot();
        }
      }
    } finally {
      autoBackgroundRunningRef.current = false;
      syncImageQueueSnapshot();
    }
  }

  function enqueueAutoPortraitGeneration(
    targetStoryId: string,
    cardIds: string[],
  ) {
    if (!targetStoryId || cardIds.length === 0) return;
    for (const cardId of cardIds) {
      const key = buildAutoPortraitKey(targetStoryId, cardId);
      if (
        autoPortraitQueuedRef.current.has(key) ||
        autoPortraitInFlightRef.current.has(key)
      ) {
        continue;
      }
      autoPortraitQueuedRef.current.add(key);
      autoPortraitQueueRef.current.push({ storyId: targetStoryId, cardId });
    }
    syncImageQueueSnapshot();
    void drainAutoPortraitQueue();
  }

  function removeAutoPortraitTask(taskKey: string) {
    if (!autoPortraitQueuedRef.current.has(taskKey)) return;
    autoPortraitQueuedRef.current.delete(taskKey);
    autoPortraitQueueRef.current = autoPortraitQueueRef.current.filter(
      (item) => buildAutoPortraitKey(item.storyId, item.cardId) !== taskKey,
    );
    syncImageQueueSnapshot();
  }

  async function drainAutoPortraitQueue() {
    if (autoPortraitRunningRef.current) return;
    autoPortraitRunningRef.current = true;
    syncImageQueueSnapshot();
    try {
      while (autoPortraitQueueRef.current.length > 0) {
        const task = autoPortraitQueueRef.current.shift();
        if (!task) continue;

        const taskKey = buildAutoPortraitKey(task.storyId, task.cardId);
        autoPortraitQueuedRef.current.delete(taskKey);
        if (autoPortraitInFlightRef.current.has(taskKey)) continue;
        autoPortraitInFlightRef.current.add(taskKey);
        syncImageQueueSnapshot();

        try {
          const imageConfig = await getImageConfig();
          if (!imageConfig.imageApiUrl || !imageConfig.imageModel) {
            continue;
          }

          const latest = await getStory(task.storyId);
          const card = latest?.characterCards.find((c) => c.id === task.cardId);
          if (!latest || !card || card.portraitUri) continue;

          const prompt = await generateCharacterPortraitPrompt({
            ...card,
            gender: card.gender || "未知",
          });
          const uri = await generateImage(prompt);

          const targetStory = await getStory(task.storyId);
          const targetCard = targetStory?.characterCards.find(
            (c) => c.id === task.cardId,
          );
          if (!targetStory || !targetCard || targetCard.portraitUri) continue;

          targetCard.portraitUri = uri;
          await updateStory(targetStory);

          if (isMountedRef.current) {
            setStory((prev) => {
              if (!prev || prev.id !== targetStory.id) return prev;
              return {
                ...prev,
                characterCards: prev.characterCards.map((item) =>
                  item.id === task.cardId
                    ? { ...item, portraitUri: uri }
                    : item,
                ),
              };
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "未知错误";
          console.warn("[auto-portrait] generation failed:", message);
        } finally {
          autoPortraitInFlightRef.current.delete(taskKey);
          syncImageQueueSnapshot();
        }
      }
    } finally {
      autoPortraitRunningRef.current = false;
      syncImageQueueSnapshot();
    }
  }

  async function handleGenerateImage() {
    if (!story || imageGenerating) return;
    if (backgroundTaskInFlightRef.current) {
      Alert.alert("请稍候", "已有背景生图任务在进行中");
      return;
    }
    if (storyGeneratingActive) {
      Alert.alert("请稍候", "剧情生成进行中，请等待完成后再生图");
      return;
    }

    const config = await getImageConfig();
    if (!config.imageApiUrl || !config.imageModel) {
      Alert.alert("未配置生图", "请先在设置中填写图片 API URL 和模型名称");
      return;
    }

    const promptRecordId =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    backgroundTaskInFlightRef.current = true;
    syncImageQueueSnapshot();
    setImageGenerating(true);

    const workingStory =
      (await getStory(story.id)) ??
      ({
        ...story,
        imagePromptHistory: [...(story.imagePromptHistory ?? [])],
      } as Story);
    try {
      workingStory.imageGenerationStatus = "generating";
      await updateStory(workingStory);
      setStory((prev) =>
        prev && prev.id === workingStory.id ? { ...workingStory } : prev,
      );

      const promptSource =
        workingStory.latestGeneratedContext?.trim() ||
        buildImageContextFromSegments(workingStory.segments.slice(-8)) ||
        workingStory.historyContext;
      const imagePrompt = await generateImagePrompt(promptSource);
      const promptRecord: ImagePromptRecord = {
        id: promptRecordId,
        prompt: imagePrompt,
        summary: promptSource,
        status: "pending",
        createdAt: Date.now(),
      };

      workingStory.imagePromptHistory = [
        promptRecord,
        ...(workingStory.imagePromptHistory ?? []),
      ].slice(0, AUTO_IMAGE_HISTORY_LIMIT);
      await updateStory(workingStory);
      setStory((prev) =>
        prev && prev.id === workingStory.id ? { ...workingStory } : prev,
      );

      const uri = await generateImage(imagePrompt);
      const current = workingStory.imagePromptHistory.find(
        (p) => p.id === promptRecordId,
      );
      if (current) {
        current.status = "success";
        current.imageUri = uri;
      }

      workingStory.backgroundImageUri = uri;
      workingStory.imageGenerationStatus = "success";
      workingStory.lastImageGenerationAt = Date.now();

      await updateStory(workingStory);
      setStory((prev) =>
        prev && prev.id === workingStory.id ? { ...workingStory } : prev,
      );
      setBackgroundImageUri(uri);
      Alert.alert("生图完成", "背景图已更新");
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      if (!workingStory.imagePromptHistory)
        workingStory.imagePromptHistory = [];
      const current = workingStory.imagePromptHistory.find(
        (p) => p.id === promptRecordId,
      );
      if (current) {
        current.status = "failed";
        current.error = message;
      }
      workingStory.imageGenerationStatus = "failed";
      workingStory.lastImageGenerationAt = Date.now();
      await updateStory(workingStory);
      setStory((prev) =>
        prev && prev.id === workingStory.id ? { ...workingStory } : prev,
      );
      Alert.alert("生图失败", message);
    } finally {
      setImageGenerating(false);
      backgroundTaskInFlightRef.current = false;
      syncImageQueueSnapshot();
      void drainAutoBackgroundQueue();
    }
  }

  function renderImagePromptHistorySection() {
    const promptHistory = [...(story?.imagePromptHistory ?? [])].reverse();
    return (
      <View style={styles.promptHistorySection}>
        {promptHistory.length === 0 ? (
          <Text style={[styles.promptHistoryEmpty, { color: colors.muted }]}>
            暂无生图记录
          </Text>
        ) : (
          promptHistory.map((item) => (
            <View
              key={item.id}
              style={[styles.promptHistoryItem, { borderColor: colors.border }]}
            >
              <View style={styles.promptHistoryMeta}>
                <Text
                  style={[styles.promptHistoryTime, { color: colors.muted }]}
                >
                  {formatPromptTime(item.createdAt)}
                </Text>
                <Text
                  style={[
                    styles.promptHistoryStatus,
                    {
                      color:
                        item.status === "success"
                          ? "#22c55e"
                          : item.status === "failed"
                            ? "#ef4444"
                            : colors.warning,
                    },
                  ]}
                >
                  {item.status === "success"
                    ? "完成"
                    : item.status === "failed"
                      ? "失败"
                      : "进行中"}
                </Text>
              </View>
              <Text
                style={[
                  styles.promptHistoryPrompt,
                  { color: colors.foreground },
                ]}
              >
                {item.prompt}
              </Text>
              {item.error ? (
                <Text
                  style={[styles.promptHistoryError, { color: colors.error }]}
                >
                  {item.error}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </View>
    );
  }

  function renderSummaryHistorySection() {
    const summaryHistory = [...(story?.summaryHistory ?? [])].reverse();
    return (
      <View style={styles.promptHistorySection}>
        {summaryHistory.length === 0 ? (
          <Text style={[styles.promptHistoryEmpty, { color: colors.muted }]}>
            暂无总结记录
          </Text>
        ) : (
          summaryHistory.map((item) => (
            <View
              key={item.id}
              style={[styles.promptHistoryItem, { borderColor: colors.border }]}
            >
              <View style={styles.promptHistoryMeta}>
                <Text
                  style={[styles.promptHistoryTime, { color: colors.muted }]}
                >
                  {formatPromptTime(item.createdAt)}
                </Text>
                {item.title ? (
                  <Text
                    style={[styles.summaryTitle, { color: colors.foreground }]}
                  >
                    {item.title}
                  </Text>
                ) : null}
              </View>
              {item.involvedCharacters &&
                item.involvedCharacters.length > 0 && (
                  <View style={styles.involvedChipsRow}>
                    {item.involvedCharacters.map((name, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.involvedChip,
                          { backgroundColor: colors.primary + "20" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.involvedChipText,
                            { color: colors.primary },
                          ]}
                        >
                          {name}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              <Text
                style={[
                  styles.promptHistoryPrompt,
                  { color: colors.foreground, lineHeight: 20 },
                ]}
              >
                {item.summary}
              </Text>
            </View>
          ))
        )}
      </View>
    );
  }

  function getCharacterInvolvedEvents(characterName: string): string[] {
    if (!story?.summaryHistory) return [];
    return story.summaryHistory
      .filter((s) => s.involvedCharacters?.includes(characterName))
      .map((s) => s.title || s.summary.slice(0, 15) + "...")
      .filter(Boolean);
  }

  function ensureChoiceSegment(
    segments: StorySegment[],
    fallbackChoiceText?: string,
  ): StorySegment[] {
    const hasChoice = segments.some(
      (segment) =>
        segment.type === "choice" &&
        Array.isArray(segment.choices) &&
        segment.choices.length > 0,
    );
    if (hasChoice) return segments;

    const fallbackChoices = fallbackChoiceText?.trim()
      ? [
          `继续执行「${fallbackChoiceText.trim()}」`,
          "先观察周围情况",
          "与关键人物对话",
        ]
      : ["继续当前行动", "先观察周围情况", "与关键人物对话"];

    return [
      ...segments,
      {
        type: "choice",
        text: "接下来你要怎么做？",
        choices: fallbackChoices,
      },
    ];
  }

  async function handleGeneratePortrait(
    card: CharacterCard & { isProtagonist?: boolean },
  ) {
    if (!story || portraitGenerating) return;
    const portraitTaskKey = buildAutoPortraitKey(story.id, card.id);
    if (autoPortraitInFlightRef.current.has(portraitTaskKey)) {
      Alert.alert("请稍候", `${getCharacterDisplayName(card)} 正在生成形象图`);
      return;
    }
    removeAutoPortraitTask(portraitTaskKey);
    autoPortraitInFlightRef.current.add(portraitTaskKey);
    syncImageQueueSnapshot();
    const config = await getImageConfig();
    if (!config.imageApiUrl || !config.imageModel) {
      autoPortraitInFlightRef.current.delete(portraitTaskKey);
      syncImageQueueSnapshot();
      Alert.alert("未配置生图", "请先在设置中填写图片 API URL 和模型名称");
      return;
    }
    setPortraitGenerating(card.id);
    try {
      const prompt = await generateCharacterPortraitPrompt({
        ...card,
        gender: card.gender || "未知",
      });
      const uri = await generateImage(prompt);
      if (card.isProtagonist) {
        story.protagonistPortraitUri = uri;
        await updateStory(story);
        setStory({ ...story });
      } else {
        const target = story.characterCards.find((c) => c.id === card.id);
        if (target) {
          target.portraitUri = uri;
          await updateStory(story);
          setStory({ ...story });
        }
      }
      Alert.alert(
        "生成完成",
        `${getCharacterDisplayName(card)} 的形象图已生成`,
      );
    } catch (err) {
      Alert.alert("生成失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      autoPortraitInFlightRef.current.delete(portraitTaskKey);
      syncImageQueueSnapshot();
      setPortraitGenerating(null);
      void drainAutoPortraitQueue();
    }
  }

  // Advance to next segment
  function handleTap() {
    if (!story || !currentSegment) return;
    if (hasUsableChoices) return; // Don't advance on actionable choice segments
    if (!done) {
      skip();
      return;
    }
    // Move to next segment
    if (viewIndex < story.segments.length - 1) {
      const next = viewIndex + 1;
      setViewIndex(next);
      void mutateLatestStory(story.id, (draft) => {
        draft.currentIndex = Math.max(
          0,
          Math.min(next, draft.segments.length - 1),
        );
      });
    }
  }

  // Handle player choice — with dice mechanics
  async function handleChoice(choiceText: string, choiceIndex?: number) {
    if (!story || storyGeneratingActive) return;
    if (imageGenerating) {
      Alert.alert("请稍候", "生图进行中，请等待完成后再继续剧情");
      return;
    }
    setCustomInput("");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (story.difficulty === "无随机") {
      // No dice — proceed directly
      await proceedWithChoice(choiceText);
      return;
    }

    // Determine judgment value — null means no dice check needed
    let judgmentValue: number | null = null;
    if (choiceIndex !== undefined) {
      // Preset choice: use the LLM-assigned value (may be null = no check)
      const val = currentSegment?.judgmentValues?.[choiceIndex];
      const raw = typeof val === "number" ? val : null;
      judgmentValue = getAffinityAdjustedJudgment(raw, choiceText);
    } else {
      // Custom action — always request a concrete judgment value
      try {
        judgmentValue = await evaluateCustomAction(
          choiceText,
          story.historyContext,
          story.difficulty,
          story.protagonistName,
          story.protagonistDescription,
        );
        judgmentValue = getAffinityAdjustedJudgment(judgmentValue, choiceText);
      } catch (error) {
        if (isAbortError(error)) return;
        judgmentValue = 4;
      }
    }

    // If no judgment value, skip dice and proceed directly
    if (judgmentValue === null) {
      await proceedWithChoice(choiceText);
      return;
    }

    // Roll dice and show animation
    const roll = rollDice();
    const result = evaluateDiceResult(roll, judgmentValue);
    setDiceResult(result);
    setDiceSettled(false);
    setShowDiceModal(true);
    clearDiceTimers();

    // Animate dice rolling
    diceRollIntervalRef.current = setInterval(() => {
      setDiceDisplayValue(Math.floor(Math.random() * 8) + 1);
    }, 60);

    diceRevealTimeoutRef.current = setTimeout(() => {
      if (diceRollIntervalRef.current) {
        clearInterval(diceRollIntervalRef.current);
        diceRollIntervalRef.current = null;
      }
      setDiceDisplayValue(roll);
      setDiceSettled(true);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          result.outcome === "better"
            ? Haptics.NotificationFeedbackType.Success
            : result.outcome === "worse"
              ? Haptics.NotificationFeedbackType.Error
              : Haptics.NotificationFeedbackType.Warning,
        );
      }
    }, 1200);

    // After showing result, proceed
    diceProceedTimeoutRef.current = setTimeout(() => {
      setShowDiceModal(false);
      proceedWithChoice(choiceText, result);
    }, 2500);
  }

  async function proceedWithChoice(choiceText: string, dice?: DiceResult) {
    if (!story) return;
    const workingStory =
      (await getStory(story.id)) ??
      ({
        ...story,
        segments: [...story.segments],
        characterCards: story.characterCards.map((card) => ({ ...card })),
      } as Story);
    const targetStoryId = workingStory.id;
    const token = generationTokenRef.current + 1;
    generationTokenRef.current = token;
    const abortController = new AbortController();
    storyGenerationControllers.set(targetStoryId, abortController);
    generationAbortRef.current = abortController;
    const historyBeforeChoice = workingStory.historyContext;

    // Add a narration segment for the choice made
    const diceInfo = dice ? ` [🎲 ${dice.roll}/${dice.judgmentValue}]` : "";
    const choiceRecord: StorySegment = {
      type: "choice",
      text: `你选择了：「${choiceText}」${diceInfo}`,
      choices: [choiceText],
      diceResult: dice,
    };
    workingStory.segments.push(choiceRecord);
    const affinityResult = applyAffinityFromChoice(choiceText, dice?.outcome);
    showAffinityToast(affinityResult.toastText);
    setLastAffinityDebug(affinityResult.debugText);
    const fullHistory = buildFullHistoryContext(workingStory.segments);
    const latestHistoryContext = buildHistoryContext(
      workingStory.segments,
      workingStory.storySummary,
    );
    const preContinueSummaryTask = createSummaryCompressionTask(workingStory);

    setGenerating(true);
    workingStory.storyGenerationStatus = "generating";
    workingStory.storyGenerationStartedAt =
      workingStory.storyGenerationStartedAt || Date.now();
    workingStory.lastStoryGenerationError = "";
    await updateStory(workingStory);
    if (canUpdateGenerationUI(targetStoryId, token)) {
      setStory({ ...workingStory });
    }
    const requestStartedAt = Date.now();
    try {
      const diceOutcomeCtx = dice
        ? buildDiceOutcomeContext(dice, workingStory.difficulty, choiceText)
        : undefined;
      const trimmedHistory = latestHistoryContext.trim();
      const rawChars = fullHistory.trim().length;
      setLastSentContextMetrics({
        fullChars: fullHistory.length,
        rawChars,
        sentChars: rawChars,
        truncated: false,
        pacing: workingStory.currentPacing,
        minCharsTarget: PACE_MIN_CHARS[workingStory.currentPacing],
        generatedChars: 0,
        durationMs: null,
        at: requestStartedAt,
      });

      const result = await continueStory(
        {
          title: workingStory.title,
          genre: workingStory.genre,
          premise: workingStory.premise,
          history: latestHistoryContext,
          choiceText,
          protagonistName: workingStory.protagonistName ?? "",
          protagonistDescription: workingStory.protagonistDescription ?? "",
          protagonistAppearance: workingStory.protagonistAppearance ?? "",
          difficulty: workingStory.difficulty,
          pacing: workingStory.currentPacing,
          characterCards: workingStory.characterCards,
          continuationFeedback: getRecentContinuationFeedback(workingStory),
          diceOutcomeContext: diceOutcomeCtx,
        },
        { signal: abortController.signal, timeoutMs: null },
      );

      const generatedSegments = Array.isArray(result.segments)
        ? (result.segments as StorySegment[])
        : [];
      const newSegments = ensureChoiceSegment(generatedSegments, choiceText);
      workingStory.segments.push(...newSegments);
      workingStory.currentPacing = result.pacing;
      workingStory.lastGeneratedChars = result.generatedChars;
      workingStory.latestGeneratedContext =
        buildImageContextFromSegments(newSegments);
      const newIndex = workingStory.segments.length - newSegments.length;
      workingStory.currentIndex = newIndex;

      // Process new characters
      const newCharacterCardIds = processNewCharacters(
        workingStory,
        result.newCharacters,
      );
      await applyAIInitialAffinityForNewCharacters(
        workingStory,
        result.newCharacters,
      );
      applyAutoRevealByStableRealName(workingStory);

      // Increment choice counter
      workingStory.choiceCount = (workingStory.choiceCount ?? 0) + 1;
      workingStory.storyGenerationStatus = "idle";
      workingStory.storyGenerationStartedAt = 0;
      workingStory.lastStoryGenerationError = "";

      await updateStory(workingStory);
      if (canUpdateGenerationUI(targetStoryId, token)) {
        if (workingStory.historyContext === historyBeforeChoice) {
          setHistoryStuckCount((count) => count + 1);
        } else {
          setHistoryStuckCount(0);
        }
        setStory({ ...workingStory });
        setViewIndex(newIndex);
      }
      enqueueAutoPortraitGeneration(workingStory.id, newCharacterCardIds);
      void triggerAutoBackgroundOnChoiceProgress(workingStory.id, choiceText);
      void (async () => {
        const evaluation = await evaluateContinuationQuality({
          title: workingStory.title,
          genre: workingStory.genre,
          premise: workingStory.premise,
          historyBefore: latestHistoryContext,
          generatedSegments: newSegments,
        });
        if (!evaluation || !evaluation.advice.trim()) return;

        const feedbackLine = formatContinuationEvaluationLine({
          score: evaluation.score,
          advice: evaluation.advice,
          issues: evaluation.issues,
        });
        const latest = await getStory(workingStory.id);
        if (!latest) return;
        const record = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          content: feedbackLine,
          createdAt: Date.now(),
        };
        latest.continuationFeedbackHistory = [
          record,
          ...(latest.continuationFeedbackHistory ?? []),
        ].slice(0, 20);
        await updateStory(latest);
        if (
          isMountedRef.current &&
          generationTokenRef.current === token &&
          activeStoryIdRef.current === latest.id
        ) {
          setStory((prev) => {
            if (!prev || prev.id !== latest.id) return prev;
            return {
              ...prev,
              continuationFeedbackHistory: latest.continuationFeedbackHistory,
            };
          });
        }
      })();

      if (preContinueSummaryTask) {
        void applySummaryCompressionTask(
          workingStory.id,
          preContinueSummaryTask,
          "continue-summary",
        );
      } else {
        const postContinueSummaryTask =
          createSummaryCompressionTask(workingStory);
        if (postContinueSummaryTask) {
          void applySummaryCompressionTask(
            workingStory.id,
            postContinueSummaryTask,
            "continue-summary",
          );
        }
      }
    } catch (err) {
      const cancelled = isAbortError(err);
      if (!cancelled) {
        console.error("Continue failed:", err);
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      workingStory.segments.pop();
      workingStory.storyGenerationStatus = cancelled ? "idle" : "failed";
      workingStory.storyGenerationStartedAt = 0;
      workingStory.lastStoryGenerationError = cancelled ? "" : message;
      await updateStory(workingStory);
      if (canUpdateGenerationUI(targetStoryId, token)) {
        setStory({ ...workingStory });
        if (!cancelled) {
          Alert.alert("生成失败", message);
        }
      }
    } finally {
      setLastSentContextMetrics((prev) =>
        prev.at === requestStartedAt
          ? {
              ...prev,
              pacing: workingStory.currentPacing,
              minCharsTarget: PACE_MIN_CHARS[workingStory.currentPacing],
              generatedChars: workingStory.lastGeneratedChars,
              durationMs: Date.now() - requestStartedAt,
            }
          : prev,
      );
      if (generationAbortRef.current === abortController) {
        generationAbortRef.current = null;
      }
      if (storyGenerationControllers.get(targetStoryId) === abortController) {
        storyGenerationControllers.delete(targetStoryId);
      }
      if (generationTokenRef.current === token && isMountedRef.current) {
        setGenerating(false);
      }
    }
  }

  function handleBack() {
    if (story) {
      void mutateLatestStory(story.id, (draft) => {
        draft.currentIndex = Math.max(
          0,
          Math.min(viewIndex, draft.segments.length - 1),
        );
      });
    }
    router.back();
  }

  function toggleAutoRead() {
    setAutoReadEnabled((prev) => !prev);
  }

  function cycleAutoReadSpeed() {
    setAutoReadSpeedIndex((prev) => (prev + 1) % AUTO_READ_SPEEDS.length);
  }

  // ─── Render ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            加载中...
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.flex}>
        {backgroundImageUri ? (
          <ImageBackground
            source={{ uri: backgroundImageUri }}
            style={styles.fullScreenBackground}
            imageStyle={[
              styles.sceneBackgroundImage,
              { transform: [{ scale: backgroundScalePercent / 100 }] },
            ]}
          >
            <View style={styles.fullScreenBackgroundOverlay} />
          </ImageBackground>
        ) : null}

        {/* Scene Area */}
        <View
          style={[
            styles.sceneArea,
            !backgroundImageUri && { backgroundColor: colors.background },
          ]}
        >
          {/* Top bar */}
          <View style={styles.topBar}>
            <View style={styles.topBarLeft}>
              <TouchableOpacity
                onPress={handleBack}
                style={styles.topBarButton}
                activeOpacity={0.7}
              >
                <IconSymbol
                  name="arrow.left"
                  size={22}
                  color={backgroundImageUri ? "#fff" : colors.foreground}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={toggleAutoRead}
                style={[
                  styles.autoReadToggle,
                  autoReadEnabled && styles.autoReadToggleActive,
                  {
                    borderColor: backgroundImageUri
                      ? "rgba(255,255,255,0.5)"
                      : colors.border,
                    backgroundColor: autoReadEnabled
                      ? colors.primary
                      : backgroundImageUri
                        ? "rgba(255,255,255,0.12)"
                        : colors.surface,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.autoReadToggleText,
                    {
                      color: autoReadEnabled
                        ? "#fff"
                        : backgroundImageUri
                          ? "#fff"
                          : colors.foreground,
                    },
                  ]}
                >
                  {">>"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={cycleAutoReadSpeed}
                style={[
                  styles.autoReadSpeedButton,
                  {
                    borderColor: backgroundImageUri
                      ? "rgba(255,255,255,0.45)"
                      : colors.border,
                    backgroundColor: backgroundImageUri
                      ? "rgba(255,255,255,0.1)"
                      : colors.surface,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.autoReadSpeedText,
                    {
                      color: autoReadEnabled
                        ? backgroundImageUri
                          ? "#fff"
                          : colors.primary
                        : backgroundImageUri
                          ? "rgba(255,255,255,0.9)"
                          : colors.muted,
                    },
                  ]}
                >
                  {autoReadSpeed}x
                </Text>
              </TouchableOpacity>
            </View>
            <Text
              style={[
                styles.storyTitle,
                { color: backgroundImageUri ? "#fff" : colors.foreground },
              ]}
              numberOfLines={1}
            >
              {story?.title}
            </Text>
            <View style={styles.topBarActions}>
              <TouchableOpacity
                onPress={handleGenerateImage}
                style={[
                  styles.imageButton,
                  {
                    borderColor:
                      (backgroundImageUri ? "#ffffff" : colors.primary) + "80",
                    backgroundColor: backgroundImageUri
                      ? "rgba(255,255,255,0.12)"
                      : colors.primary + "18",
                  },
                ]}
                activeOpacity={0.8}
                disabled={imageGenerating || storyGeneratingActive}
              >
                {imageGenerating ? (
                  <ActivityIndicator
                    size="small"
                    color={backgroundImageUri ? "#fff" : colors.primary}
                  />
                ) : (
                  <Text
                    style={[
                      styles.imageButtonText,
                      { color: backgroundImageUri ? "#fff" : colors.primary },
                    ]}
                  >
                    生图
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowMenu(true)}
                style={styles.topBarButton}
                activeOpacity={0.7}
              >
                <IconSymbol
                  name="ellipsis"
                  size={22}
                  color={backgroundImageUri ? "#fff" : colors.foreground}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.imageStatusContainer}>
            <Text
              style={[
                styles.imageStatusText,
                {
                  color: backgroundImageUri
                    ? "rgba(255,255,255,0.92)"
                    : colors.muted,
                },
              ]}
            >
              {getImageStatusLabel()}
            </Text>
            <TouchableOpacity
              onPress={() => setShowImageQueue(true)}
              style={[
                styles.imageQueueButton,
                {
                  borderColor: backgroundImageUri
                    ? "rgba(255,255,255,0.4)"
                    : colors.primary + "66",
                  backgroundColor: backgroundImageUri
                    ? "rgba(255,255,255,0.12)"
                    : colors.primary + "14",
                },
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.imageQueueButtonText,
                  { color: backgroundImageUri ? "#fff" : colors.primary },
                ]}
              >
                生图队列 ·
                {imageQueuePendingCount > 0
                  ? ` 待处理 ${imageQueuePendingCount}`
                  : imageQueueRunningCount > 0
                    ? ` 处理中 ${imageQueueRunningCount}`
                    : " 空闲"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Scene decoration */}
          <View
            style={styles.sceneDecoration}
            onTouchEnd={handleSceneDecorationTap}
          >
            <View
              style={[
                styles.sceneLine,
                { backgroundColor: colors.primary + "20" },
              ]}
            />
            <View
              style={[
                styles.sceneDot,
                { backgroundColor: colors.primary + "40" },
              ]}
            />
            <View
              style={[
                styles.sceneLine2,
                { backgroundColor: colors.primary + "15" },
              ]}
            />
          </View>
        </View>

        {/* Dialogue Area */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleTap}
          style={[styles.dialogueArea, { backgroundColor: "rgba(0,0,0,0.55)" }]}
        >
          {affinityToastText ? (
            <View style={styles.affinityToast}>
              <Text style={styles.affinityToastText}>{affinityToastText}</Text>
            </View>
          ) : null}
          {storyGeneratingActive ? (
            <View style={styles.generatingContainer}>
              <View style={styles.generatingStatusRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.generatingText, { color: colors.muted }]}>
                  {`剧情生成中... 已生成 ${generationElapsedSeconds} 秒`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={cancelStoryGeneration}
                style={[
                  styles.generatingCancelButton,
                  {
                    borderColor: colors.primary + "90",
                    backgroundColor: colors.surface + "66",
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.generatingCancelText,
                    { color: colors.primary },
                  ]}
                >
                  取消生成
                </Text>
              </TouchableOpacity>
            </View>
          ) : currentSegment ? (
            <View style={styles.dialogueContent}>
              {/* Character name */}
              {currentSegment.type === "dialogue" &&
                currentSegment.character && (
                  <Animated.View entering={FadeIn.duration(200)}>
                    <View style={styles.dialogueCharacterRow}>
                      {getCardPortraitByName(currentSegment.character) ? (
                        <TouchableOpacity
                          onLongPress={() => showScalePanel("character")}
                          activeOpacity={0.9}
                        >
                          <ImageBackground
                            source={{
                              uri: getCardPortraitByName(
                                currentSegment.character,
                              ),
                            }}
                            style={[
                              styles.dialoguePortrait,
                              {
                                width: getScaledSize(56),
                                height: getScaledSize(56),
                              },
                            ]}
                            imageStyle={{ borderRadius: 10 }}
                          />
                        </TouchableOpacity>
                      ) : null}
                      <Text
                        style={[
                          styles.characterName,
                          { color: colors.primary },
                        ]}
                      >
                        {getDisplayedSegmentCharacterName(
                          currentSegment.character,
                        )}
                      </Text>
                    </View>
                  </Animated.View>
                )}
              {currentSegment.type === "narration" && (
                <Animated.View entering={FadeIn.duration(200)}>
                  <Text
                    style={[styles.narrationLabel, { color: colors.muted }]}
                  >
                    ——
                  </Text>
                </Animated.View>
              )}

              {/* Text content */}
              {!isChoice && (
                <Text
                  style={[
                    currentSegment.type === "narration"
                      ? styles.narrationText
                      : styles.dialogueText,
                    {
                      color:
                        currentSegment.type === "narration"
                          ? "#c0c0d0"
                          : "#eaeaea",
                    },
                  ]}
                >
                  {displayed}
                  {!done && <Text style={{ color: colors.primary }}>▌</Text>}
                </Text>
              )}

              {/* Choices */}
              {hasUsableChoices && currentSegment.choices && (
                <View style={styles.choicesContainer}>
                  <Text style={[styles.choicePrompt, { color: colors.muted }]}>
                    {currentSegment.text}
                  </Text>

                  {/* Custom action button — keep pinned at top */}
                  <Animated.View entering={FadeInDown.delay(60).duration(280)}>
                    <TouchableOpacity
                      onPress={() => setShowCustomInputModal(true)}
                      style={[
                        styles.choiceButton,
                        {
                          borderColor: colors.primary + "60",
                          backgroundColor: colors.surface + "30",
                          borderStyle: "dashed" as const,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.choiceText, { color: colors.muted }]}
                      >
                        输入自定义行动...
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>

                  <ScrollView
                    style={styles.choiceListScroll}
                    contentContainerStyle={styles.choiceListContent}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                  >
                    {currentSegment.choices.map((choice, idx) =>
                      (() => {
                        const rawJudge =
                          typeof currentSegment.judgmentValues?.[idx] ===
                          "number"
                            ? (currentSegment.judgmentValues?.[idx] as number)
                            : null;
                        const adjustedJudge = getAffinityAdjustedJudgment(
                          rawJudge,
                          choice,
                        );
                        return (
                          <Animated.View
                            key={idx}
                            entering={FadeInDown.delay(idx * 100).duration(300)}
                          >
                            <TouchableOpacity
                              onPress={() => confirmChoice(choice, idx)}
                              style={[
                                styles.choiceButton,
                                {
                                  borderColor: colors.primary + "80",
                                  backgroundColor: colors.surface + "60",
                                },
                              ]}
                              activeOpacity={0.7}
                            >
                              <View style={styles.choiceRow}>
                                <Text
                                  style={[
                                    styles.choiceText,
                                    { color: colors.foreground, flex: 1 },
                                  ]}
                                >
                                  {choice}
                                </Text>
                                {story?.difficulty !== "无随机" &&
                                  typeof adjustedJudge === "number" && (
                                    <Text
                                      style={[
                                        styles.judgmentBadge,
                                        { color: colors.muted },
                                      ]}
                                    >
                                      难度{adjustedJudge}
                                    </Text>
                                  )}
                              </View>
                            </TouchableOpacity>
                          </Animated.View>
                        );
                      })(),
                    )}
                  </ScrollView>
                </View>
              )}

              {/* Tap indicator */}
              {done && !isChoice && (
                <Animated.View
                  entering={FadeIn.delay(300).duration(500)}
                  style={styles.tapIndicator}
                >
                  <Text style={[styles.tapText, { color: colors.muted }]}>
                    ▼ 点击继续
                  </Text>
                </Animated.View>
              )}
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {scalePanelVisible ? (
        <View style={styles.scalePanelAnchor} pointerEvents="box-none">
          <View style={styles.scalePanelCard}>
            <View style={styles.scalePanelTabs}>
              <TouchableOpacity
                onPress={() => showScalePanel("background")}
                style={[
                  styles.scalePanelTab,
                  scalePanelMode === "background" && styles.scalePanelTabActive,
                ]}
                activeOpacity={0.85}
              >
                <Text style={styles.scalePanelTabText}>背景</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => showScalePanel("character")}
                style={[
                  styles.scalePanelTab,
                  scalePanelMode === "character" && styles.scalePanelTabActive,
                ]}
                activeOpacity={0.85}
              >
                <Text style={styles.scalePanelTabText}>人物</Text>
              </TouchableOpacity>
            </View>

            <View
              style={styles.scalePanelTrack}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(event) => {
                applyScaleFromTrack(
                  scalePanelMode,
                  event.nativeEvent.locationY,
                );
              }}
              onResponderMove={(event) => {
                applyScaleFromTrack(
                  scalePanelMode,
                  event.nativeEvent.locationY,
                );
              }}
            >
              <View
                style={[
                  styles.scalePanelThumb,
                  {
                    bottom:
                      ((getScalePercentByMode(scalePanelMode) - 50) / 100) *
                      (BG_SCALE_TRACK_HEIGHT - 14),
                  },
                ]}
              />
            </View>

            <Text style={styles.scalePanelValue}>
              {getScalePercentByMode(scalePanelMode)}%
            </Text>

            <View style={styles.scalePanelQuickRow}>
              {BG_SCALE_PRESETS.map((value) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => updateScaleByMode(scalePanelMode, value)}
                  style={[
                    styles.scalePanelQuickItem,
                    value === getScalePercentByMode(scalePanelMode) &&
                      styles.scalePanelQuickItemActive,
                  ]}
                  activeOpacity={0.85}
                >
                  <Text style={styles.scalePanelQuickText}>{value}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {/* Menu Modal */}
      <Modal visible={showMenu} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View
            style={[styles.menuContainer, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.menuTitle, { color: colors.foreground }]}>
              菜单
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowMenu(false);
                setShowHistory(true);
              }}
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              activeOpacity={0.7}
            >
              <IconSymbol
                name="list.bullet"
                size={20}
                color={colors.foreground}
              />
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>
                历史对话
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowMenu(false);
                setShowCharacterCards(true);
              }}
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              activeOpacity={0.7}
            >
              <IconSymbol
                name="person.2.fill"
                size={20}
                color={colors.foreground}
              />
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>
                角色卡片 ({story?.characterCards?.length ?? 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowMenu(false);
                setShowSummaryHistory(true);
              }}
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              activeOpacity={0.7}
            >
              <IconSymbol
                name="text.bubble.fill"
                size={20}
                color={colors.foreground}
              />
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>
                故事总结 ({story?.summaryHistory?.length ?? 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowMenu(false);
                setShowPromptHistory(true);
              }}
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              activeOpacity={0.7}
            >
              <IconSymbol
                name="photo.on.rectangle"
                size={20}
                color={colors.foreground}
              />
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>
                历史生图提示词 ({story?.imagePromptHistory?.length ?? 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowMenu(false);
                handleBack();
              }}
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              activeOpacity={0.7}
            >
              <IconSymbol
                name="arrow.left"
                size={20}
                color={colors.foreground}
              />
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>
                返回首页
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowMenu(false)}
              style={styles.menuItem}
              activeOpacity={0.7}
            >
              <IconSymbol name="xmark" size={20} color={colors.muted} />
              <Text style={[styles.menuItemText, { color: colors.muted }]}>
                关闭
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Dice Roll Modal */}
      <Modal visible={showDiceModal} transparent animationType="fade">
        <View style={styles.diceModalOverlay}>
          <View style={styles.diceModalContent}>
            <Text style={styles.diceLabel}>
              {diceSettled ? "判定结果" : "掷骰中..."}
            </Text>
            <Text style={styles.diceNumber}>{diceDisplayValue}</Text>
            {diceSettled && diceResult && (
              <>
                <Text style={styles.diceJudgment}>
                  判定值: {diceResult.judgmentValue}
                </Text>
                <Text
                  style={[
                    styles.diceOutcome,
                    {
                      color:
                        diceResult.outcome === "better"
                          ? "#22c55e"
                          : diceResult.outcome === "worse"
                            ? "#ef4444"
                            : "#eab308",
                    },
                  ]}
                >
                  {diceResult.outcome === "better"
                    ? "超越预期!"
                    : diceResult.outcome === "exact"
                      ? "恰好达成"
                      : "未达预期..."}
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Custom Action Input Modal */}
      <Modal visible={showCustomInputModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.customModalContainer}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              setShowCustomInputModal(false);
            }}
            style={{ flex: 1 }}
          />
          <View
            style={[
              styles.customModalContent,
              { backgroundColor: colors.surface },
            ]}
          >
            <Text
              style={[styles.customModalTitle, { color: colors.foreground }]}
            >
              自定义行动
            </Text>
            <TextInput
              style={[
                styles.customModalInput,
                {
                  color: colors.foreground,
                  borderColor: colors.primary,
                  backgroundColor: colors.background,
                },
              ]}
              placeholder="描述你想做的事情..."
              placeholderTextColor={colors.muted}
              value={customInput}
              onChangeText={setCustomInput}
              multiline
              numberOfLines={4}
              autoFocus
              textAlignVertical="top"
            />
            <View style={styles.customModalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setShowCustomInputModal(false);
                }}
                style={[
                  styles.customModalCancel,
                  { borderColor: colors.border },
                ]}
                activeOpacity={0.7}
              >
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                  取消
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (customInput.trim()) {
                    setShowCustomInputModal(false);
                    confirmChoice(customInput.trim());
                    setCustomInput("");
                  }
                }}
                disabled={!customInput.trim()}
                style={[
                  styles.customModalConfirm,
                  {
                    backgroundColor: customInput.trim()
                      ? colors.primary
                      : colors.surface,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    color: customInput.trim() ? "#fff" : colors.muted,
                    fontWeight: "600",
                  }}
                >
                  确认行动
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Choice Confirm Modal */}
      <Modal visible={showChoiceConfirmModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.menuContainer,
              { backgroundColor: colors.surface, width: 320 },
            ]}
          >
            <Text style={[styles.menuTitle, { color: colors.foreground }]}>
              确认选择
            </Text>
            <Text
              style={[styles.choiceConfirmText, { color: colors.foreground }]}
            >
              {pendingChoice?.text || ""}
            </Text>
            <View style={styles.customModalButtons}>
              <TouchableOpacity
                onPress={cancelChoiceConfirm}
                style={[
                  styles.customModalCancel,
                  { borderColor: colors.border },
                ]}
              >
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                  取消
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitChoiceConfirm}
                style={[
                  styles.customModalConfirm,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>确认</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Character Cards Modal */}
      <Modal visible={showCharacterCards} transparent animationType="slide">
        <View
          style={[styles.historyModal, { backgroundColor: colors.background }]}
        >
          <View
            style={[styles.historyHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.historyTitle, { color: colors.foreground }]}>
              角色卡片 ({displayCards.length})
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowCharacterCards(false);
                setEditingCard(null);
              }}
              activeOpacity={0.7}
            >
              <IconSymbol name="xmark" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={displayCards}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.historyList}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                暂无角色卡片，随着剧情推进会自动生成
              </Text>
            }
            renderItem={({ item }) => {
              const isProtagonist = (item as any).isProtagonist === true;
              const involvedEvents = getCharacterInvolvedEvents(item.name);
              return (
                <View
                  style={[styles.characterCard, { borderColor: colors.border }]}
                >
                  {editingCard?.id === item.id && !isProtagonist ? (
                    // Edit mode
                    <View style={{ gap: 10 }}>
                      <View style={styles.characterCardHeader}>
                        <Text
                          style={[
                            styles.cardCharName,
                            { color: colors.primary },
                          ]}
                        >
                          {getCharacterDisplayName(item)}
                        </Text>
                        <Text
                          style={[
                            styles.characterGender,
                            { color: colors.muted },
                          ]}
                        >
                          {item.gender}
                        </Text>
                      </View>
                      <Text
                        style={[styles.characterField, { color: colors.muted }]}
                      >
                        外貌：
                      </Text>
                      <TextInput
                        style={[
                          styles.customModalInput,
                          {
                            color: colors.foreground,
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                            minHeight: 60,
                          },
                        ]}
                        value={editAppearance}
                        onChangeText={setEditAppearance}
                        multiline
                        textAlignVertical="top"
                      />
                      <Text
                        style={[styles.characterField, { color: colors.muted }]}
                      >
                        性格：
                      </Text>
                      <TextInput
                        style={[
                          styles.customModalInput,
                          {
                            color: colors.foreground,
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                            minHeight: 80,
                          },
                        ]}
                        value={editPersonality}
                        onChangeText={setEditPersonality}
                        multiline
                        textAlignVertical="top"
                      />
                      <Text
                        style={[styles.characterField, { color: colors.muted }]}
                      >
                        背景：
                      </Text>
                      <TextInput
                        style={[
                          styles.customModalInput,
                          {
                            color: colors.foreground,
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                            minHeight: 60,
                          },
                        ]}
                        value={editBackground}
                        onChangeText={setEditBackground}
                        multiline
                        textAlignVertical="top"
                      />
                      <View style={styles.customModalButtons}>
                        <TouchableOpacity
                          onPress={() => setEditingCard(null)}
                          style={[
                            styles.customModalCancel,
                            { borderColor: colors.border },
                          ]}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={{
                              color: colors.foreground,
                              fontWeight: "600",
                            }}
                          >
                            取消
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            if (story) {
                              const card = story.characterCards.find(
                                (c) => c.id === item.id,
                              );
                              if (card) {
                                card.appearance = editAppearance;
                                card.personality = editPersonality;
                                card.background = editBackground;
                                updateStory(story);
                                setStory({ ...story });
                              }
                            }
                            setEditingCard(null);
                          }}
                          style={[
                            styles.customModalConfirm,
                            { backgroundColor: colors.primary },
                          ]}
                          activeOpacity={0.7}
                        >
                          <Text style={{ color: "#fff", fontWeight: "600" }}>
                            保存
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    // View mode
                    <>
                      <View
                        style={[
                          styles.characterCardTop,
                          !isProtagonist && styles.characterCardTopRight,
                        ]}
                      >
                        {/* Portrait */}
                        <TouchableOpacity
                          onPress={() => {
                            if (!item.portraitUri) return;
                            setPortraitPreview({
                              uri: item.portraitUri,
                              name: getCharacterDisplayName(item),
                            });
                          }}
                          onLongPress={() => showScalePanel("character")}
                          disabled={portraitGenerating === item.id}
                          activeOpacity={0.7}
                        >
                          {item.portraitUri ? (
                            <ImageBackground
                              source={{ uri: item.portraitUri }}
                              style={[
                                styles.portraitImage,
                                {
                                  width: getScaledSize(60),
                                  height: getScaledSize(60),
                                },
                              ]}
                              imageStyle={{ borderRadius: 10 }}
                            />
                          ) : (
                            <View
                              style={[
                                styles.portraitPlaceholder,
                                {
                                  borderColor: colors.border,
                                  backgroundColor: colors.surface,
                                },
                              ]}
                            >
                              {portraitGenerating === item.id ? (
                                <ActivityIndicator
                                  size="small"
                                  color={colors.primary}
                                />
                              ) : (
                                <IconSymbol
                                  name="person.fill"
                                  size={24}
                                  color={colors.muted}
                                />
                              )}
                            </View>
                          )}
                        </TouchableOpacity>
                        <View
                          style={[
                            styles.characterCardInfo,
                            !isProtagonist && styles.characterCardInfoRight,
                          ]}
                        >
                          <View style={styles.characterCardHeader}>
                            <Text
                              style={[
                                styles.cardCharName,
                                { color: colors.primary },
                              ]}
                            >
                              {getCharacterDisplayName(item)}
                              {isProtagonist ? " · 主角" : ""}
                            </Text>
                            <Text
                              style={[
                                styles.characterGender,
                                { color: colors.muted },
                              ]}
                            >
                              {item.gender}
                            </Text>
                            <Text
                              style={[
                                styles.characterGender,
                                { color: colors.primary, marginLeft: 8 },
                              ]}
                            >
                              好感度 {item.affinity}/100
                            </Text>
                          </View>
                          {item.appearance ? (
                            <Text
                              style={[
                                styles.characterField,
                                { color: colors.foreground },
                              ]}
                            >
                              外貌：{item.appearance}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.characterField,
                          { color: colors.foreground },
                        ]}
                      >
                        性格：
                        {isProtagonist
                          ? item.personality
                          : getUnlockedTextByAffinity(
                              item.personality,
                              item.affinity,
                            )}
                      </Text>
                      <Text
                        style={[styles.characterField, { color: colors.muted }]}
                      >
                        背景：
                        {isProtagonist
                          ? item.background
                          : getUnlockedTextByAffinity(
                              item.background,
                              item.affinity,
                            )}
                      </Text>
                      {involvedEvents.length > 0 && (
                        <View style={styles.involvedEventsSection}>
                          <Text
                            style={[
                              styles.characterField,
                              { color: colors.muted },
                            ]}
                          >
                            已参与事件：
                          </Text>
                          <View style={styles.involvedChipsRow}>
                            {involvedEvents.map((evt, idx) => (
                              <View
                                key={idx}
                                style={[
                                  styles.involvedEventTag,
                                  { backgroundColor: colors.primary + "15" },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.involvedEventText,
                                    { color: colors.primary },
                                  ]}
                                >
                                  {evt}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
                      <View style={styles.characterCardActions}>
                        <TouchableOpacity
                          onPress={() => handleGeneratePortrait(item)}
                          disabled={portraitGenerating === item.id}
                        >
                          <Text
                            style={{ color: colors.primary, fontWeight: "600" }}
                          >
                            {portraitGenerating === item.id
                              ? "生成中..."
                              : item.portraitUri
                                ? "重新生成形象"
                                : "生成形象"}
                          </Text>
                        </TouchableOpacity>
                        {!isProtagonist && (
                          <TouchableOpacity
                            onPress={() => {
                              setEditingCard(item);
                              setEditAppearance(item.appearance || "");
                              setEditPersonality(item.personality);
                              setEditBackground(item.background);
                            }}
                          >
                            <Text
                              style={{
                                color: colors.primary,
                                fontWeight: "600",
                              }}
                            >
                              编辑
                            </Text>
                          </TouchableOpacity>
                        )}
                        {!isProtagonist && (
                          <TouchableOpacity
                            onPress={() => {
                              Alert.alert(
                                "删除角色",
                                `确定删除「${getCharacterDisplayName(item)}」的角色卡片吗？`,
                                [
                                  { text: "取消", style: "cancel" },
                                  {
                                    text: "删除",
                                    style: "destructive",
                                    onPress: () => {
                                      if (story) {
                                        void mutateLatestStory(
                                          story.id,
                                          (draft) => {
                                            draft.characterCards =
                                              draft.characterCards.filter(
                                                (c) => c.id !== item.id,
                                              );
                                          },
                                        ).then((updated) => {
                                          if (!updated) return;
                                          setStory((prev) =>
                                            prev && prev.id === updated.id
                                              ? { ...updated }
                                              : prev,
                                          );
                                        });
                                      }
                                    },
                                  },
                                ],
                              );
                            }}
                          >
                            <Text
                              style={{ color: "#ef4444", fontWeight: "600" }}
                            >
                              删除
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  )}
                </View>
              );
            }}
          />
        </View>
      </Modal>

      {/* Portrait Preview Modal */}
      <Modal
        visible={!!portraitPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setPortraitPreview(null)}
      >
        <TouchableOpacity
          style={styles.portraitPreviewOverlay}
          activeOpacity={1}
          onPress={() => setPortraitPreview(null)}
        >
          <View style={styles.portraitPreviewContent}>
            {portraitPreview?.name ? (
              <Text
                style={[
                  styles.portraitPreviewName,
                  { color: colors.foreground },
                ]}
              >
                {portraitPreview.name}
              </Text>
            ) : null}
            {portraitPreview?.uri ? (
              <Image
                source={{ uri: portraitPreview.uri }}
                style={[
                  styles.portraitPreviewImage,
                  { maxWidth: Math.round(420 * characterScaleFactor) },
                ]}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* History Modal */}
      <Modal visible={showPromptHistory} transparent animationType="slide">
        <View
          style={[styles.historyModal, { backgroundColor: colors.background }]}
        >
          <View
            style={[styles.historyHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.historyTitle, { color: colors.foreground }]}>
              历史生图提示词
            </Text>
            <TouchableOpacity
              onPress={() => setShowPromptHistory(false)}
              activeOpacity={0.7}
            >
              <IconSymbol name="xmark" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={promptHistoryScrollRef}
            contentContainerStyle={styles.historyList}
            onContentSizeChange={() => {
              if (showPromptHistory) {
                promptHistoryScrollRef.current?.scrollToEnd({
                  animated: false,
                });
              }
            }}
          >
            {renderImagePromptHistorySection()}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showSummaryHistory} transparent animationType="slide">
        <View
          style={[styles.historyModal, { backgroundColor: colors.background }]}
        >
          <View
            style={[styles.historyHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.historyTitle, { color: colors.foreground }]}>
              故事总结
            </Text>
            <TouchableOpacity
              onPress={() => setShowSummaryHistory(false)}
              activeOpacity={0.7}
            >
              <IconSymbol name="xmark" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={summaryHistoryScrollRef}
            contentContainerStyle={styles.historyList}
            onContentSizeChange={() => {
              if (showSummaryHistory) {
                summaryHistoryScrollRef.current?.scrollToEnd({
                  animated: false,
                });
              }
            }}
          >
            {renderSummaryHistorySection()}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showImageQueue} transparent animationType="slide">
        <View
          style={[styles.historyModal, { backgroundColor: colors.background }]}
        >
          <View
            style={[styles.historyHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.historyTitle, { color: colors.foreground }]}>
              生图队列
            </Text>
            <TouchableOpacity
              onPress={() => setShowImageQueue(false)}
              activeOpacity={0.7}
            >
              <IconSymbol name="xmark" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.historyList}>
            <View style={styles.imageQueueSummaryRow}>
              <View
                style={[
                  styles.imageQueueSummaryCard,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.imageQueueSummaryLabel,
                    { color: colors.muted },
                  ]}
                >
                  背景队列
                </Text>
                <Text
                  style={[
                    styles.imageQueueSummaryValue,
                    {
                      color:
                        imageQueueSnapshot.backgroundInFlight ||
                        imageQueueSnapshot.backgroundPending.length > 0
                          ? colors.primary
                          : colors.foreground,
                    },
                  ]}
                >
                  {imageQueueSnapshot.backgroundInFlight
                    ? "生成中"
                    : imageQueueSnapshot.backgroundPending.length > 0
                      ? `等待 ${imageQueueSnapshot.backgroundPending.length}`
                      : "空闲"}
                </Text>
              </View>
              <View
                style={[
                  styles.imageQueueSummaryCard,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.imageQueueSummaryLabel,
                    { color: colors.muted },
                  ]}
                >
                  角色队列
                </Text>
                <Text
                  style={[
                    styles.imageQueueSummaryValue,
                    {
                      color:
                        imageQueueSnapshot.portraitInFlight.length > 0 ||
                        imageQueueSnapshot.portraitPending.length > 0
                          ? colors.primary
                          : colors.foreground,
                    },
                  ]}
                >
                  {imageQueueSnapshot.portraitInFlight.length > 0
                    ? `生成中 ${imageQueueSnapshot.portraitInFlight.length}`
                    : imageQueueSnapshot.portraitPending.length > 0
                      ? `等待 ${imageQueueSnapshot.portraitPending.length}`
                      : "空闲"}
                </Text>
              </View>
            </View>

            <View style={styles.promptHistorySection}>
              <Text
                style={[
                  styles.promptHistoryTitle,
                  { color: colors.foreground },
                ]}
              >
                背景图待处理任务
              </Text>
              {imageQueueSnapshot.backgroundPending.length === 0 ? (
                <Text
                  style={[styles.promptHistoryEmpty, { color: colors.muted }]}
                >
                  暂无背景图等待任务
                </Text>
              ) : (
                imageQueueSnapshot.backgroundPending.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.promptHistoryItem,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                  >
                    <View style={styles.promptHistoryMeta}>
                      <Text
                        style={[
                          styles.promptHistoryStatus,
                          { color: colors.primary },
                        ]}
                      >
                        #{index + 1}
                      </Text>
                      <Text
                        style={[
                          styles.promptHistoryTime,
                          { color: colors.muted },
                        ]}
                      >
                        {item.trigger}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.promptHistoryPrompt,
                        { color: colors.foreground },
                      ]}
                    >
                      {item.summaryPreview}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.promptHistorySection}>
              <Text
                style={[
                  styles.promptHistoryTitle,
                  { color: colors.foreground },
                ]}
              >
                角色图生成中
              </Text>
              {imageQueueSnapshot.portraitInFlight.length === 0 ? (
                <Text
                  style={[styles.promptHistoryEmpty, { color: colors.muted }]}
                >
                  当前没有正在生图的角色
                </Text>
              ) : (
                imageQueueSnapshot.portraitInFlight.map((item) => (
                  <View
                    key={item.id}
                    style={[
                      styles.promptHistoryItem,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                  >
                    <View style={styles.promptHistoryMeta}>
                      <Text
                        style={[
                          styles.promptHistoryStatus,
                          { color: colors.primary },
                        ]}
                      >
                        处理中
                      </Text>
                      <Text
                        style={[
                          styles.promptHistoryTime,
                          { color: colors.muted },
                        ]}
                      >
                        {item.cardId.slice(0, 8)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.promptHistoryPrompt,
                        { color: colors.foreground },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.promptHistorySection}>
              <Text
                style={[
                  styles.promptHistoryTitle,
                  { color: colors.foreground },
                ]}
              >
                角色图待处理任务
              </Text>
              {imageQueueSnapshot.portraitPending.length === 0 ? (
                <Text
                  style={[styles.promptHistoryEmpty, { color: colors.muted }]}
                >
                  暂无角色图等待任务
                </Text>
              ) : (
                imageQueueSnapshot.portraitPending.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.promptHistoryItem,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                  >
                    <View style={styles.promptHistoryMeta}>
                      <Text
                        style={[
                          styles.promptHistoryStatus,
                          { color: colors.primary },
                        ]}
                      >
                        #{index + 1}
                      </Text>
                      <Text
                        style={[
                          styles.promptHistoryTime,
                          { color: colors.muted },
                        ]}
                      >
                        {item.cardId.slice(0, 8)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.promptHistoryPrompt,
                        { color: colors.foreground },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* History Modal */}
      <Modal visible={showHistory} transparent animationType="slide">
        <View
          style={[styles.historyModal, { backgroundColor: colors.background }]}
        >
          <View
            style={[styles.historyHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.historyTitle, { color: colors.foreground }]}>
              历史对话
            </Text>
            <TouchableOpacity
              onPress={() => setShowHistory(false)}
              activeOpacity={0.7}
            >
              <IconSymbol name="xmark" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={(story?.segments.slice(0, viewIndex + 1) ?? []).reverse()}
            keyExtractor={(_, idx) => idx.toString()}
            contentContainerStyle={styles.historyList}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.historyItem,
                  { borderBottomColor: colors.border },
                ]}
              >
                {item.type === "dialogue" && (
                  <Text
                    style={[styles.historyCharacter, { color: colors.primary }]}
                  >
                    {item.character}
                  </Text>
                )}
                {item.type === "narration" && (
                  <Text
                    style={[
                      styles.historyNarrationLabel,
                      { color: colors.muted },
                    ]}
                  >
                    旁白
                  </Text>
                )}
                {item.type === "choice" && (
                  <Text
                    style={[
                      styles.historyNarrationLabel,
                      { color: colors.warning },
                    ]}
                  >
                    选择
                  </Text>
                )}
                {item.text.startsWith("你选择了") && (
                  <Text
                    style={[
                      styles.historyNarrationLabel,
                      { color: colors.warning },
                    ]}
                  >
                    玩家选择
                  </Text>
                )}
                <Text
                  style={[
                    item.type === "narration"
                      ? styles.historyNarration
                      : styles.historyDialogue,
                    { color: colors.foreground },
                  ]}
                >
                  {item.text}
                </Text>
              </View>
            )}
          />
        </View>
      </Modal>

      <ContextMonitor
        threshold={HISTORY_SUMMARY_TRIGGER_CHARS}
        currentFullChars={currentFullHistoryChars}
        currentRawChars={currentHistoryChars}
        currentSentChars={currentSentChars}
        currentTruncated={currentTruncated}
        currentPacing={currentPacing}
        currentMinCharsTarget={currentMinCharsTarget}
        currentGeneratedChars={currentGeneratedChars}
        lastSentMetrics={lastSentContextMetrics}
        generating={storyGeneratingActive}
        historyStuckCount={historyStuckCount}
        lastAffinityDebug={lastAffinityDebug}
      />
    </ScreenContainer>
  );
}

function ContextMonitor({
  threshold,
  currentFullChars,
  currentRawChars,
  currentSentChars,
  currentTruncated,
  currentPacing,
  currentMinCharsTarget,
  currentGeneratedChars,
  lastSentMetrics,
  generating,
  historyStuckCount,
  lastAffinityDebug,
}: {
  threshold: number;
  currentFullChars: number;
  currentRawChars: number;
  currentSentChars: number;
  currentTruncated: boolean;
  currentPacing: keyof typeof PACE_MIN_CHARS;
  currentMinCharsTarget: number;
  currentGeneratedChars: number;
  lastSentMetrics: LastSentContextMetrics;
  generating: boolean;
  historyStuckCount: number;
  lastAffinityDebug: string;
}) {
  const [pressing, setPressing] = useState(false);
  const progress = Math.min(currentSentChars / threshold, 1);
  const progressColor =
    progress >= 1 ? "#ef4444" : progress >= 0.75 ? "#f59e0b" : "#22c55e";

  return (
    <View style={styles.contextMonitorAnchor} pointerEvents="box-none">
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() => setPressing(true)}
        onPressOut={() => setPressing(false)}
        style={[
          styles.contextMonitorDot,
          {
            backgroundColor: progressColor,
            borderColor: currentTruncated
              ? "#ef4444"
              : "rgba(255,255,255,0.45)",
          },
        ]}
      />
      {pressing && (
        <View style={styles.contextMonitorPanel}>
          <Text style={styles.contextMonitorTitle}>Debug Context</Text>
          <Text style={styles.contextMonitorText}>
            全量剧情: {currentFullChars}
          </Text>
          <Text style={styles.contextMonitorText}>
            当前节奏: {currentPacing}
          </Text>
          <Text style={styles.contextMonitorText}>
            本轮下限: {currentMinCharsTarget} / 已生成: {currentGeneratedChars}
          </Text>
          <Text style={styles.contextMonitorText}>
            当前记忆: {currentRawChars} / {threshold}
          </Text>
          <Text style={styles.contextMonitorText}>
            实际发送: {currentSentChars} {currentTruncated ? "(已截断)" : ""}
          </Text>
          <View style={styles.contextMonitorBarBg}>
            <View
              style={[
                styles.contextMonitorBar,
                {
                  width: `${Math.max(progress * 100, 2)}%`,
                  backgroundColor: progressColor,
                },
              ]}
            />
          </View>
          <Text style={styles.contextMonitorText}>
            最近发送: {lastSentMetrics.sentChars}
            {lastSentMetrics.truncated ? " (截断)" : ""}
          </Text>
          <Text style={styles.contextMonitorText}>
            最近全量: {lastSentMetrics.fullChars}
          </Text>
          <Text style={styles.contextMonitorText}>
            最近节奏: {lastSentMetrics.pacing} ({lastSentMetrics.generatedChars}
            /{lastSentMetrics.minCharsTarget})
          </Text>
          <Text style={styles.contextMonitorText}>
            最近耗时: {lastSentMetrics.durationMs ?? 0}ms{" "}
            {generating ? "(生成中)" : ""}
          </Text>
          <Text
            style={[
              styles.contextMonitorText,
              historyStuckCount > 0 && { color: "#f59e0b" },
            ]}
          >
            上下文停滞: {historyStuckCount}
          </Text>
          <Text style={styles.contextMonitorText}>
            最近好感: {lastAffinityDebug}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
  },
  fullScreenBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  fullScreenBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.34)",
  },
  sceneArea: {
    flex: 1,
    justifyContent: "flex-start",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  topBarButton: {
    padding: 8,
  },
  autoReadToggle: {
    height: 30,
    minWidth: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  autoReadToggleActive: {
    borderColor: "transparent",
  },
  autoReadToggleText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  autoReadSpeedButton: {
    height: 30,
    minWidth: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  autoReadSpeedText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  imageButton: {
    borderWidth: 1,
    borderRadius: 999,
    minWidth: 58,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    marginRight: 2,
  },
  imageButtonText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  storyTitle: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  imageStatusContainer: {
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.18)",
    marginTop: 4,
    gap: 6,
    alignItems: "center",
  },
  imageStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  imageQueueButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  imageQueueButtonText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  sceneDecoration: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
  sceneLine: {
    width: "60%",
    height: 1,
  },
  sceneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sceneLine2: {
    width: "40%",
    height: 1,
  },
  dialogueArea: {
    minHeight: 220,
    maxHeight: 440,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 20,
    justifyContent: "center",
  },
  affinityToast: {
    alignSelf: "center",
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(34,197,94,0.22)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.45)",
  },
  affinityToastText: {
    color: "#ecfdf5",
    fontSize: 12,
    fontWeight: "700",
  },
  generatingContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  generatingStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  generatingText: {
    fontSize: 15,
  },
  generatingCancelButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  generatingCancelText: {
    fontSize: 13,
    fontWeight: "700",
  },
  dialogueContent: {
    gap: 8,
  },
  characterName: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  dialogueCharacterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dialoguePortrait: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  narrationLabel: {
    fontSize: 13,
    marginBottom: 2,
  },
  dialogueText: {
    fontSize: 16,
    lineHeight: 26,
  },
  narrationText: {
    fontSize: 15,
    lineHeight: 24,
    fontStyle: "italic",
  },
  tapIndicator: {
    alignItems: "center",
    marginTop: 8,
  },
  tapText: {
    fontSize: 12,
  },
  choicesContainer: {
    gap: 10,
  },
  choiceListScroll: {
    maxHeight: 260,
  },
  choiceListContent: {
    gap: 10,
    paddingBottom: 4,
  },
  choicePrompt: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 4,
  },
  choiceButton: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  choiceText: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  // Menu
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuContainer: {
    width: 280,
    borderRadius: 16,
    padding: 20,
    gap: 4,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  choiceConfirmText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
    textAlign: "left",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "500",
  },
  // History
  historyModal: {
    flex: 1,
    paddingTop: 50,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  historyList: {
    padding: 16,
  },
  imageQueueSummaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  imageQueueSummaryCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  imageQueueSummaryLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  imageQueueSummaryValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  historyItem: {
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  historyCharacter: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  historyNarrationLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  historyDialogue: {
    fontSize: 15,
    lineHeight: 22,
  },
  historyNarration: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: "italic",
  },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  judgmentBadge: {
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 8,
  },
  // Dice Modal
  diceModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  diceModalContent: {
    alignItems: "center",
    gap: 16,
  },
  diceLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  diceNumber: {
    fontSize: 72,
    fontWeight: "800",
    color: "#fff",
  },
  diceJudgment: {
    fontSize: 14,
    color: "#aaa",
  },
  diceOutcome: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 4,
  },
  // Custom Input Modal
  customModalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  customModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 16,
  },
  customModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  customModalInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 120,
  },
  customModalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  customModalCancel: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  customModalConfirm: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  // Character Cards
  characterCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 6,
  },
  characterCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  cardCharName: {
    fontSize: 16,
    fontWeight: "700",
  },
  characterGender: {
    fontSize: 13,
  },
  characterField: {
    fontSize: 13,
    lineHeight: 18,
  },
  characterCardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 20,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
  promptHistorySection: {
    gap: 8,
    paddingTop: 2,
  },
  promptHistoryTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  promptHistoryEmpty: {
    fontSize: 13,
  },
  promptHistoryItem: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  promptHistoryMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  promptHistoryTime: {
    fontSize: 12,
  },
  promptHistoryStatus: {
    fontSize: 12,
    fontWeight: "700",
  },
  promptHistoryPrompt: {
    fontSize: 13,
    lineHeight: 18,
  },
  promptHistoryError: {
    fontSize: 12,
    lineHeight: 16,
  },
  sceneBackgroundImage: {
    resizeMode: "cover",
  },
  sceneOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  involvedChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  involvedChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  involvedChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  portraitImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  portraitPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  portraitPreviewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  portraitPreviewContent: {
    width: "100%",
    alignItems: "center",
    gap: 12,
  },
  portraitPreviewName: {
    fontSize: 16,
    fontWeight: "700",
  },
  portraitPreviewImage: {
    width: "100%",
    maxWidth: 420,
    aspectRatio: 1,
    borderRadius: 14,
  },
  characterCardTop: {
    flexDirection: "row",
    gap: 12,
  },
  characterCardTopRight: {
    flexDirection: "row-reverse",
  },
  characterCardInfo: {
    flex: 1,
    gap: 4,
  },
  characterCardInfoRight: {
    alignItems: "flex-end",
  },
  involvedEventsSection: {
    marginTop: 4,
    gap: 4,
  },
  involvedEventTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  involvedEventText: {
    fontSize: 11,
  },
  contextMonitorAnchor: {
    position: "absolute",
    left: 10,
    top: "45%",
    zIndex: 20,
  },
  contextMonitorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  contextMonitorPanel: {
    marginTop: 8,
    width: 188,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 4,
  },
  contextMonitorTitle: {
    color: "#d1d5db",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  contextMonitorText: {
    color: "#f3f4f6",
    fontSize: 11,
    lineHeight: 14,
  },
  contextMonitorBarBg: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  contextMonitorBar: {
    height: "100%",
    borderRadius: 999,
  },
  bgScaleSidebar: {
    position: "absolute",
    right: 6,
    top: "22%",
    zIndex: 25,
  },
  bgScalePanel: {
    width: 52,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    backgroundColor: "rgba(17,24,39,0.75)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    gap: 6,
  },
  bgScaleTitle: {
    color: "#f9fafb",
    fontSize: 10,
    fontWeight: "700",
  },
  bgScaleTrack: {
    width: 16,
    height: BG_SCALE_TRACK_HEIGHT,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    position: "relative",
  },
  bgScaleThumb: {
    position: "absolute",
    left: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#f8fafc",
  },
  bgScaleValue: {
    color: "#f9fafb",
    fontSize: 10,
    fontWeight: "700",
  },
  bgScaleQuickRow: {
    width: "100%",
    gap: 4,
  },
  bgScaleQuickItem: {
    width: "100%",
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 2,
  },
  bgScaleQuickItemActive: {
    backgroundColor: "rgba(59,130,246,0.35)",
    borderColor: "rgba(147,197,253,0.9)",
  },
  bgScaleQuickText: {
    color: "#e5e7eb",
    fontSize: 9,
    fontWeight: "700",
  },
  scalePanelAnchor: {
    position: "absolute",
    right: 12,
    top: 92,
    zIndex: 30,
  },
  scalePanelCard: {
    width: 58,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.75)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    gap: 6,
  },
  scalePanelTabs: {
    width: "100%",
    gap: 4,
  },
  scalePanelTab: {
    width: "100%",
    alignItems: "center",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 3,
  },
  scalePanelTabActive: {
    borderColor: "rgba(125,211,252,0.95)",
    backgroundColor: "rgba(14,165,233,0.34)",
  },
  scalePanelTabText: {
    color: "#f8fafc",
    fontSize: 10,
    fontWeight: "700",
  },
  scalePanelTrack: {
    width: 16,
    height: BG_SCALE_TRACK_HEIGHT,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    position: "relative",
  },
  scalePanelThumb: {
    position: "absolute",
    left: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#f8fafc",
  },
  scalePanelValue: {
    color: "#f9fafb",
    fontSize: 10,
    fontWeight: "700",
  },
  scalePanelQuickRow: {
    width: "100%",
    gap: 4,
  },
  scalePanelQuickItem: {
    width: "100%",
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 2,
  },
  scalePanelQuickItemActive: {
    backgroundColor: "rgba(59,130,246,0.35)",
    borderColor: "rgba(147,197,253,0.9)",
  },
  scalePanelQuickText: {
    color: "#e5e7eb",
    fontSize: 9,
    fontWeight: "700",
  },
});
