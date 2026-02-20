import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-provider";

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const auth = useAuth();

  const [mode, setMode] = useState<"bind" | "login">("bind");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!username.trim() || !password.trim()) {
      Alert.alert("提示", "用户名和密码不能为空");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "bind") {
        await auth.register(username.trim(), password.trim(), nickname.trim() || undefined);
        Alert.alert("成功", "账号绑定完成");
      } else {
        await auth.login(username.trim(), password.trim());
        Alert.alert("成功", "登录成功");
      }
      router.back();
    } catch (err) {
      Alert.alert("失败", err instanceof Error ? err.message : "请稍后重试");
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>账号</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.segmentWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
          <TouchableOpacity
            onPress={() => setMode("bind")}
            style={[styles.segment, mode === "bind" && { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: mode === "bind" ? "#fff" : colors.foreground, fontWeight: "700" }}>绑定新账号</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode("login")}
            style={[styles.segment, mode === "login" && { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: mode === "login" ? "#fff" : colors.foreground, fontWeight: "700" }}>已有账号登录</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="用户名"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
          autoCapitalize="none"
        />

        {mode === "bind" ? (
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            placeholder="昵称（可选）"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
        ) : null}

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="密码"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
          secureTextEntry
        />

        <TouchableOpacity
          disabled={submitting}
          onPress={handleSubmit}
          style={[styles.submitBtn, { backgroundColor: submitting ? colors.muted : colors.primary }]}
        >
          <Text style={styles.submitText}>{submitting ? "处理中..." : mode === "bind" ? "绑定账号" : "登录"}</Text>
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
  segmentWrap: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  segment: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  submitBtn: { borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 8 },
  submitText: { color: "#fff", fontWeight: "700" },
});
