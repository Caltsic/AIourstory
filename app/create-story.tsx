import { useState } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { createStory, updateStory } from "@/lib/story-store";
import { generateStory, getLLMConfig } from "@/lib/llm-client";

const GENRES = [
  { label: "奇幻冒险", emoji: "⚔️" },
  { label: "校园日常", emoji: "🏫" },
  { label: "悬疑推理", emoji: "🔍" },
  { label: "科幻未来", emoji: "🚀" },
  { label: "古风仙侠", emoji: "🏔️" },
  { label: "自定义", emoji: "✨" },
];

export default function CreateStoryScreen() {
  const router = useRouter();
  const colors = useColors();
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [genre, setGenre] = useState("奇幻冒险");
  const [creating, setCreating] = useState(false);

  const canCreate = title.trim().length > 0 && premise.trim().length > 0;

  async function handleCreate() {
    if (!canCreate || creating) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    // Check API config before creating
    const config = await getLLMConfig();
    if (!config.apiKey) {
      Alert.alert(
        "未配置 API",
        "请先在设置中配置 AI API Key 才能创建故事",
        [
          { text: "取消", style: "cancel" },
          { text: "去设置", onPress: () => router.push("/(tabs)/settings") },
        ]
      );
      return;
    }
    
    setCreating(true);
    try {
      // Create story entry first
      const story = await createStory(title.trim(), premise.trim(), genre);
      
      // Generate initial story segments
      const result = await generateStory({
        title: story.title,
        premise: story.premise,
        genre: story.genre,
      });
      
      if (result.segments && result.segments.length > 0) {
        story.segments = result.segments;
        story.currentIndex = 0;
        await updateStory(story);
        router.replace({ pathname: "/game", params: { storyId: story.id } });
      }
    } catch (err) {
      console.error("Create failed:", err);
      Alert.alert("创建失败", err instanceof Error ? err.message : "未知错误");
      setCreating(false);
    }
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>创建新故事</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Title Input */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.foreground }]}>故事标题</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  color: colors.foreground,
                  borderColor: colors.border,
                },
              ]}
              placeholder="给你的故事起个名字..."
              placeholderTextColor={colors.muted}
              value={title}
              onChangeText={setTitle}
              maxLength={50}
              returnKeyType="next"
            />
          </View>

          {/* Genre Selection */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.foreground }]}>故事风格</Text>
            <View style={styles.genreGrid}>
              {GENRES.map((g) => {
                const isSelected = genre === g.label;
                return (
                  <TouchableOpacity
                    key={g.label}
                    onPress={() => {
                      setGenre(g.label);
                      if (Platform.OS !== "web") {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                    style={[
                      styles.genreChip,
                      {
                        backgroundColor: isSelected
                          ? colors.primary + "25"
                          : colors.surface,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.genreEmoji}>{g.emoji}</Text>
                    <Text
                      style={[
                        styles.genreLabel,
                        {
                          color: isSelected ? colors.primary : colors.foreground,
                          fontWeight: isSelected ? "700" : "500",
                        },
                      ]}
                    >
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Premise Input */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.foreground }]}>故事开头</Text>
            <Text style={[styles.hint, { color: colors.muted }]}>
              描述故事的世界观、角色和开场场景，AI将据此生成剧情
            </Text>
            <TextInput
              style={[
                styles.textArea,
                {
                  backgroundColor: colors.surface,
                  color: colors.foreground,
                  borderColor: colors.border,
                },
              ]}
              placeholder="例如：在一座被迷雾笼罩的古老学院中，你是一名刚入学的新生。传说学院地下封印着一个远古的秘密，而你在入学第一天就收到了一封神秘的信件..."
              placeholderTextColor={colors.muted}
              value={premise}
              onChangeText={setPremise}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
              maxLength={1000}
            />
            <Text style={[styles.charCount, { color: colors.muted }]}>
              {premise.length}/1000
            </Text>
          </View>

          {/* Create Button */}
          <TouchableOpacity
            onPress={handleCreate}
            disabled={!canCreate || creating}
            style={[
              styles.createButton,
              {
                backgroundColor: canCreate ? colors.primary : colors.surface,
                opacity: creating ? 0.7 : 1,
              },
            ]}
            activeOpacity={0.8}
          >
            <IconSymbol
              name="play.fill"
              size={20}
              color={canCreate ? "#fff" : colors.muted}
            />
            <Text
              style={[
                styles.createButtonText,
                { color: canCreate ? "#fff" : colors.muted },
              ]}
            >
              {creating ? "创建中..." : "开始冒险"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  headerSpacer: { width: 32 },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 180,
  },
  charCount: {
    fontSize: 12,
    textAlign: "right",
    marginTop: 4,
  },
  genreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  genreChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 6,
  },
  genreEmoji: {
    fontSize: 16,
  },
  genreLabel: {
    fontSize: 14,
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    marginTop: 8,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: "700",
  },
});
