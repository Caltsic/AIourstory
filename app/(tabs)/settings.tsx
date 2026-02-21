import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-provider";
import { clearAppLogs, formatLogLines, getAppLogs, logInfo } from "@/lib/app-logger";
import { setTestDiceValue } from "@/lib/dice";
import { getImageConfig, saveImageConfig } from "@/lib/image-client";
import { getLLMConfig, saveLLMConfig, testAPIKey } from "@/lib/llm-client";

const API_PRESETS = [
  { name: "OpenAI", apiUrl: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  { name: "DeepSeek", apiUrl: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat" },
  { name: "Grok (xAI)", apiUrl: "https://api.x.ai/v1/chat/completions", model: "grok-2-latest" },
  { name: "KIMI (Moonshot)", apiUrl: "https://api.moonshot.cn/v1/chat/completions", model: "moonshot-v1-8k" },
  { name: "GLM (Z.ai)", apiUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-flash" },
  {
    name: "Seed (Doubao)",
    apiUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    model: "doubao-seed-1-6-250615",
  },
  { name: "AIHubMix", apiUrl: "https://api.aihubmix.com/v1/chat/completions", model: "gpt-4o-mini" },
  {
    name: "Claude (OpenRouter)",
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    model: "anthropic/claude-3-haiku",
  },
  { name: "自定义", apiUrl: "", model: "" },
];

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const auth = useAuth();
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [model, setModel] = useState("");
  const [selectedPreset, setSelectedPreset] = useState(API_PRESETS.length - 1);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [testing, setTesting] = useState(false);

  const [imageApiKey, setImageApiKey] = useState("");
  const [imageApiUrl, setImageApiUrl] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [imageSize, setImageSize] = useState("");

  const [testerKey, setTesterKey] = useState("");
  const [testerActivated, setTesterActivated] = useState(false);
  const [fixedDiceValue, setFixedDiceValue] = useState(1);

  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsText, setLogsText] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    void loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const config = await getLLMConfig();
      setApiKey(config.apiKey || "");
      setApiUrl(config.apiUrl);
      setModel(config.model);

      const presetIndex = API_PRESETS.findIndex(
        (item) => item.apiUrl === config.apiUrl && item.model === config.model
      );
      if (presetIndex >= 0) {
        setSelectedPreset(presetIndex);
      }

      const imageConfig = await getImageConfig();
      setImageApiKey(imageConfig.imageApiKey || "");
      setImageApiUrl(imageConfig.imageApiUrl);
      setImageModel(imageConfig.imageModel);
      setImageSize(imageConfig.imageSize || "");
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  function handleSelectPreset(index: number) {
    const preset = API_PRESETS[index];
    if (preset.name !== "自定义") {
      setApiUrl(preset.apiUrl);
      setModel(preset.model);
    }
    setSelectedPreset(index);
    setShowPresetModal(false);
  }

  async function handleSaveApiConfig() {
    if (!apiKey.trim()) {
      Alert.alert("错误", "请输入 API Key");
      return;
    }
    if (!apiUrl.trim()) {
      Alert.alert("错误", "请输入 API URL");
      return;
    }
    if (!model.trim()) {
      Alert.alert("错误", "请输入模型名称");
      return;
    }

    try {
      await saveLLMConfig({
        apiKey: apiKey.trim(),
        apiUrl: apiUrl.trim(),
        model: model.trim(),
      });
      logInfo("settings", "AI config saved");
      Alert.alert("成功", "AI 配置已保存");
    } catch (error) {
      console.error("save ai config failed:", error);
      Alert.alert("错误", "保存配置失败");
    }
  }

  async function handleTestApi() {
    if (!apiKey.trim() || !apiUrl.trim() || !model.trim()) {
      Alert.alert("错误", "请先填写完整的 AI 配置");
      return;
    }

    setTesting(true);
    try {
      const ok = await testAPIKey(apiKey.trim(), apiUrl.trim(), model.trim());
      Alert.alert("测试结果", ok ? "连接成功" : "连接失败，请检查配置");
    } catch (error) {
      console.error("test ai config failed:", error);
      Alert.alert("错误", "测试失败");
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveImageConfig() {
    if (!imageApiUrl.trim() || !imageModel.trim()) {
      Alert.alert("错误", "请填写图片 API URL 和模型");
      return;
    }

    try {
      await saveImageConfig({
        imageApiKey: imageApiKey.trim(),
        imageApiUrl: imageApiUrl.trim(),
        imageModel: imageModel.trim(),
        imageSize: imageSize.trim(),
      });
      logInfo("settings", "Image config saved");
      Alert.alert("成功", "图片配置已保存");
    } catch (error) {
      console.error("save image config failed:", error);
      Alert.alert("错误", "保存图片配置失败");
    }
  }

  async function refreshLogs() {
    setLogsLoading(true);
    try {
      const logs = await getAppLogs(300);
      const text = formatLogLines(logs);
      setLogsText(text || "暂无日志");
    } catch (error) {
      console.error("read logs failed:", error);
      setLogsText("读取日志失败");
    } finally {
      setLogsLoading(false);
    }
  }

  async function handleOpenLogs() {
    setShowLogsModal(true);
    await refreshLogs();
  }

  async function handleClearLogs() {
    Alert.alert("清空日志", "确认清空本地日志吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "清空",
        style: "destructive",
        onPress: async () => {
          await clearAppLogs();
          setLogsText("暂无日志");
          Alert.alert("完成", "日志已清空");
        },
      },
    ]);
  }

  async function handleExportLogs() {
    const exportText = logsText.trim() || "暂无日志";
    await Share.share({
      message: exportText,
      title: "AIourStory Logs",
    });
  }

  async function handleClearData() {
    Alert.alert("清除所有数据", "这会删除所有本地故事存档，且无法撤销。", [
      { text: "取消", style: "cancel" },
      {
        text: "清除",
        style: "destructive",
        onPress: async () => {
          const keys = await AsyncStorage.getAllKeys();
          const storyKeys = keys.filter((k) => k.startsWith("story_") || k === "stories_index");
          await AsyncStorage.multiRemove(storyKeys);
          Alert.alert("完成", "本地故事数据已清除");
        },
      },
    ]);
  }

  function handleTesterVerify() {
    if (testerKey !== "1234567") {
      Alert.alert("错误", "测试密钥不正确");
      return;
    }
    setTesterActivated(true);
    setTestDiceValue(fixedDiceValue);
    Alert.alert("成功", "测试模式已开启");
  }

  function handleTesterDisable() {
    setTesterActivated(false);
    setTesterKey("");
    setTestDiceValue(null);
    Alert.alert("提示", "测试模式已关闭");
  }

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>设置</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>账号</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardRow}>
              <Text style={[styles.cardLabel, { color: colors.foreground }]}>当前身份</Text>
              <Text style={[styles.cardValue, { color: colors.muted }]}>
                {auth.user?.isBound
                  ? `${auth.user.nickname} (${auth.user.username || "bound"})`
                  : `${auth.user?.nickname || "匿名玩家"} (匿名)`}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={[styles.buttonRow, { paddingHorizontal: 16, paddingBottom: 14 }]}>
              {!auth.user?.isBound ? (
                <TouchableOpacity
                  onPress={() => router.push("/login" as never)}
                  style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                >
                  <IconSymbol name="person.fill" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>绑定/登录账号</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={() => router.push("/profile" as never)}
                    style={[styles.secondaryButton, { borderColor: colors.border }]}
                  >
                    <IconSymbol name="person.fill" size={18} color={colors.foreground} />
                    <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>编辑资料</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void auth.logout()}
                    style={[styles.secondaryButton, { borderColor: colors.border }]}
                  >
                    <IconSymbol name="xmark.circle" size={18} color={colors.foreground} />
                    <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>退出</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>日志</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              onPress={() => void handleOpenLogs()}
              style={[styles.secondaryButton, { borderColor: colors.border }]}
            >
              <IconSymbol name="doc.text.fill" size={18} color={colors.foreground} />
              <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>查看日志</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handleClearLogs()}
              style={[styles.dangerButton, { borderColor: colors.error, flex: 1 }]}
            >
              <IconSymbol name="trash.fill" size={18} color={colors.error} />
              <Text style={[styles.dangerButtonText, { color: colors.error }]}>清空日志</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>AI 配置</Text>

          <TouchableOpacity
            onPress={() => setShowPresetModal(true)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.cardRow}>
              <Text style={[styles.cardLabel, { color: colors.foreground }]}>预设</Text>
              <View style={styles.cardValueRow}>
                <Text style={[styles.cardValue, { color: colors.muted }]}>{API_PRESETS[selectedPreset].name}</Text>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              </View>
            </View>
          </TouchableOpacity>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.inputRow}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>API Key</Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.background }]}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="输入你的 API Key"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.inputRow}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>API URL</Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.background }]}
              value={apiUrl}
              onChangeText={setApiUrl}
              placeholder="https://api.openai.com/v1/chat/completions"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.inputRow}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>模型</Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.background }]}
              value={model}
              onChangeText={setModel}
              placeholder="gpt-4o-mini"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              onPress={() => void handleTestApi()}
              style={[styles.secondaryButton, { borderColor: colors.border }]}
              disabled={testing}
            >
              <IconSymbol name={testing ? "hourglass" : "checkmark.circle"} size={18} color={colors.foreground} />
              <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
                {testing ? "测试中..." : "测试连接"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handleSaveApiConfig()}
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            >
              <IconSymbol name="checkmark" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>保存配置</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>图片生成配置</Text>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.inputRow}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>API Key</Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.background }]}
              value={imageApiKey}
              onChangeText={setImageApiKey}
              placeholder="图片服务 API Key"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.inputRow}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>API URL</Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.background }]}
              value={imageApiUrl}
              onChangeText={setImageApiUrl}
              placeholder="https://api.siliconflow.cn/v1"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.inputRow}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>模型</Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.background }]}
              value={imageModel}
              onChangeText={setImageModel}
              placeholder="black-forest-labs/FLUX.1-schnell"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.inputRow}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>Size (可选)</Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.background }]}
              value={imageSize}
              onChangeText={setImageSize}
              placeholder="例如: 1024x1024"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            onPress={() => void handleSaveImageConfig()}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          >
            <IconSymbol name="checkmark" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>保存图片配置</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>测试员模式</Text>
          {!testerActivated ? (
            <>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.inputRow}>
                  <Text style={[styles.inputLabel, { color: colors.foreground }]}>测试密钥</Text>
                </View>
                <TextInput
                  style={[styles.input, { color: colors.foreground, backgroundColor: colors.background }]}
                  value={testerKey}
                  onChangeText={setTesterKey}
                  placeholder="输入测试密钥"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <TouchableOpacity
                onPress={handleTesterVerify}
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              >
                <IconSymbol name="checkmark.circle" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>验证</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardRow}>
                  <Text style={[styles.cardLabel, { color: colors.foreground }]}>固定骰子点数</Text>
                  <Text style={[styles.cardValue, { color: colors.primary }]}>{fixedDiceValue}</Text>
                </View>
                <View style={styles.diceRow}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
                    <TouchableOpacity
                      key={value}
                      onPress={() => {
                        setFixedDiceValue(value);
                        setTestDiceValue(value);
                      }}
                      style={[
                        styles.diceItem,
                        {
                          backgroundColor: fixedDiceValue === value ? colors.primary : colors.background,
                          borderColor: fixedDiceValue === value ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: fixedDiceValue === value ? "#fff" : colors.foreground, fontWeight: "700" }}>
                        {value}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <TouchableOpacity
                onPress={handleTesterDisable}
                style={[styles.dangerButton, { borderColor: colors.error }]}
              >
                <IconSymbol name="xmark.circle" size={18} color={colors.error} />
                <Text style={[styles.dangerButtonText, { color: colors.error }]}>关闭测试模式</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>数据管理</Text>
          <TouchableOpacity
            onPress={() => void handleClearData()}
            style={[styles.dangerButton, { borderColor: colors.error }]}
          >
            <IconSymbol name="trash.fill" size={18} color={colors.error} />
            <Text style={[styles.dangerButtonText, { color: colors.error }]}>清除所有故事数据</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>关于</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardRow}>
              <Text style={[styles.cardLabel, { color: colors.foreground }]}>应用名称</Text>
              <Text style={[styles.cardValue, { color: colors.muted }]}>AIourStory</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.cardRow}>
              <Text style={[styles.cardLabel, { color: colors.foreground }]}>版本</Text>
              <Text style={[styles.cardValue, { color: colors.muted }]}>{appVersion}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showPresetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPresetModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPresetModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>选择 API 预设</Text>
            {API_PRESETS.map((preset, index) => (
              <TouchableOpacity
                key={preset.name}
                style={[
                  styles.presetItem,
                  selectedPreset === index && { backgroundColor: `${colors.primary}20` },
                ]}
                onPress={() => handleSelectPreset(index)}
              >
                <Text
                  style={[
                    styles.presetName,
                    { color: colors.foreground },
                    selectedPreset === index && { color: colors.primary },
                  ]}
                >
                  {preset.name}
                </Text>
                {selectedPreset === index ? (
                  <IconSymbol name="checkmark" size={20} color={colors.primary} />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showLogsModal} animationType="slide" onRequestClose={() => setShowLogsModal(false)}>
        <ScreenContainer>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.logHeader}>
              <TouchableOpacity onPress={() => setShowLogsModal(false)}>
                <Text style={[styles.logHeaderAction, { color: colors.primary }]}>关闭</Text>
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.foreground, fontSize: 22 }]}>应用日志</Text>
              <TouchableOpacity onPress={() => void refreshLogs()}>
                <Text style={[styles.logHeaderAction, { color: colors.primary }]}>刷新</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 10 }}>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={() => void handleExportLogs()}
                style={[styles.secondaryButton, { borderColor: colors.border }]}
              >
                <IconSymbol name="paperplane.fill" size={18} color={colors.foreground} />
                <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>导出日志</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleClearLogs()}
                style={[styles.dangerButton, { borderColor: colors.error, flex: 1 }]}
              >
                <IconSymbol name="trash.fill" size={18} color={colors.error} />
                <Text style={[styles.dangerButtonText, { color: colors.error }]}>清空日志</Text>
              </TouchableOpacity>
            </View>
            {logsLoading ? <Text style={{ color: colors.muted }}>日志加载中...</Text> : null}
          </View>

          <ScrollView style={{ padding: 20 }} contentContainerStyle={{ paddingBottom: 30 }}>
            <Text selectable style={[styles.logText, { color: colors.foreground }]}>
              {logsText || "暂无日志"}
            </Text>
          </ScrollView>
        </ScreenContainer>
      </Modal>
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
    marginBottom: 12,
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
  cardValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  divider: {
    height: 0.5,
    marginLeft: 16,
  },
  inputRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
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
  diceRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexWrap: "wrap",
  },
  diceItem: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  modalContent: {
    width: "100%",
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  presetItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  presetName: {
    fontSize: 16,
    fontWeight: "500",
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logHeaderAction: {
    fontSize: 16,
    fontWeight: "600",
  },
  logText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
