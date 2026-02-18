import { useCallback, useEffect, useRef, useState } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  ScrollView,
  Modal,
  FlatList,
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
} from "@/lib/story-store";
import { trpc } from "@/lib/trpc";

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

  // Current segment being displayed
  const [viewIndex, setViewIndex] = useState(0);
  const currentSegment = story?.segments[viewIndex] ?? null;
  const isChoice = currentSegment?.type === "choice";

  // Typewriter
  const displayText = currentSegment?.text ?? "";
  const { displayed, done, skip } = useTypewriter(displayText, 30);

  // tRPC mutations
  const generateMutation = trpc.story.generate.useMutation();
  const continueMutation = trpc.story.continue.useMutation();

  // Load story
  useEffect(() => {
    if (!storyId) return;
    loadStory();
  }, [storyId]);

  async function loadStory() {
    setLoading(true);
    const s = await getStory(storyId!);
    if (!s) {
      router.back();
      return;
    }
    setStory(s);
    if (s.segments.length === 0) {
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
      const result = await generateMutation.mutateAsync({
        title: s.title,
        premise: s.premise,
        genre: s.genre,
      });
      if (result.segments && result.segments.length > 0) {
        s.segments = result.segments as StorySegment[];
        s.currentIndex = 0;
        await updateStory(s);
        setStory({ ...s });
        setViewIndex(0);
      }
    } catch (err) {
      console.error("Generate failed:", err);
    } finally {
      setGenerating(false);
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

  // Handle player choice
  async function handleChoice(choiceText: string) {
    if (!story || generating) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // Add a narration segment for the choice made
    const choiceRecord: StorySegment = {
      type: "narration",
      text: `你选择了：「${choiceText}」`,
    };
    story.segments.push(choiceRecord);

    setGenerating(true);
    try {
      const result = await continueMutation.mutateAsync({
        title: story.title,
        genre: story.genre,
        premise: story.premise,
        history: story.historyContext,
        choiceText,
      });

      if (result.segments && result.segments.length > 0) {
        const newSegments = result.segments as StorySegment[];
        story.segments.push(...newSegments);
        const newIndex = story.segments.length - newSegments.length;
        story.currentIndex = newIndex;
        await updateStory(story);
        setStory({ ...story });
        setViewIndex(newIndex);
      }
    } catch (err) {
      console.error("Continue failed:", err);
      // Remove the choice record if generation failed
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
          <Text style={[styles.loadingText, { color: colors.muted }]}>加载中...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.flex}>
        {/* Scene Area */}
        <View style={[styles.sceneArea, { backgroundColor: colors.background }]}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={handleBack}
              style={styles.topBarButton}
              activeOpacity={0.7}
            >
              <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.storyTitle, { color: colors.foreground }]} numberOfLines={1}>
              {story?.title}
            </Text>
            <TouchableOpacity
              onPress={() => setShowMenu(true)}
              style={styles.topBarButton}
              activeOpacity={0.7}
            >
              <IconSymbol name="ellipsis" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Scene decoration */}
          <View style={styles.sceneDecoration}>
            <View style={[styles.sceneLine, { backgroundColor: colors.primary + "20" }]} />
            <View style={[styles.sceneDot, { backgroundColor: colors.primary + "40" }]} />
            <View style={[styles.sceneLine2, { backgroundColor: colors.primary + "15" }]} />
          </View>
        </View>

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
              {currentSegment.type === "dialogue" && currentSegment.character && (
                <Animated.View entering={FadeIn.duration(200)}>
                  <Text style={[styles.characterName, { color: colors.primary }]}>
                    {currentSegment.character}
                  </Text>
                </Animated.View>
              )}
              {currentSegment.type === "narration" && (
                <Animated.View entering={FadeIn.duration(200)}>
                  <Text style={[styles.narrationLabel, { color: colors.muted }]}>
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
                    { color: currentSegment.type === "narration" ? "#c0c0d0" : "#eaeaea" },
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
                        onPress={() => handleChoice(choice)}
                        style={[
                          styles.choiceButton,
                          {
                            borderColor: colors.primary + "80",
                            backgroundColor: colors.surface + "60",
                          },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.choiceText, { color: colors.foreground }]}>
                          {choice}
                        </Text>
                      </TouchableOpacity>
                    </Animated.View>
                  ))}
                </View>
              )}

              {/* Tap indicator */}
              {done && !isChoice && (
                <Animated.View
                  entering={FadeIn.delay(300).duration(500)}
                  style={styles.tapIndicator}
                >
                  <Text style={[styles.tapText, { color: colors.muted }]}>▼ 点击继续</Text>
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
            <Text style={[styles.menuTitle, { color: colors.foreground }]}>菜单</Text>
            <TouchableOpacity
              onPress={() => {
                setShowMenu(false);
                setShowHistory(true);
              }}
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              activeOpacity={0.7}
            >
              <IconSymbol name="list.bullet" size={20} color={colors.foreground} />
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>
                历史对话
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
              <IconSymbol name="arrow.left" size={20} color={colors.foreground} />
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
              <Text style={[styles.menuItemText, { color: colors.muted }]}>关闭</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* History Modal */}
      <Modal visible={showHistory} transparent animationType="slide">
        <View style={[styles.historyModal, { backgroundColor: colors.background }]}>
          <View style={[styles.historyHeader, { borderBottomColor: colors.border }]}>
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
              <View style={[styles.historyItem, { borderBottomColor: colors.border }]}>
                {item.type === "dialogue" && (
                  <Text style={[styles.historyCharacter, { color: colors.primary }]}>
                    {item.character}
                  </Text>
                )}
                {item.type === "narration" && (
                  <Text style={[styles.historyNarrationLabel, { color: colors.muted }]}>
                    旁白
                  </Text>
                )}
                {item.type === "choice" && (
                  <Text style={[styles.historyNarrationLabel, { color: colors.warning }]}>
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
    maxHeight: 320,
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
});
