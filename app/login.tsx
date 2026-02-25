import { useEffect, useState } from "react";
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

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const auth = useAuth();

  const [mode, setMode] = useState<"bind" | "login">("bind");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [resetMode, setResetMode] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSubmit() {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password.trim()) {
      Alert.alert("提示", "邮箱和密码不能为空");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "bind") {
        if (!resetCode.trim()) {
          Alert.alert("提示", "绑定账号需要邮箱验证码");
          return;
        }
        await auth.register(
          normalizedEmail,
          password.trim(),
          resetCode.trim(),
          nickname.trim() || undefined,
        );
        Alert.alert("成功", "账号绑定完成");
      } else {
        await auth.login(normalizedEmail, password.trim());
        Alert.alert("成功", "登录成功");
      }
      router.back();
    } catch (err) {
      Alert.alert("失败", err instanceof Error ? err.message : "请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendCodeForBind() {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      Alert.alert("提示", "请输入邮箱");
      return;
    }
    setSendingCode(true);
    try {
      await auth.sendCode(normalizedEmail, "register");
      setCooldown(60);
      Alert.alert("成功", "验证码已发送，请查收邮箱");
    } catch (err) {
      Alert.alert("失败", err instanceof Error ? err.message : "请稍后重试");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSendCodeForReset() {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      Alert.alert("提示", "请输入邮箱");
      return;
    }
    setSendingCode(true);
    try {
      await auth.sendCode(normalizedEmail, "reset");
      setCooldown(60);
      Alert.alert("成功", "重置验证码已发送");
    } catch (err) {
      Alert.alert("失败", err instanceof Error ? err.message : "请稍后重试");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleResetPassword() {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !resetCode.trim() || !newPassword.trim()) {
      Alert.alert("提示", "邮箱、验证码、新密码不能为空");
      return;
    }
    setSubmitting(true);
    try {
      await auth.resetPassword(
        normalizedEmail,
        resetCode.trim(),
        newPassword.trim(),
      );
      Alert.alert("成功", "密码已重置，请使用新密码登录");
      setResetMode(false);
      setMode("login");
      setPassword(newPassword.trim());
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {resetMode ? "重置密码" : "账号"}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.content}>
        {!resetMode ? (
          <>
            <View
              style={[
                styles.segmentWrap,
                { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <TouchableOpacity
                onPress={() => setMode("bind")}
                style={[
                  styles.segment,
                  mode === "bind" && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={{
                    color: mode === "bind" ? "#fff" : colors.foreground,
                    fontWeight: "700",
                  }}
                >
                  绑定邮箱
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMode("login")}
                style={[
                  styles.segment,
                  mode === "login" && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={{
                    color: mode === "login" ? "#fff" : colors.foreground,
                    fontWeight: "700",
                  }}
                >
                  密码登录
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="邮箱"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />

            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="密码（6-64位）"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            {mode === "bind" ? (
              <>
                <View style={styles.codeRow}>
                  <TextInput
                    value={resetCode}
                    onChangeText={setResetCode}
                    placeholder="邮箱验证码"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      styles.codeInput,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                    keyboardType="number-pad"
                  />
                  <TouchableOpacity
                    disabled={sendingCode || cooldown > 0}
                    onPress={handleSendCodeForBind}
                    style={[
                      styles.sendCodeBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor:
                          sendingCode || cooldown > 0
                            ? colors.surface
                            : colors.primary,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          sendingCode || cooldown > 0 ? colors.muted : "#fff",
                        fontWeight: "700",
                      }}
                    >
                      {sendingCode
                        ? "发送中"
                        : cooldown > 0
                          ? `${cooldown}s`
                          : "发送验证码"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={nickname}
                  onChangeText={setNickname}
                  placeholder="昵称（可选）"
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
              </>
            ) : null}

            <TouchableOpacity
              disabled={submitting}
              onPress={handleSubmit}
              style={[
                styles.submitBtn,
                { backgroundColor: submitting ? colors.muted : colors.primary },
              ]}
            >
              <Text style={styles.submitText}>
                {submitting
                  ? "处理中..."
                  : mode === "bind"
                    ? "绑定账号"
                    : "登录"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setResetMode(true)}
              style={{ marginTop: 14, alignSelf: "center" }}
            >
              <Text style={{ color: colors.primary, fontWeight: "700" }}>
                忘记密码？去重置
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="已注册邮箱"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
            <View style={styles.codeRow}>
              <TextInput
                value={resetCode}
                onChangeText={setResetCode}
                placeholder="重置验证码"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  styles.codeInput,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
                keyboardType="number-pad"
              />
              <TouchableOpacity
                disabled={sendingCode || cooldown > 0}
                onPress={handleSendCodeForReset}
                style={[
                  styles.sendCodeBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor:
                      sendingCode || cooldown > 0
                        ? colors.surface
                        : colors.primary,
                  },
                ]}
              >
                <Text
                  style={{
                    color: sendingCode || cooldown > 0 ? colors.muted : "#fff",
                    fontWeight: "700",
                  }}
                >
                  {sendingCode
                    ? "发送中"
                    : cooldown > 0
                      ? `${cooldown}s`
                      : "发送验证码"}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="新密码（6-64位）"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              disabled={submitting}
              onPress={handleResetPassword}
              style={[
                styles.submitBtn,
                { backgroundColor: submitting ? colors.muted : colors.primary },
              ]}
            >
              <Text style={styles.submitText}>
                {submitting ? "处理中..." : "确认重置密码"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setResetMode(false)}
              style={{ marginTop: 14, alignSelf: "center" }}
            >
              <Text style={{ color: colors.primary, fontWeight: "700" }}>
                返回登录
              </Text>
            </TouchableOpacity>
          </>
        )}
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
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  codeInput: { flex: 1 },
  sendCodeBtn: {
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 110,
  },
  submitBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  submitText: { color: "#fff", fontWeight: "700" },
});
