import { useEffect, useState } from "react";
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
import {
  getStoryPlazaDetail,
  submitContentReport,
  toggleStoryLike,
} from "@/lib/plaza-api";
import type { StoryPlazaDetail } from "@shared/api-types";

export default function StoryDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ uuid?: string }>();

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<StoryPlazaDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const uuid = params.uuid;
    if (!uuid || typeof uuid !== "string") {
      setError("Missing story uuid");
      setLoading(false);
      return;
    }

    getStoryPlazaDetail(uuid)
      .then((data) => setItem(data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Load failed"),
      )
      .finally(() => setLoading(false));
  }, [params.uuid]);

  async function handleLike() {
    if (!item) return;
    try {
      await toggleStoryLike(item.uuid);
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

  function handleUseStory() {
    if (!item) return;
    router.push({
      pathname: "/create-story",
      params: {
        title: item.title,
        premise: item.premise,
        genre: item.genre,
        protagonistName: item.protagonistName,
        protagonistDescription: item.protagonistDescription,
        protagonistAppearance: item.protagonistAppearance,
        difficulty: item.difficulty,
        initialPacing: item.initialPacing,
      },
    });
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
                targetType: "story",
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
          故事详情
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
            {item.title}
          </Text>
          <Text style={{ color: colors.muted }}>
            {item.genre} · {item.difficulty}
          </Text>
          <Text style={[styles.meta, { color: colors.muted }]}>
            by {item.author.nickname} · 下载 {item.downloadCount} · ♥{" "}
            {item.likeCount}
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={handleLike}
            >
              <Text style={{ color: colors.foreground }}>
                {item.isLiked ? "取消点赞" : "点赞"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleUseStory}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                开始此故事
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.warning }]}
              onPress={handleReport}
            >
              <Text style={{ color: colors.warning }}>举报</Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.block,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.blockTitle, { color: colors.foreground }]}>
              故事前提
            </Text>
            <Text style={{ color: colors.muted }}>{item.premise}</Text>
          </View>

          <View
            style={[
              styles.block,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.blockTitle, { color: colors.foreground }]}>
              主角设定
            </Text>
            <Text style={{ color: colors.muted }}>
              姓名：{item.protagonistName}
            </Text>
            <Text style={{ color: colors.muted }}>
              描述：{item.protagonistDescription || "无"}
            </Text>
            <Text style={{ color: colors.muted }}>
              外貌：{item.protagonistAppearance || "无"}
            </Text>
          </View>

          <View
            style={[
              styles.block,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.blockTitle, { color: colors.foreground }]}>
              作者补充
            </Text>
            <Text style={{ color: colors.muted }}>
              {item.extraDescription || "无"}
            </Text>
          </View>
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
  primaryBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  block: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  blockTitle: { fontSize: 15, fontWeight: "700" },
});
