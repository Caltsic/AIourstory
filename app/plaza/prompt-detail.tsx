import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-provider";
import {
  downloadPrompt,
  getPromptPlazaDetail,
  submitContentReport,
  togglePromptLike,
} from "@/lib/plaza-api";
import {
  generatePresetId,
  savePreset,
  setActivePresetId,
} from "@/lib/prompt-store";
import type { PromptPlazaDetail } from "@shared/api-types";

export default function PromptDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ uuid?: string }>();

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<PromptPlazaDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const promptEntries = useMemo(() => {
    if (!item) return [] as [string, string][];
    try {
      const parsed = JSON.parse(item.promptsJson) as Record<string, string>;
      return Object.entries(parsed);
    } catch {
      return [] as [string, string][];
    }
  }, [item]);

  useEffect(() => {
    const uuid = params.uuid;
    if (!uuid || typeof uuid !== "string") {
      setError("Missing prompt uuid");
      setLoading(false);
      return;
    }

    getPromptPlazaDetail(uuid)
      .then((data) => setItem(data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Load failed"),
      )
      .finally(() => setLoading(false));
  }, [params.uuid]);

  async function handleLike() {
    if (!item) return;
    try {
      await togglePromptLike(item.uuid);
      setItem((prev) =>
        prev
          ? {
              ...prev,
              isLiked: !prev.isLiked,
              likeCount: prev.isLiked
                ? Math.max(0, prev.likeCount - 1)
                : prev.likeCount + 1,
            }
          : prev,
      );
    } catch (err) {
      Alert.alert("提示", err instanceof Error ? err.message : "操作失败");
    }
  }

  async function handleUsePreset() {
    if (!item) return;

    try {
      const detail = await downloadPrompt(item.uuid);
      const prompts = JSON.parse(detail.promptsJson) as Record<string, string>;
      const id = generatePresetId();

      await savePreset({
        id,
        name: `${detail.name} (来自广场)`,
        description: detail.description || "",
        imageUri: null,
        prompts: prompts as any,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await setActivePresetId(id);

      Alert.alert("成功", "已保存到本地并激活。", [
        { text: "去查看", onPress: () => router.replace("/(tabs)/prompts") },
      ]);
    } catch (err) {
      Alert.alert("失败", err instanceof Error ? err.message : "保存失败");
    }
  }

  function handleReport() {
    if (!item) return;
    const options = [
      { label: "违法违规", value: "illegal" as const },
      { label: "色情低俗", value: "sexual" as const },
      { label: "人身攻击", value: "abuse" as const },
      { label: "垃圾广告", value: "spam" as const },
      { label: "其他", value: "other" as const },
    ];

    Alert.alert(
      "举报内容",
      "请选择举报原因",
      [
        ...options.map((option) => ({
          text: option.label,
          onPress: async () => {
            try {
              await submitContentReport({
                targetType: "prompt",
                targetUuid: item.uuid,
                reasonType: option.value,
                reasonText: option.label,
              });
              Alert.alert("已提交", "感谢反馈，我们会尽快核查。");
            } catch (err) {
              Alert.alert(
                "提交失败",
                err instanceof Error ? err.message : "举报失败",
              );
            }
          },
        })),
        { text: "取消", style: "cancel" as const },
      ],
      { cancelable: true },
    );
  }

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>关闭</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          提示词详情
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : null}
      {error ? (
        <Text style={{ color: colors.error, padding: 16 }}>{error}</Text>
      ) : null}

      {item ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {item.name}
          </Text>
          <Text style={{ color: colors.muted }}>
            {item.description || "无描述"}
          </Text>
          <Text style={[styles.meta, { color: colors.muted }]}>
            by {item.author.nickname} · 下载 {item.downloadCount}
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={handleLike}
            >
              <Text style={{ color: colors.foreground }}>
                {item.isLiked ? "取消点赞" : "点赞"} ({item.likeCount})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleUsePreset}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                使用此预设
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.warning }]}
              onPress={handleReport}
            >
              <Text style={{ color: colors.warning }}>举报</Text>
            </TouchableOpacity>
          </View>

          {!auth.isBound ? (
            <TouchableOpacity onPress={() => router.push("/login" as any)}>
              <Text style={{ color: colors.primary, marginBottom: 12 }}>
                绑定账号后可投稿与管理
              </Text>
            </TouchableOpacity>
          ) : null}

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            提示词内容
          </Text>
          {promptEntries.map(([key, value]) => (
            <View
              key={key}
              style={[
                styles.block,
                { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <Text
                style={{
                  color: colors.foreground,
                  fontWeight: "700",
                  marginBottom: 6,
                }}
              >
                {key}
              </Text>
              <Text style={{ color: colors.muted }}>{value}</Text>
            </View>
          ))}
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
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: "800" },
  meta: { fontSize: 12 },
  buttonRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sectionTitle: { marginTop: 4, fontSize: 16, fontWeight: "700" },
  block: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
