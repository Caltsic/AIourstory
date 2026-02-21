import { useCallback, useEffect, useRef, useState } from "react";
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";

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
  type ImagePromptRecord,
  type StorySummaryRecord,
} from "@/lib/story-store";
import {
  generateStory,
  continueStory,
  summarizeStory,
  generateImagePrompt,
  getLLMConfig,
  evaluateCustomAction,
  generateCharacterPortraitPrompt,
  PACE_MIN_CHARS,
} from "@/lib/llm-client";
import { buildDiceOutcomeContext } from "@/lib/llm-prompts";
import { generateImage, getImageConfig } from "@/lib/image-client";
import { rollDice, evaluateDiceResult } from "@/lib/dice";

const HISTORY_SUMMARY_TRIGGER_CHARS = 8000;

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
  const [showMenu, setShowMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [backgroundImageUri, setBackgroundImageUri] = useState<
    string | undefined
  >(undefined);
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

  // Current segment being displayed
  const [viewIndex, setViewIndex] = useState(0);
  const currentSegment = story?.segments[viewIndex] ?? null;
  const isChoice = currentSegment?.type === "choice";
  const currentFullHistoryChars = buildFullHistoryContext(
    story?.segments ?? [],
  ).trim().length;
  const currentHistoryChars = (story?.historyContext ?? "").trim().length;
  const currentSentChars = Math.min(
    currentHistoryChars,
    HISTORY_SUMMARY_TRIGGER_CHARS,
  );
  const currentTruncated = currentHistoryChars > HISTORY_SUMMARY_TRIGGER_CHARS;
  const currentPacing = story?.currentPacing ?? "轻松";
  const currentMinCharsTarget = PACE_MIN_CHARS[currentPacing];
  const currentGeneratedChars = story?.lastGeneratedChars ?? 0;
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

  // LLM API calls - check config on load
  const [apiConfigured, setApiConfigured] = useState(false);

  // Load story
  useEffect(() => {
    if (!storyId) return;
    loadStory();
  }, [storyId]);

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

  useEffect(() => {
    return () => {
      clearDiceTimers();
    };
  }, []);

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

  async function loadStory() {
    setLoading(true);
    const s = await getStory(storyId!);
    if (!s) {
      router.back();
      return;
    }
    setStory(s);
    if (s.backgroundImageUri) {
      setBackgroundImageUri(s.backgroundImageUri);
    }
    if (s.segments.length === 0) {
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
      setApiConfigured(true);
      // Generate initial story
      generateInitial(s);
    } else {
      setViewIndex(s.currentIndex);
    }
    setLoading(false);
  }

  async function generateInitial(s: Story) {
    setGenerating(true);
    try {
      const result = await generateStory({
        title: s.title,
        premise: s.premise,
        genre: s.genre,
        protagonistName: s.protagonistName ?? "",
        protagonistDescription: s.protagonistDescription ?? "",
        protagonistAppearance: s.protagonistAppearance ?? "",
        difficulty: s.difficulty,
        pacing: s.currentPacing,
        characterCards: s.characterCards,
      });
      if (result.segments && result.segments.length > 0) {
        const initialSegments = ensureChoiceSegment(
          result.segments as StorySegment[],
        );
        s.segments = initialSegments;
        s.currentPacing = result.pacing;
        s.lastGeneratedChars = result.generatedChars;
        s.latestGeneratedContext =
          buildImageContextFromSegments(initialSegments);
        s.currentIndex = 0;
        processNewCharacters(s, result.newCharacters);
        try {
          const summaryResult = await summarizeStory({
            history: buildFullHistoryContext(s.segments),
            recentTitles: getRecentSummaryTitles(s),
          });
          if (summaryResult.summary) {
            s.storySummary = summaryResult.summary;
            addSummaryRecord(s, summaryResult);
          }
        } catch (summaryErr) {
          console.warn("Initial summary generation failed:", summaryErr);
        }
        await updateStory(s);
        setStory({ ...s });
        setViewIndex(0);
      }
    } catch (err) {
      console.error("Generate failed:", err);
      Alert.alert("生成失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setGenerating(false);
    }
  }

  function generateLocalId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function getCharacterDisplayName(card: CharacterCard): string {
    if (card.isNameRevealed) return card.name;
    return card.hiddenName?.trim() || "陌生人";
  }

  function addSummaryRecord(
    targetStory: Story,
    result: { title: string; summary: string; involvedCharacters: string[] },
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
  ) {
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

    if (!newCharacters || newCharacters.length === 0) return;
    for (const nc of newCharacters) {
      const hiddenName = nc.hiddenName?.trim() || "陌生人";
      const reveal =
        typeof nc.knownToPlayer === "boolean" ? nc.knownToPlayer : true;
      const initialAffinity = inferInitialAffinity(
        `${nc.personality || ""}\n${nc.background || ""}`,
      );
      const exact = s.characterCards.find((c) => c.name === nc.name);
      const legacyAlias =
        exact ||
        s.characterCards.find(
          (c) =>
            !c.isNameRevealed &&
            (c.name === hiddenName || c.hiddenName === hiddenName),
        );

      if (legacyAlias) {
        legacyAlias.name = nc.name;
        legacyAlias.hiddenName = legacyAlias.hiddenName || hiddenName;
        legacyAlias.isNameRevealed = legacyAlias.isNameRevealed || reveal;
        legacyAlias.gender = nc.gender || legacyAlias.gender;
        legacyAlias.personality = nc.personality || legacyAlias.personality;
        legacyAlias.background = nc.background || legacyAlias.background;
        legacyAlias.appearance = nc.appearance || legacyAlias.appearance || "";
        if (typeof legacyAlias.affinity !== "number") {
          legacyAlias.affinity = initialAffinity;
        }
      } else {
        s.characterCards.push({
          id: generateLocalId(),
          name: nc.name,
          hiddenName,
          isNameRevealed: reveal,
          gender: nc.gender,
          personality: nc.personality,
          background: nc.background,
          appearance: nc.appearance || "",
          affinity: initialAffinity,
          firstAppearance: s.segments.length,
        });
      }
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
    const card = story.characterCards.find(
      (c) => c.name === name || c.hiddenName === name,
    );
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

  function applyAffinityFromChoice(choiceText: string) {
    if (!story) return;
    const text = choiceText.trim();
    if (!text) return;
    const positive =
      /(帮助|保护|救|安慰|支持|信任|照顾|协助|陪伴|挡在前面|替.*承担|道歉)/;
    const negative = /(欺骗|威胁|伤害|背叛|抛下|利用|抢夺|攻击|羞辱)/;
    if (!positive.test(text) || negative.test(text)) return;

    const recentNames = story.segments
      .slice(-8)
      .filter((s) => s.type === "dialogue" && s.character)
      .map((s) => s.character as string);

    for (const card of story.characterCards) {
      const related =
        recentNames.includes(card.name) ||
        recentNames.includes(card.hiddenName) ||
        text.includes(card.name) ||
        text.includes(card.hiddenName);
      if (!related) continue;

      const delta = card.affinity >= 70 ? 1 : card.affinity >= 40 ? 2 : 3;
      card.affinity = Math.min(100, card.affinity + delta);
    }
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

  async function refreshSummaryWhenContextTooLong(
    targetStory: Story,
  ): Promise<string> {
    const fullHistory = buildFullHistoryContext(targetStory.segments);
    if (fullHistory.length < HISTORY_SUMMARY_TRIGGER_CHARS) {
      return buildHistoryContext(
        targetStory.segments,
        targetStory.storySummary,
      );
    }

    const summaryResult = await summarizeStory({
      history: fullHistory,
      recentTitles: getRecentSummaryTitles(targetStory),
    });
    if (!summaryResult.summary?.trim()) {
      return buildHistoryContext(
        targetStory.segments,
        targetStory.storySummary,
      );
    }

    targetStory.storySummary = summaryResult.summary.trim();
    addSummaryRecord(targetStory, summaryResult);
    await updateStory(targetStory);
    return buildHistoryContext(targetStory.segments, targetStory.storySummary);
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

  async function handleGenerateImage() {
    if (!story || imageGenerating) return;
    if (generating) {
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

    setImageGenerating(true);
    try {
      story.imageGenerationStatus = "generating";
      await updateStory(story);
      setStory({ ...story });

      const promptSource =
        story.latestGeneratedContext?.trim() ||
        buildImageContextFromSegments(story.segments.slice(-8)) ||
        story.historyContext;
      const imagePrompt = await generateImagePrompt(promptSource);
      const promptRecord: ImagePromptRecord = {
        id: promptRecordId,
        prompt: imagePrompt,
        summary: promptSource,
        status: "pending",
        createdAt: Date.now(),
      };

      story.imagePromptHistory = [
        promptRecord,
        ...(story.imagePromptHistory ?? []),
      ].slice(0, 30);
      await updateStory(story);
      setStory({ ...story });

      const uri = await generateImage(imagePrompt);
      const current = story.imagePromptHistory.find(
        (p) => p.id === promptRecordId,
      );
      if (current) {
        current.status = "success";
        current.imageUri = uri;
      }

      story.backgroundImageUri = uri;
      story.imageGenerationStatus = "success";
      story.lastImageGenerationAt = Date.now();

      await updateStory(story);
      setStory({ ...story });
      setBackgroundImageUri(uri);
      Alert.alert("生图完成", "背景图已更新");
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      if (!story.imagePromptHistory) story.imagePromptHistory = [];
      const current = story.imagePromptHistory.find(
        (p) => p.id === promptRecordId,
      );
      if (current) {
        current.status = "failed";
        current.error = message;
      }
      story.imageGenerationStatus = "failed";
      story.lastImageGenerationAt = Date.now();
      await updateStory(story);
      setStory({ ...story });
      Alert.alert("生图失败", message);
    } finally {
      setImageGenerating(false);
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
    const config = await getImageConfig();
    if (!config.imageApiUrl || !config.imageModel) {
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
      setPortraitGenerating(null);
    }
  }

  // Advance to next segment
  function handleTap() {
    if (!story || !currentSegment) return;
    if (isChoice) return; // Don't advance on choice segments
    if (!done) {
      skip();
      return;
    }
    // Move to next segment
    if (viewIndex < story.segments.length - 1) {
      const next = viewIndex + 1;
      setViewIndex(next);
      story.currentIndex = next;
      updateStory(story);
    }
  }

  // Handle player choice — with dice mechanics
  async function handleChoice(choiceText: string, choiceIndex?: number) {
    if (!story || generating) return;
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
      // Custom action — always requires dice check, ask AI to evaluate
      try {
        setGenerating(true);
        judgmentValue = await evaluateCustomAction(
          choiceText,
          story.historyContext,
          story.difficulty,
          story.protagonistName,
          story.protagonistDescription,
        );
        judgmentValue = getAffinityAdjustedJudgment(judgmentValue, choiceText);
      } catch {
        judgmentValue = 4;
      } finally {
        setGenerating(false);
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
    const historyBeforeChoice = story.historyContext;

    // Add a narration segment for the choice made
    const diceInfo = dice ? ` [🎲 ${dice.roll}/${dice.judgmentValue}]` : "";
    const choiceRecord: StorySegment = {
      type: "choice",
      text: `你选择了：「${choiceText}」${diceInfo}`,
      choices: [choiceText],
      diceResult: dice,
    };
    story.segments.push(choiceRecord);
    applyAffinityFromChoice(choiceText);
    const fullHistory = buildFullHistoryContext(story.segments);
    let latestHistoryContext = buildHistoryContext(
      story.segments,
      story.storySummary,
    );
    if (fullHistory.length >= HISTORY_SUMMARY_TRIGGER_CHARS) {
      try {
        latestHistoryContext = await refreshSummaryWhenContextTooLong(story);
      } catch (summaryErr) {
        console.warn("Summary generation failed:", summaryErr);
      }
    }

    setGenerating(true);
    const requestStartedAt = Date.now();
    try {
      const diceOutcomeCtx = dice
        ? buildDiceOutcomeContext(dice, story.difficulty, choiceText)
        : undefined;
      const trimmedHistory = latestHistoryContext.trim();
      const rawChars = trimmedHistory.length;
      const sentChars = Math.min(rawChars, HISTORY_SUMMARY_TRIGGER_CHARS);
      const truncated = rawChars > HISTORY_SUMMARY_TRIGGER_CHARS;
      setLastSentContextMetrics({
        fullChars: fullHistory.length,
        rawChars,
        sentChars,
        truncated,
        pacing: story.currentPacing,
        minCharsTarget: PACE_MIN_CHARS[story.currentPacing],
        generatedChars: 0,
        durationMs: null,
        at: requestStartedAt,
      });

      const result = await continueStory({
        title: story.title,
        genre: story.genre,
        premise: story.premise,
        history: latestHistoryContext,
        choiceText,
        protagonistName: story.protagonistName ?? "",
        protagonistDescription: story.protagonistDescription ?? "",
        protagonistAppearance: story.protagonistAppearance ?? "",
        difficulty: story.difficulty,
        pacing: story.currentPacing,
        characterCards: story.characterCards,
        diceOutcomeContext: diceOutcomeCtx,
      });

      const generatedSegments = Array.isArray(result.segments)
        ? (result.segments as StorySegment[])
        : [];
      const newSegments = ensureChoiceSegment(generatedSegments, choiceText);
      story.segments.push(...newSegments);
      story.currentPacing = result.pacing;
      story.lastGeneratedChars = result.generatedChars;
      story.latestGeneratedContext = buildImageContextFromSegments(newSegments);
      const newIndex = story.segments.length - newSegments.length;
      story.currentIndex = newIndex;

      // Process new characters
      processNewCharacters(story, result.newCharacters);

      // Increment choice counter
      story.choiceCount = (story.choiceCount ?? 0) + 1;

      try {
        const summaryResult = await summarizeStory({
          history: buildFullHistoryContext(story.segments),
          recentTitles: getRecentSummaryTitles(story),
        });
        if (summaryResult.summary) {
          story.storySummary = summaryResult.summary;
          addSummaryRecord(story, summaryResult);
        }
      } catch (summaryErr) {
        console.warn("Summary generation failed:", summaryErr);
      }

      await updateStory(story);
      if (story.historyContext === historyBeforeChoice) {
        setHistoryStuckCount((count) => count + 1);
      } else {
        setHistoryStuckCount(0);
      }
      setStory({ ...story });
      setViewIndex(newIndex);
    } catch (err) {
      console.error("Continue failed:", err);
      Alert.alert("生成失败", err instanceof Error ? err.message : "未知错误");
      story.segments.pop();
    } finally {
      setLastSentContextMetrics((prev) =>
        prev.at === requestStartedAt
          ? {
              ...prev,
              pacing: story.currentPacing,
              minCharsTarget: PACE_MIN_CHARS[story.currentPacing],
              generatedChars: story.lastGeneratedChars,
              durationMs: Date.now() - requestStartedAt,
            }
          : prev,
      );
      setGenerating(false);
    }
  }

  function handleBack() {
    if (story) {
      story.currentIndex = viewIndex;
      updateStory(story);
    }
    router.back();
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
            imageStyle={styles.sceneBackgroundImage}
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
                disabled={imageGenerating || generating}
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
          </View>

          {/* Scene decoration */}
          <View style={styles.sceneDecoration}>
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
          {generating ? (
            <View style={styles.generatingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.generatingText, { color: colors.muted }]}>
                剧情生成中...
              </Text>
            </View>
          ) : currentSegment ? (
            <View style={styles.dialogueContent}>
              {/* Character name */}
              {currentSegment.type === "dialogue" &&
                currentSegment.character && (
                  <Animated.View entering={FadeIn.duration(200)}>
                    <View style={styles.dialogueCharacterRow}>
                      {getCardPortraitByName(currentSegment.character) ? (
                        <ImageBackground
                          source={{
                            uri: getCardPortraitByName(
                              currentSegment.character,
                            ),
                          }}
                          style={styles.dialoguePortrait}
                          imageStyle={{ borderRadius: 10 }}
                        />
                      ) : null}
                      <Text
                        style={[
                          styles.characterName,
                          { color: colors.primary },
                        ]}
                      >
                        {currentSegment.character}
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
              {isChoice && currentSegment.choices && (
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
              setCustomInput("");
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
                  setCustomInput("");
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
                          disabled={portraitGenerating === item.id}
                          activeOpacity={0.7}
                        >
                          {item.portraitUri ? (
                            <ImageBackground
                              source={{ uri: item.portraitUri }}
                              style={styles.portraitImage}
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
                                        story.characterCards =
                                          story.characterCards.filter(
                                            (c) => c.id !== item.id,
                                          );
                                        updateStory(story);
                                        setStory({ ...story });
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
                style={styles.portraitPreviewImage}
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
        generating={generating}
        historyStuckCount={historyStuckCount}
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
  topBarButton: {
    padding: 8,
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
  },
  imageStatusText: {
    fontSize: 12,
    fontWeight: "600",
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
  generatingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  generatingText: {
    fontSize: 15,
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
});
