import { Text, View, TouchableOpacity, StyleSheet, Alert, Linking } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function SettingsScreen() {
  const colors = useColors();

  async function handleClearData() {
    Alert.alert(
      "清除所有数据",
      "这将删除所有故事存档，此操作不可撤销。确定继续吗？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "清除",
          style: "destructive",
          onPress: async () => {
            const keys = await AsyncStorage.getAllKeys();
            const storyKeys = keys.filter(
              (k) => k.startsWith("story_") || k === "stories_index"
            );
            await AsyncStorage.multiRemove(storyKeys);
            Alert.alert("完成", "所有故事数据已清除");
          },
        },
      ]
    );
  }

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>设置</Text>
      </View>

      <View style={styles.content}>
        {/* About Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>关于</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardRow}>
              <Text style={[styles.cardLabel, { color: colors.foreground }]}>应用名称</Text>
              <Text style={[styles.cardValue, { color: colors.muted }]}>AI剧情物语</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.cardRow}>
              <Text style={[styles.cardLabel, { color: colors.foreground }]}>版本</Text>
              <Text style={[styles.cardValue, { color: colors.muted }]}>1.0.0</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.cardRow}>
              <Text style={[styles.cardLabel, { color: colors.foreground }]}>AI引擎</Text>
              <Text style={[styles.cardValue, { color: colors.muted }]}>内置LLM</Text>
            </View>
          </View>
        </View>

        {/* How to play */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>玩法说明</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.helpText, { color: colors.foreground }]}>
              1. 创建新故事，填写标题和故事开头{"\n"}
              2. AI会根据你的设定生成剧情{"\n"}
              3. 点击对话框推进剧情{"\n"}
              4. 遇到选项时做出选择{"\n"}
              5. AI根据你的选择继续生成剧情{"\n"}
              6. 每个选择都会影响故事走向
            </Text>
          </View>
        </View>

        {/* Data */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>数据管理</Text>
          <TouchableOpacity
            onPress={handleClearData}
            style={[styles.dangerButton, { borderColor: colors.error }]}
            activeOpacity={0.7}
          >
            <IconSymbol name="trash.fill" size={18} color={colors.error} />
            <Text style={[styles.dangerButtonText, { color: colors.error }]}>
              清除所有故事数据
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  cardValue: {
    fontSize: 15,
  },
  divider: {
    height: 0.5,
    marginLeft: 16,
  },
  helpText: {
    fontSize: 14,
    lineHeight: 24,
    padding: 16,
  },
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  dangerButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
