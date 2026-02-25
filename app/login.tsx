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
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSendCode() {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      Alert.alert("提示", "请输入邮箱");
      return;
    }

    setSendingCode(true);
    try {
      await auth.sendCode(normalizedEmail);
      setCooldown(60);
      Alert.alert("成功", "验证码已发送，请查收邮箱");
    } catch (err) {
      Alert.alert("失败", err instanceof Error ? err.message : "请稍后重试");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSubmit() {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !code.trim()) {
      Alert.alert("提示", "邮箱和验证码不能为空");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "bind") {
        await auth.register(
          normalizedEmail,
          code.trim(),
          nickname.trim() || undefined,
        );
        Alert.alert("成功", "账号绑定完成");
      } else {
        await auth.login(normalizedEmail, code.trim());
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          账号
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.content}>
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
              邮箱登录
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

        <View style={styles.codeRow}>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="验证码"
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
            autoCapitalize="none"
            keyboardType="number-pad"
          />
          <TouchableOpacity
            disabled={sendingCode || cooldown > 0}
            onPress={handleSendCode}
            style={[
              styles.sendCodeBtn,
              {
                borderColor: colors.border,
                backgroundColor:
                  sendingCode || cooldown > 0 ? colors.surface : colors.primary,
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

        {mode === "bind" ? (
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
            {submitting ? "处理中..." : mode === "bind" ? "绑定账号" : "登录"}
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
