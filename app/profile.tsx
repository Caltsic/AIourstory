import { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-provider";

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const auth = useAuth();

  const [nickname, setNickname] = useState(auth.user?.nickname || "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    setSubmitting(true);
    try {
      await auth.saveProfile({ nickname: nickname.trim() });
      Alert.alert("成功", "资料已更新");
      router.back();
    } catch (err) {
      Alert.alert("失败", err instanceof Error ? err.message : "更新失败");
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          个人资料
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.content}>
        <Text style={{ color: colors.muted }}>
          UUID: {auth.user?.uuid || "-"}
        </Text>
        <Text style={{ color: colors.muted }}>
          邮箱: {auth.user?.email || "未绑定"}
        </Text>
        <Text style={{ color: colors.muted }}>
          角色: {auth.user?.role || "user"}
        </Text>

        <TextInput
          value={nickname}
          onChangeText={setNickname}
          placeholder="昵称"
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            {
              color: colors.foreground,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        />

        <TouchableOpacity
          onPress={handleSave}
          disabled={submitting}
          style={[
            styles.primaryBtn,
            { backgroundColor: submitting ? colors.muted : colors.primary },
          ]}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>
            {submitting ? "保存中..." : "保存"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => {
            await auth.logout();
            Alert.alert("提示", "已切换到匿名设备账号");
            router.back();
          }}
          style={[styles.secondaryBtn, { borderColor: colors.error }]}
        >
          <Text style={{ color: colors.error, fontWeight: "700" }}>
            退出到匿名账号
          </Text>
        </TouchableOpacity>
      </View>
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
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryBtn: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
});
