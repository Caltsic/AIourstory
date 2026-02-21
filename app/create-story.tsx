import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  createStory,
  updateStory,
  type DifficultyLevel,
  type PaceLevel,
  type StorySegment,
} from "@/lib/story-store";
import {
  generateStory,
  getLLMConfig,
  randomizeStory,
  PACE_MIN_CHARS,
} from "@/lib/llm-client";

const GENRES = [
  "奇幻冒险",
  "校园日常",
  "悬疑推理",
  "都市情感",
  "古风仙侠",
  "自定义",
];
const DIFFICULTIES: DifficultyLevel[] = [
  "简单",
  "普通",
  "困难",
  "噩梦",
  "无随机",
];
const PACES: PaceLevel[] = ["慵懒", "轻松", "紧张", "紧迫"];
const DIFFICULTY_DICE_HINTS: Record<DifficultyLevel, string> = {
  简单: "简单：容错更高，失败代价相对较低。",
  普通: "普通：成败收益和代价较为平衡。",
  困难: "困难：失败惩罚更重，推进更考验选择。",
  噩梦: "噩梦：风险最高，错误决策会被明显放大。",
  无随机: "无随机：不掷骰，按剧情与选择直接结算。",
};

function ensureChoiceSegment(segments: StorySegment[]): StorySegment[] {
  const hasChoice = segments.some(
    (segment) =>
      segment.type === "choice" &&
      Array.isArray(segment.choices) &&
      segment.choices.length > 0,
  );

  if (hasChoice) return segments;

  return [
    ...segments,
    {
      type: "choice",
      text: "接下来你要怎么做？",
      choices: ["继续当前行动", "先观察周围情况", "与关键人物对话"],
    },
  ];
}

export default function CreateStoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const colors = useColors();

  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [genre, setGenre] = useState("奇幻冒险");
  const [protagonistName, setProtagonistName] = useState("");
  const [protagonistDescription, setProtagonistDescription] = useState("");
  const [protagonistAppearance, setProtagonistAppearance] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("普通");
  const [initialPacing, setInitialPacing] = useState<PaceLevel>("轻松");
  const [creating, setCreating] = useState(false);
  const [randomizing, setRandomizing] = useState(false);

  useEffect(() => {
    if (typeof params.title === "string") setTitle(params.title);
    if (typeof params.premise === "string") setPremise(params.premise);
    if (typeof params.genre === "string" && params.genre)
      setGenre(params.genre);
    if (typeof params.protagonistName === "string")
      setProtagonistName(params.protagonistName);
    if (typeof params.protagonistDescription === "string") {
      setProtagonistDescription(params.protagonistDescription);
    }
    if (typeof params.protagonistAppearance === "string") {
      setProtagonistAppearance(params.protagonistAppearance);
    }
    if (typeof params.difficulty === "string")
      setDifficulty(params.difficulty as DifficultyLevel);
    if (typeof params.initialPacing === "string")
      setInitialPacing(params.initialPacing as PaceLevel);
  }, [params]);

  const canCreate =
    title.trim().length > 0 &&
    premise.trim().length > 0 &&
    protagonistName.trim().length > 0;

  async function handleRandomize() {
    if (randomizing || creating) return;
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const config = await getLLMConfig();
    if (!config.apiKey) {
      Alert.alert("未配置 API", "请先在设置页配置 API Key", [
        { text: "取消", style: "cancel" },
        { text: "去设置", onPress: () => router.push("/(tabs)/settings") },
      ]);
      return;
    }

    setRandomizing(true);
    try {
      const result = await randomizeStory();
      setTitle(result.title);
      setPremise(result.premise);
      setGenre(result.genre);
      setProtagonistName(result.protagonistName);
      setProtagonistDescription(result.protagonistDescription);
      setProtagonistAppearance(result.protagonistAppearance ?? "");
    } catch (err) {
      Alert.alert("随机失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setRandomizing(false);
    }
  }

  async function handleCreate() {
    if (!canCreate || creating) return;
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const config = await getLLMConfig();
    if (!config.apiKey) {
      Alert.alert("未配置 API", "请先在设置页配置 API Key", [
        { text: "取消", style: "cancel" },
        { text: "去设置", onPress: () => router.push("/(tabs)/settings") },
      ]);
      return;
    }

    setCreating(true);
    try {
      const story = await createStory(
        title.trim(),
        premise.trim(),
        genre.trim(),
        protagonistName.trim(),
        protagonistDescription.trim(),
        difficulty,
        initialPacing,
        protagonistAppearance.trim(),
      );

      const generated = await generateStory({
        title: story.title,
        premise: story.premise,
        genre: story.genre,
        protagonistName: story.protagonistName,
        protagonistDescription: story.protagonistDescription,
        protagonistAppearance: story.protagonistAppearance,
        difficulty: story.difficulty,
        pacing: story.currentPacing,
      });

      story.segments = ensureChoiceSegment(generated.segments || []);
      story.currentIndex = 0;
      story.currentPacing = generated.pacing;
      story.lastGeneratedChars = generated.generatedChars;

      if (generated.newCharacters && generated.newCharacters.length > 0) {
        for (const npc of generated.newCharacters) {
          if (story.characterCards.some((c) => c.name === npc.name)) continue;
          story.characterCards.push({
            id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            name: npc.name,
            hiddenName: npc.hiddenName?.trim() || "陌生人",
            isNameRevealed: npc.knownToPlayer ?? true,
            gender: npc.gender,
            personality: npc.personality,
            background: npc.background,
            appearance: npc.appearance || "",
            affinity: 0,
            firstAppearance: 0,
          });
        }
      }

      await updateStory(story);
      router.replace({ pathname: "/game", params: { storyId: story.id } });
    } catch (err) {
      Alert.alert("创建失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setCreating(false);
    }
  }

  function handleShareToPlaza() {
    router.push({
      pathname: "/plaza/submit-story" as any,
      params: {
        title,
        premise,
        genre,
        protagonistName,
        protagonistDescription,
        protagonistAppearance,
        difficulty,
        initialPacing,
      },
    });
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerBtn}
          >
            <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            创建故事
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={handleShareToPlaza}
              style={styles.headerBtn}
            >
              <IconSymbol
                name="person.2.fill"
                size={18}
                color={colors.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRandomize}
              style={styles.headerBtn}
            >
              {randomizing ? (
                <Text style={{ color: colors.primary, fontSize: 12 }}>
                  生成中
                </Text>
              ) : (
                <IconSymbol name="dice" size={18} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <LabeledInput
            label="故事标题"
            value={title}
            onChangeText={setTitle}
            colors={colors}
          />

          <LabeledInput
            label="主角姓名"
            value={protagonistName}
            onChangeText={setProtagonistName}
            colors={colors}
          />

          <LabeledInput
            label="主角描述"
            value={protagonistDescription}
            onChangeText={setProtagonistDescription}
            colors={colors}
            multiline
            helperText="示例：冷静敏锐的实习侦探，擅长观察细节，但不善表达情绪。"
          />

          <LabeledInput
            label="主角外貌"
            value={protagonistAppearance}
            onChangeText={setProtagonistAppearance}
            colors={colors}
            multiline
            helperText="示例：黑色短发，灰蓝色眼睛，常穿深色风衣与长靴，动作利落。"
          />

          <Text style={[styles.label, { color: colors.foreground }]}>
            故事类型
          </Text>
          <View style={styles.chipsRow}>
            {GENRES.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setGenre(item)}
                style={[
                  styles.chip,
                  {
                    borderColor:
                      genre === item ? colors.primary : colors.border,
                    backgroundColor:
                      genre === item ? `${colors.primary}20` : colors.surface,
                  },
                ]}
              >
                <Text
                  style={{
                    color: genre === item ? colors.primary : colors.foreground,
                  }}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.foreground }]}>难度</Text>
          <View style={styles.chipsRow}>
            {DIFFICULTIES.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setDifficulty(item)}
                style={[
                  styles.chip,
                  {
                    borderColor:
                      difficulty === item ? colors.primary : colors.border,
                    backgroundColor:
                      difficulty === item
                        ? `${colors.primary}20`
                        : colors.surface,
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      difficulty === item ? colors.primary : colors.foreground,
                  }}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View
            style={[
              styles.difficultyHintBox,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <Text style={[styles.difficultyHintText, { color: colors.foreground }]}>
              {DIFFICULTY_DICE_HINTS[difficulty]}
            </Text>
            <Text style={[styles.difficultyRuleText, { color: colors.muted }]}>
              掷骰规则：仅在高不确定尝试时触发；1-8 点，小于判定值=失败，等于=平局，大于=成功。
            </Text>
          </View>

          <Text style={[styles.label, { color: colors.foreground }]}>
            初始节奏
          </Text>
          <View style={styles.chipsRow}>
            {PACES.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setInitialPacing(item)}
                style={[
                  styles.chip,
                  {
                    borderColor:
                      initialPacing === item ? colors.primary : colors.border,
                    backgroundColor:
                      initialPacing === item
                        ? `${colors.primary}20`
                        : colors.surface,
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      initialPacing === item
                        ? colors.primary
                        : colors.foreground,
                  }}
                >
                  {item} ({PACE_MIN_CHARS[item]}字)
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <LabeledInput
            label="故事开场"
            value={premise}
            onChangeText={setPremise}
            colors={colors}
            multiline
            minHeight={140}
            helperText="示例：暴雨夜，城市博物馆的古钟失窃，你在案发现场发现一枚不属于馆方的旧钥匙。"
          />

          <TouchableOpacity
            onPress={handleCreate}
            disabled={!canCreate || creating}
            style={[
              styles.createBtn,
              { backgroundColor: canCreate ? colors.primary : colors.muted },
            ]}
          >
            <IconSymbol name="play.fill" size={18} color="#fff" />
            <Text style={styles.createText}>
              {creating ? "创建中..." : "开始冒险"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  colors,
  multiline = false,
  minHeight,
  helperText,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  colors: ReturnType<typeof useColors>;
  multiline?: boolean;
  minHeight?: number;
  helperText?: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      {helperText ? (
        <Text style={[styles.helperText, { color: colors.muted }]}>
          {helperText}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[
          styles.input,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            minHeight: minHeight ?? (multiline ? 84 : undefined),
            textAlignVertical: multiline ? "top" : "center",
          },
        ]}
        multiline={multiline}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBtn: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  content: { padding: 16, gap: 10, paddingBottom: 28 },
  section: { gap: 6 },
  label: { fontSize: 14, fontWeight: "700" },
  helperText: { fontSize: 12, lineHeight: 18 },
  difficultyHintBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  difficultyHintText: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  difficultyRuleText: { fontSize: 12, lineHeight: 17 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  createBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
