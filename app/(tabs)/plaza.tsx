import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-provider";
import { listPromptPlaza, listStoryPlaza } from "@/lib/plaza-api";
import type { PromptPlazaItem, StoryPlazaItem } from "@shared/api-types";

type PlazaTab = "prompts" | "stories";
type Sort = "newest" | "popular" | "downloads";

export default function PlazaTabScreen() {
  const colors = useColors();
  const router = useRouter();
  const auth = useAuth();

  const [tab, setTab] = useState<PlazaTab>("prompts");
  const [sort, setSort] = useState<Sort>("newest");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [promptItems, setPromptItems] = useState<PromptPlazaItem[]>([]);
  const [storyItems, setStoryItems] = useState<StoryPlazaItem[]>([]);

  const visibleItems = useMemo(
    () => (tab === "prompts" ? promptItems : storyItems),
    [tab, promptItems, storyItems]
  );

  const loadData = useCallback(
    async (isRefresh = false) => {
      try {
        setError(null);
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        if (tab === "prompts") {
          const result = await listPromptPlaza({ sort, search: search.trim() || undefined });
          setPromptItems(result.items);
        } else {
          const result = await listStoryPlaza({ sort, search: search.trim() || undefined });
          setStoryItems(result.items);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Load plaza failed";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tab, sort, search]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderBottomColor: colors.border }]}> 
        <Text style={[styles.title, { color: colors.foreground }]}>社区广场</Text>
        <TouchableOpacity
          style={[styles.inlineBtn, { borderColor: colors.border }]}
          onPress={() => router.push("/plaza/my-submissions" as any)}
        >
          <IconSymbol name="list.bullet" size={16} color={colors.foreground} />
          <Text style={[styles.inlineBtnText, { color: colors.foreground }]}>我的投稿</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <View style={[styles.segmentWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
          <TouchableOpacity
            style={[styles.segment, tab === "prompts" && { backgroundColor: colors.primary }]}
            onPress={() => setTab("prompts")}
          >
            <Text style={[styles.segmentText, { color: tab === "prompts" ? "#fff" : colors.foreground }]}>提示词广场</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, tab === "stories" && { backgroundColor: colors.primary }]}
            onPress={() => setTab("stories")}
          >
            <Text style={[styles.segmentText, { color: tab === "stories" ? "#fff" : colors.foreground }]}>故事广场</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={tab === "prompts" ? "搜索提示词" : "搜索故事"}
          placeholderTextColor={colors.muted}
          style={[styles.searchInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
          onSubmitEditing={() => loadData()}
          returnKeyType="search"
        />

        <View style={styles.sortRow}>
          {(["newest", "popular", "downloads"] as Sort[]).map((item) => (
            <TouchableOpacity
              key={item}
              onPress={() => setSort(item)}
              style={[
                styles.chip,
                {
                  borderColor: sort === item ? colors.primary : colors.border,
                  backgroundColor: sort === item ? `${colors.primary}20` : colors.surface,
                },
              ]}
            >
              <Text style={{ color: sort === item ? colors.primary : colors.foreground, fontWeight: "600" }}>
                {item === "newest" ? "最新" : item === "popular" ? "热门" : "下载"}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            onPress={() =>
              router.push((tab === "prompts" ? "/plaza/submit-prompt" : "/plaza/submit-story") as any)
            }
            style={[styles.submitBtn, { backgroundColor: auth.isBound ? colors.primary : colors.muted }]}
          >
            <Text style={styles.submitBtnText}>{auth.isBound ? "投稿" : "先绑定账号"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
      >
        {loading && !visibleItems.length ? <ActivityIndicator color={colors.primary} /> : null}

        {error ? (
          <View style={[styles.empty, { borderColor: colors.error }]}> 
            <Text style={[styles.emptyTitle, { color: colors.error }]}>{error}</Text>
            <TouchableOpacity style={[styles.retryBtn, { borderColor: colors.border }]} onPress={() => loadData()}>
              <Text style={{ color: colors.foreground }}>重试</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading && !error && !visibleItems.length ? (
          <View style={[styles.empty, { borderColor: colors.border }]}> 
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>暂无内容</Text>
            <Text style={{ color: colors.muted }}>稍后再来看看，或者先投稿一条。</Text>
          </View>
        ) : null}

        {tab === "prompts"
          ? (visibleItems as PromptPlazaItem[]).map((item) => (
              <TouchableOpacity
                key={item.uuid}
                style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => router.push({ pathname: "/plaza/prompt-detail" as any, params: { uuid: item.uuid } })}
              >
                <View style={styles.cardTop}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ color: colors.muted }}>♥ {item.likeCount}</Text>
                </View>
                <Text style={{ color: colors.muted }} numberOfLines={2}>
                  {item.description || "无描述"}
                </Text>
                <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>
                  by {item.author.nickname} · 下载 {item.downloadCount}
                </Text>
              </TouchableOpacity>
            ))
          : (visibleItems as StoryPlazaItem[]).map((item) => (
              <TouchableOpacity
                key={item.uuid}
                style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => router.push({ pathname: "/plaza/story-detail" as any, params: { uuid: item.uuid } })}
              >
                <View style={styles.cardTop}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={{ color: colors.muted }}>{item.genre}</Text>
                </View>
                <Text style={{ color: colors.muted }} numberOfLines={2}>
                  {item.premise}
                </Text>
                <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>
                  主角 {item.protagonistName} · ♥ {item.likeCount} · 下载 {item.downloadCount}
                </Text>
              </TouchableOpacity>
            ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 24, fontWeight: "800" },
  inlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inlineBtnText: { fontSize: 12, fontWeight: "600" },
  toolbar: { padding: 16, gap: 12 },
  segmentWrap: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    flexDirection: "row",
    gap: 6,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  segmentText: { fontWeight: "700", fontSize: 13 },
  searchInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  submitBtn: {
    marginLeft: "auto",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  submitBtnText: { color: "#fff", fontWeight: "700" },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  cardTitle: { fontWeight: "700", fontSize: 16, flex: 1, marginRight: 8 },
  empty: { borderWidth: 1, borderRadius: 12, padding: 16, alignItems: "center", gap: 8 },
  emptyTitle: { fontWeight: "700", fontSize: 16 },
  retryBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
});
