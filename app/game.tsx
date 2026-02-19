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
  type Story,
  type StorySegment,
  type CharacterCard,
  type DiceResult,
} from "@/lib/story-store";
import {
  generateStory,
  continueStory,
  summarizeStory,
  generateImagePrompt,
  getLLMConfig,
  evaluateCustomAction,
} from "@/lib/llm-client";
import { buildDiceOutcomeContext } from "@/lib/llm-prompts";
import { generateImage } from "@/lib/image-client";
import { rollDice, evaluateDiceResult } from "@/lib/dice";

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
  const [editingCard, setEditingCard] = useState<CharacterCard | null>(null);
  const [editPersonality, setEditPersonality] = useState("");
  const [editBackground, setEditBackground] = useState("");
  const [showDiceModal, setShowDiceModal] = useState(false);
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

  // Current segment being displayed
  const [viewIndex, setViewIndex] = useState(0);
  const currentSegment = story?.segments[viewIndex] ?? null;
  const isChoice = currentSegment?.type === "choice";

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
        difficulty: s.difficulty,
        characterCards: s.characterCards,
      });
      if (result.segments && result.segments.length > 0) {
        s.segments = result.segments as StorySegment[];
        s.currentIndex = 0;
        processNewCharacters(s, result.newCharacters);
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

  function processNewCharacters(
    s: Story,
    newCharacters?: {
      name: string;
      gender: string;
      personality: string;
      background: string;
    }[],
  ) {
    if (!newCharacters || newCharacters.length === 0) return;
    for (const nc of newCharacters) {
      const exists = s.characterCards.some((c) => c.name === nc.name);
      if (!exists) {
        s.characterCards.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          name: nc.name,
          gender: nc.gender,
          personality: nc.personality,
          background: nc.background,
          firstAppearance: s.segments.length,
        });
      }
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
    setCustomInput("");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (story.difficulty === "无随机") {
      // No dice — proceed directly
      await proceedWithChoice(choiceText);
      return;
    }

    // Determine judgment value
    let judgmentValue = 4;
    if (
      choiceIndex !== undefined &&
      currentSegment?.judgmentValues?.[choiceIndex]
    ) {
      judgmentValue = currentSegment.judgmentValues[choiceIndex];
    } else if (choiceIndex === undefined) {
      // Custom action — ask AI to evaluate
      try {
        setGenerating(true);
        judgmentValue = await evaluateCustomAction(
          choiceText,
          story.historyContext,
          story.difficulty,
        );
      } catch {
        judgmentValue = 4;
      } finally {
        setGenerating(false);
      }
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

    // Add a narration segment for the choice made
    const diceInfo = dice ? ` [🎲 ${dice.roll}/${dice.judgmentValue}]` : "";
    const choiceRecord: StorySegment = {
      type: "narration",
      text: `你选择了：「${choiceText}」${diceInfo}`,
      diceResult: dice,
    };
    story.segments.push(choiceRecord);

    setGenerating(true);
    try {
      const diceOutcomeCtx = dice
        ? buildDiceOutcomeContext(dice, story.difficulty, choiceText)
        : undefined;

      const result = await continueStory({
        title: story.title,
        genre: story.genre,
        premise: story.premise,
        history: story.historyContext,
        choiceText,
        protagonistName: story.protagonistName ?? "",
        protagonistDescription: story.protagonistDescription ?? "",
        difficulty: story.difficulty,
        characterCards: story.characterCards,
        diceOutcomeContext: diceOutcomeCtx,
      });

      if (result.segments && result.segments.length > 0) {
        const newSegments = result.segments as StorySegment[];
        story.segments.push(...newSegments);
        const newIndex = story.segments.length - newSegments.length;
        story.currentIndex = newIndex;

        // Process new characters
        processNewCharacters(story, result.newCharacters);

        // Increment choice counter
        story.choiceCount = (story.choiceCount ?? 0) + 1;

        // Every 5 choices, generate a summary and a background image
        if (story.choiceCount % 5 === 0) {
          try {
            await updateStory(story);
            const summary = await summarizeStory({
              history: story.historyContext,
            });
            if (summary) {
              story.storySummary = summary;
              const storyRef = story;
              generateImagePrompt(summary)
                .then((imgPrompt) => generateImage(imgPrompt))
                .then((uri) => {
                  storyRef.backgroundImageUri = uri;
                  updateStory(storyRef).catch(() => {});
                  setBackgroundImageUri(uri);
                })
                .catch((imgErr) => {
                  console.warn("Background image generation failed:", imgErr);
                });
            }
          } catch (summaryErr) {
            console.warn("Summary generation failed:", summaryErr);
          }
        }

        await updateStory(story);
        setStory({ ...story });
        setViewIndex(newIndex);
      }
    } catch (err) {
      console.error("Continue failed:", err);
      Alert.alert("生成失败", err instanceof Error ? err.message : "未知错误");
      story.segments.pop();
    } finally {
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
        {/* Scene Area */}
        <ImageBackground
          source={backgroundImageUri ? { uri: backgroundImageUri } : undefined}
          style={[
            styles.sceneArea,
            !backgroundImageUri && { backgroundColor: colors.background },
          ]}
          imageStyle={styles.sceneBackgroundImage}
        >
          {/* Dark overlay when image is showing */}
          {backgroundImageUri && <View style={styles.sceneOverlay} />}
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
        </ImageBackground>

        {/* Dialogue Area */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleTap}
          style={[styles.dialogueArea, { backgroundColor: "rgba(0,0,0,0.88)" }]}
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
                    <Text
                      style={[styles.characterName, { color: colors.primary }]}
                    >
                      {currentSegment.character}
                    </Text>
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
                  {currentSegment.choices.map((choice, idx) => (
                    <Animated.View
                      key={idx}
                      entering={FadeInDown.delay(idx * 100).duration(300)}
                    >
                      <TouchableOpacity
                        onPress={() => handleChoice(choice, idx)}
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
                            currentSegment.judgmentValues?.[idx] && (
                              <Text
                                style={[
                                  styles.judgmentBadge,
                                  { color: colors.muted },
                                ]}
                              >
                                难度{currentSegment.judgmentValues[idx]}
                              </Text>
                            )}
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  ))}

                  {/* Custom action button — opens modal */}
                  <Animated.View
                    entering={FadeInDown.delay(
                      currentSegment.choices.length * 100 + 100,
                    ).duration(300)}
                  >
                    <TouchableOpacity
                      onPress={() => setShowCustomInputModal(true)}
                      style={[
                        styles.choiceButton,
                        {
                          borderColor: colors.primary + "40",
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
                    handleChoice(customInput.trim());
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

      {/* Character Cards Modal */}
      <Modal visible={showCharacterCards} transparent animationType="slide">
        <View
          style={[styles.historyModal, { backgroundColor: colors.background }]}
        >
          <View
            style={[styles.historyHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.historyTitle, { color: colors.foreground }]}>
              角色卡片 ({story?.characterCards?.length ?? 0})
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
            data={story?.characterCards ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.historyList}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                暂无角色卡片，随着剧情推进会自动生成
              </Text>
            }
            renderItem={({ item }) => (
              <View
                style={[styles.characterCard, { borderColor: colors.border }]}
              >
                {editingCard?.id === item.id ? (
                  // Edit mode
                  <View style={{ gap: 10 }}>
                    <View style={styles.characterCardHeader}>
                      <Text
                        style={[styles.cardCharName, { color: colors.primary }]}
                      >
                        {item.name}
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
                    <View style={styles.characterCardHeader}>
                      <Text
                        style={[styles.cardCharName, { color: colors.primary }]}
                      >
                        {item.name}
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
                      style={[
                        styles.characterField,
                        { color: colors.foreground },
                      ]}
                    >
                      性格：{item.personality}
                    </Text>
                    <Text
                      style={[styles.characterField, { color: colors.muted }]}
                    >
                      背景：{item.background}
                    </Text>
                    <View style={styles.characterCardActions}>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingCard(item);
                          setEditPersonality(item.personality);
                          setEditBackground(item.background);
                        }}
                      >
                        <Text
                          style={{ color: colors.primary, fontWeight: "600" }}
                        >
                          编辑
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            "删除角色",
                            `确定删除「${item.name}」的角色卡片吗？`,
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
                        <Text style={{ color: "#ef4444", fontWeight: "600" }}>
                          删除
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}
          />
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
            data={story?.segments.slice(0, viewIndex + 1) ?? []}
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
    </ScreenContainer>
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
  storyTitle: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
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
  sceneBackgroundImage: {
    resizeMode: "cover",
  },
  sceneOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
});
