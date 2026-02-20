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
import { submitPromptPlaza } from "@/lib/plaza-api";
import { getActivePrompts, getDefaultPrompts, listPresets, type PromptPreset } from "@/lib/prompt-store";

export default function SubmitPromptScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ presetId?: string }>();
  const auth = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("active");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("通用");

  useEffect(() => {
    async function run() {
      setLoading(true);
      const all = await listPresets();
      setPresets(all);

      if (params.presetId && typeof params.presetId === "string") {
        setSelectedPresetId(params.presetId);
      }
      setLoading(false);
    }
    run();
  }, [params.presetId]);

  const selectedPreset = useMemo(() => {
    if (selectedPresetId === "active") return null;
    return presets.find((item) => item.id === selectedPresetId) || null;
  }, [presets, selectedPresetId]);

  useEffect(() => {
    if (!selectedPreset) {
      setName("当前激活预设");
      setDescription("将上传当前激活提示词");
      return;
    }
    setName(selectedPreset.name);
    setDescription(selectedPreset.description || "");
  }, [selectedPreset]);

  async function handleSubmit() {
    if (!auth.isBound) {
      Alert.alert("提示", "请先绑定账号", [{ text: "去登录", onPress: () => router.push("/login" as any) }]);
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("错误", "请输入名称");
      return;
    }

    setSubmitting(true);
    try {
      const prompts = selectedPreset ? selectedPreset.prompts : await getActivePrompts();
      const tags = tagsInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      await submitPromptPlaza({
        name: trimmedName,
        description: description.trim(),
        promptsJson: JSON.stringify(prompts || getDefaultPrompts()),
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>投稿提示词</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : null}

      {!loading ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.label, { color: colors.foreground }]}>选择来源</Text>
          <View style={styles.rowWrap}>
            <TouchableOpacity
              onPress={() => setSelectedPresetId("active")}
              style={[
                styles.chip,
                {
                  borderColor: selectedPresetId === "active" ? colors.primary : colors.border,
                  backgroundColor: selectedPresetId === "active" ? `${colors.primary}20` : colors.surface,
                },
              ]}
            >
              <Text style={{ color: selectedPresetId === "active" ? colors.primary : colors.foreground }}>
                当前激活
              </Text>
            </TouchableOpacity>

            {presets.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                onPress={() => setSelectedPresetId(preset.id)}
                style={[
                  styles.chip,
                  {
                    borderColor: selectedPresetId === preset.id ? colors.primary : colors.border,
                    backgroundColor: selectedPresetId === preset.id ? `${colors.primary}20` : colors.surface,
                  },
                ]}
              >
                <Text style={{ color: selectedPresetId === preset.id ? colors.primary : colors.foreground }}>
                  {preset.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.foreground }]}>名称</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="投稿名称"
            placeholderTextColor={colors.muted}
          />

          <Text style={[styles.label, { color: colors.foreground }]}>描述</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="描述该预设适合什么场景"
            placeholderTextColor={colors.muted}
            multiline
          />

          <Text style={[styles.label, { color: colors.foreground }]}>标签（逗号分隔）</Text>
          <TextInput
            value={tagsInput}
            onChangeText={setTagsInput}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="通用,推理,奇幻"
            placeholderTextColor={colors.muted}
          />

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
  textarea: { minHeight: 100, textAlignVertical: "top" },
  submitBtn: { marginTop: 8, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  submitText: { color: "#fff", fontWeight: "700" },
});
