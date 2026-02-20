import { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { listMyPromptSubmissions, listMyStorySubmissions } from "@/lib/plaza-api";

type Tab = "prompts" | "stories";

type Submission = {
  uuid: string;
  status: "pending" | "approved" | "rejected";
  rejectReason: string | null;
  likeCount: number;
  downloadCount: number;
  createdAt: string;
  name?: string;
  title?: string;
};

export default function MySubmissionsScreen() {
  const colors = useColors();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("prompts");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [promptItems, setPromptItems] = useState<Submission[]>([]);
  const [storyItems, setStoryItems] = useState<Submission[]>([]);

  async function loadData(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [prompts, stories] = await Promise.all([listMyPromptSubmissions(), listMyStorySubmissions()]);
      setPromptItems(prompts as Submission[]);
      setStoryItems(stories as Submission[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const list = tab === "prompts" ? promptItems : storyItems;

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderBottomColor: colors.border }]}> 
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>关闭</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>我的投稿</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={[styles.segmentWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
        <TouchableOpacity
          style={[styles.segment, tab === "prompts" && { backgroundColor: colors.primary }]}
          onPress={() => setTab("prompts")}
        >
          <Text style={[styles.segmentText, { color: tab === "prompts" ? "#fff" : colors.foreground }]}>提示词</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, tab === "stories" && { backgroundColor: colors.primary }]}
          onPress={() => setTab("stories")}
        >
          <Text style={[styles.segmentText, { color: tab === "stories" ? "#fff" : colors.foreground }]}>故事设置</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : null}

      {!loading ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        >
          {!list.length ? <Text style={{ color: colors.muted }}>暂无投稿</Text> : null}

          {list.map((item) => (
            <View key={item.uuid} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.name || item.title || item.uuid}</Text>
              <Text style={{ color: colors.muted }}>
                状态：
                {item.status === "pending"
                  ? "审核中"
                  : item.status === "approved"
                    ? "已通过"
                    : `已驳回${item.rejectReason ? ` (${item.rejectReason})` : ""}`}
              </Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>
                下载 {item.downloadCount} · 点赞 {item.likeCount}
              </Text>
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
  segmentWrap: {
    margin: 16,
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    flexDirection: "row",
    gap: 6,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 8,
  },
  segmentText: { fontWeight: "700" },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  cardTitle: { fontWeight: "700", fontSize: 16, marginBottom: 6 },
});
