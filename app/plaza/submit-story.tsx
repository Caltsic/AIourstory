import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-provider";
import { submitStoryPlaza } from "@/lib/plaza-api";
import { getAllStories, type Story } from "@/lib/story-store";

export default function SubmitStoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const paramTitle = typeof params.title === "string" ? params.title : "";
  const paramPremise = typeof params.premise === "string" ? params.premise : "";
  const paramGenre = typeof params.genre === "string" ? params.genre : "";
  const paramProtagonistName =
    typeof params.protagonistName === "string" ? params.protagonistName : "";
  const paramProtagonistDescription =
    typeof params.protagonistDescription === "string" ? params.protagonistDescription : "";
  const paramProtagonistAppearance =
    typeof params.protagonistAppearance === "string" ? params.protagonistAppearance : "";
  const paramDifficulty = typeof params.difficulty === "string" ? params.difficulty : "普通";
  const paramInitialPacing =
    typeof params.initialPacing === "string" ? params.initialPacing : "轻松";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string>("custom");

  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [genre, setGenre] = useState("");
  const [protagonistName, setProtagonistName] = useState("");
  const [protagonistDescription, setProtagonistDescription] = useState("");
  const [protagonistAppearance, setProtagonistAppearance] = useState("");
  const [difficulty, setDifficulty] = useState("普通");
  const [initialPacing, setInitialPacing] = useState("轻松");
  const [extraDescription, setExtraDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("通用");

  useEffect(() => {
    async function run() {
      setLoading(true);
      const all = await getAllStories();
      setStories(all);

      if (paramTitle) {
        setSelectedStoryId("custom");
        setTitle(paramTitle);
        setPremise(paramPremise);
        setGenre(paramGenre);
        setProtagonistName(paramProtagonistName);
        setProtagonistDescription(paramProtagonistDescription);
        setProtagonistAppearance(paramProtagonistAppearance);
        setDifficulty(paramDifficulty);
        setInitialPacing(paramInitialPacing);
      }

      setLoading(false);
    }

    void run();
  }, [
    paramDifficulty,
    paramGenre,
    paramInitialPacing,
    paramPremise,
    paramProtagonistAppearance,
    paramProtagonistDescription,
    paramProtagonistName,
    paramTitle,
  ]);

  const selectedStory = useMemo(
    () => stories.find((item) => item.id === selectedStoryId) || null,
    [stories, selectedStoryId]
  );

  useEffect(() => {
    if (!selectedStory) return;
    setTitle(selectedStory.title);
    setPremise(selectedStory.premise);
    setGenre(selectedStory.genre);
    setProtagonistName(selectedStory.protagonistName);
    setProtagonistDescription(selectedStory.protagonistDescription);
    setProtagonistAppearance(selectedStory.protagonistAppearance || "");
    setDifficulty(selectedStory.difficulty || "普通");
    setInitialPacing(selectedStory.currentPacing || "轻松");
  }, [selectedStory]);

  async function handleSubmit() {
    if (!auth.isBound) {
      Alert.alert("提示", "请先绑定账号", [{ text: "去登录", onPress: () => router.push("/login" as any) }]);
      return;
    }

    if (!title.trim() || !premise.trim() || !genre.trim() || !protagonistName.trim()) {
      Alert.alert("错误", "标题、前提、类型、主角名为必填项");
      return;
    }

    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      await submitStoryPlaza({
        title: title.trim(),
        premise: premise.trim(),
        genre: genre.trim(),
        protagonistName: protagonistName.trim(),
        protagonistDescription: protagonistDescription.trim(),
        protagonistAppearance: protagonistAppearance.trim(),
        difficulty,
        initialPacing,
        extraDescription: extraDescription.trim(),
        tags,
      });

      Alert.alert("提交成功", "已进入审核队列", [{ text: "知道了", onPress: () => router.back() }]);
    } catch (err) {
      Alert.alert("提交失败", err instanceof Error ? err.message : "请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderBottomColor: colors.border }]}> 
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>关闭</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>投稿故事设置</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : null}

      {!loading ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.label, { color: colors.foreground }]}>选择来源（可选）</Text>
          <View style={styles.rowWrap}>
            <TouchableOpacity
              onPress={() => setSelectedStoryId("custom")}
              style={[
                styles.chip,
                {
                  borderColor: selectedStoryId === "custom" ? colors.primary : colors.border,
                  backgroundColor: selectedStoryId === "custom" ? `${colors.primary}20` : colors.surface,
                },
              ]}
            >
              <Text style={{ color: selectedStoryId === "custom" ? colors.primary : colors.foreground }}>
                手动填写
              </Text>
            </TouchableOpacity>

            {stories.slice(0, 20).map((story) => (
              <TouchableOpacity
                key={story.id}
                onPress={() => setSelectedStoryId(story.id)}
                style={[
                  styles.chip,
                  {
                    borderColor: selectedStoryId === story.id ? colors.primary : colors.border,
                    backgroundColor: selectedStoryId === story.id ? `${colors.primary}20` : colors.surface,
                  },
                ]}
              >
                <Text style={{ color: selectedStoryId === story.id ? colors.primary : colors.foreground }}>
                  {story.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.foreground }]}>标题</Text>
          <TextInput value={title} onChangeText={setTitle} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="标题" placeholderTextColor={colors.muted} />

          <Text style={[styles.label, { color: colors.foreground }]}>故事前提</Text>
          <TextInput value={premise} onChangeText={setPremise} style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="前提" placeholderTextColor={colors.muted} multiline />

          <Text style={[styles.label, { color: colors.foreground }]}>类型</Text>
          <TextInput value={genre} onChangeText={setGenre} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="奇幻 / 推理" placeholderTextColor={colors.muted} />

          <Text style={[styles.label, { color: colors.foreground }]}>主角名</Text>
          <TextInput value={protagonistName} onChangeText={setProtagonistName} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="主角名" placeholderTextColor={colors.muted} />

          <Text style={[styles.label, { color: colors.foreground }]}>主角描述</Text>
          <TextInput value={protagonistDescription} onChangeText={setProtagonistDescription} style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="主角描述" placeholderTextColor={colors.muted} multiline />

          <Text style={[styles.label, { color: colors.foreground }]}>主角外貌</Text>
          <TextInput value={protagonistAppearance} onChangeText={setProtagonistAppearance} style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="主角外貌" placeholderTextColor={colors.muted} multiline />

          <Text style={[styles.label, { color: colors.foreground }]}>额外描述</Text>
          <TextInput value={extraDescription} onChangeText={setExtraDescription} style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="投稿说明/玩法建议" placeholderTextColor={colors.muted} multiline />

          <Text style={[styles.label, { color: colors.foreground }]}>标签（逗号分隔）</Text>
          <TextInput value={tagsInput} onChangeText={setTagsInput} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="奇幻,推理" placeholderTextColor={colors.muted} />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            style={[styles.submitBtn, { backgroundColor: submitting ? colors.muted : colors.primary }]}
          >
            <Text style={styles.submitText}>{submitting ? "提交中..." : "提交审核"}</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  content: { padding: 16, gap: 10 },
  label: { fontWeight: "700" },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  textarea: { minHeight: 84, textAlignVertical: "top" },
  submitBtn: { marginTop: 8, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  submitText: { color: "#fff", fontWeight: "700" },
});
