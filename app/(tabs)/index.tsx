import { useCallback, useState } from "react";
import {
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getAllStories, deleteStory, type Story } from "@/lib/story-store";

const GENRE_COLORS: Record<string, string> = {
  "奇幻冒险": "#7c3aed",
  "校园日常": "#2563eb",
  "悬疑推理": "#dc2626",
  "科幻未来": "#0891b2",
  "都市情感": "#db2777",
  "古风仙侠": "#b45309",
  "自定义": "#6b7280",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadStories();
    }, [])
  );

  async function loadStories() {
    setLoading(true);
    const data = await getAllStories();
    setStories(data);
    setLoading(false);
  }

  function handleCreate() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push("/create-story");
  }

  function handlePlay(story: Story) {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({ pathname: "/game", params: { storyId: story.id } });
  }

  function handleDelete(story: Story) {
    Alert.alert("删除故事", `确定要删除「${story.title}」吗？此操作不可撤销。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          await deleteStory(story.id);
          loadStories();
        },
      },
    ]);
  }

  function renderStoryCard({ item }: { item: Story }) {
    const genreColor = GENRE_COLORS[item.genre] || GENRE_COLORS["自定义"];
    const segmentCount = item.segments.length;
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handlePlay(item)}
        onLongPress={() => handleDelete(item)}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {item.difficulty && item.difficulty !== "普通" && (
              <View style={[styles.genreBadge, { backgroundColor: "#6b728020" }]}>
                <Text style={[styles.genreText, { color: "#6b7280" }]}>{item.difficulty}</Text>
              </View>
            )}
            <View style={[styles.genreBadge, { backgroundColor: genreColor + "30" }]}>
              <Text style={[styles.genreText, { color: genreColor }]}>{item.genre}</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.cardPremise, { color: colors.muted }]} numberOfLines={2}>
          {item.premise}
        </Text>
        <View style={styles.cardFooter}>
          <View style={styles.cardMeta}>
            <IconSymbol name="text.bubble.fill" size={14} color={colors.muted} />
            <Text style={[styles.metaText, { color: colors.muted }]}>
              {segmentCount} 段剧情
            </Text>
          </View>
          <Text style={[styles.timeText, { color: colors.muted }]}>
            {formatTime(item.updatedAt)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  function renderEmpty() {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <IconSymbol name="book.fill" size={64} color={colors.muted} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>还没有故事</Text>
        <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
          点击下方按钮，开始你的第一段冒险
        </Text>
        <TouchableOpacity
          onPress={handleCreate}
          style={[styles.emptyButton, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
        >
          <Text style={styles.emptyButtonText}>创建故事</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>我的故事</Text>
        <TouchableOpacity
          onPress={handleCreate}
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
        >
          <IconSymbol name="plus.circle.fill" size={20} color="#fff" />
          <Text style={styles.addButtonText}>新建</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        renderItem={renderStoryCard}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={stories.length === 0 ? styles.emptyList : styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyList: {
    flexGrow: 1,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },
  genreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  genreText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cardPremise: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 13,
  },
  timeText: {
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyButton: {
    marginTop: 20,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
  },
  emptyButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
