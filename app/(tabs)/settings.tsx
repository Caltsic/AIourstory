import { useState, useEffect } from "react";
import { Text, View, TouchableOpacity, StyleSheet, Alert, TextInput, ScrollView, Modal } from "react-native";
import Constants from "expo-constants";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLLMConfig, saveLLMConfig, testAPIKey } from "@/lib/llm-client";
import { getImageConfig, saveImageConfig } from "@/lib/image-client";
import { setTestDiceValue } from "@/lib/dice";

// 预设的 API 配置
const API_PRESETS = [
  {
    name: "OpenAI",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  },
  {
    name: "DeepSeek",
    apiUrl: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
  },
  {
    name: "Grok (xAI)",
    apiUrl: "https://api.x.ai/v1/chat/completions",
    model: "grok-2-latest",
  },
  {
    name: "KIMI (Moonshot)",
    apiUrl: "https://api.moonshot.cn/v1/chat/completions",
    model: "moonshot-v1-8k",
  },
  {
    name: "GLM (Z.ai)",
    apiUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model: "glm-4-flash",
  },
  {
    name: "Seed (Doubao)",
    apiUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    model: "doubao-seed-1-6-250615",
  },
  {
    name: "AIHubMix",
    apiUrl: "https://api.aihubmix.com/v1/chat/completions",
    model: "gpt-4o-mini",
  },
  {
    name: "Claude (通过 OpenRouter)",
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    model: "anthropic/claude-3-haiku",
  },
  {
    name: "自定义",
    apiUrl: "",
    model: "",
  },
];

export default function SettingsScreen() {
  const colors = useColors();
  const appVersion = Constants.expoConfig?.version ?? "1.0.1";

  // AI API 配置状态
  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [model, setModel] = useState("");
  const [selectedPreset, setSelectedPreset] = useState(API_PRESETS.length - 1); // 默认为自定义
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [testing, setTesting] = useState(false);

  // 测试员模式状态
  const [testerKey, setTesterKey] = useState("");
  const [testerActivated, setTesterActivated] = useState(false);
  const [fixedDiceValue, setFixedDiceValue] = useState(1);

  // 图片生成 API 配置状态
  const [imageApiKey, setImageApiKey] = useState("");
  const [imageApiUrl, setImageApiUrl] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [imageSize, setImageSize] = useState("");

  // 加载保存的配置
  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const config = await getLLMConfig();
      setApiKey(config.apiKey || "");
      setApiUrl(config.apiUrl);
      setModel(config.model);

      const presetIndex = API_PRESETS.findIndex(
        p => p.apiUrl === config.apiUrl && p.model === config.model
      );
      if (presetIndex >= 0) {
        setSelectedPreset(presetIndex);
      }

      const imgConfig = await getImageConfig();
      setImageApiKey(imgConfig.imageApiKey || "");
      setImageApiUrl(imgConfig.imageApiUrl);
      setImageModel(imgConfig.imageModel);
      setImageSize(imgConfig.imageSize || "");
    } catch (error) {
      console.error("Failed to load config:", error);
    }
  }

  async function handleSaveImageConfig() {
    if (!imageApiUrl.trim() || !imageModel.trim()) {
      Alert.alert("错误", "请填写图片 API URL 和模型名称");
      return;
    }
    try {
      await saveImageConfig({
        imageApiKey: imageApiKey.trim(),
        imageApiUrl: imageApiUrl.trim(),
        imageModel: imageModel.trim(),
        imageSize: imageSize.trim(),
      });
      Alert.alert("成功", "图片生成配置已保存");
    } catch {
      Alert.alert("错误", "保存失败");
    }
  }

  async function handleSaveConfig() {
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
      Alert.alert("成功", "API 配置已保存");
    } catch (error) {
      Alert.alert("错误", "保存配置失败");
    }
  }

  async function handleTestAPI() {
    if (!apiKey.trim() || !apiUrl.trim() || !model.trim()) {
      Alert.alert("错误", "请先填写完整的 API 配置");
      return;
    }

    setTesting(true);
    try {
      const isValid = await testAPIKey(apiKey.trim(), apiUrl.trim(), model.trim());
      if (isValid) {
        Alert.alert("成功", "API Key 验证通过");
      } else {
        Alert.alert("失败", "API Key 无效或 API 地址错误");
      }
    } catch (error) {
      Alert.alert("错误", `测试失败: ${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setTesting(false);
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

      <ScrollView style={styles.content}>
        {/* API Configuration Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>AI 配置</Text>
          
          {/* Preset Selector */}
          <TouchableOpacity
            onPress={() => setShowPresetModal(true)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.cardRow}>
              <Text style={[styles.cardLabel, { color: colors.foreground }]}>预设</Text>
              <View style={styles.cardValueRow}>
                <Text style={[styles.cardValue, { color: colors.muted }]}>
                  {API_PRESETS[selectedPreset].name}
                </Text>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              </View>
            </View>
          </TouchableOpacity>

          {/* API Key */}
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

          {/* API URL */}
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

          {/* Model */}
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

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              onPress={handleTestAPI}
              style={[styles.secondaryButton, { borderColor: colors.border }]}
              disabled={testing}
            >
              <IconSymbol name={testing ? "hourglass" : "checkmark.circle"} size={18} color={colors.foreground} />
              <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
                {testing ? "测试中..." : "测试连接"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSaveConfig}
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            >
              <IconSymbol name="checkmark" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>保存配置</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Image Generation Section */}
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
              placeholder="图片生成服务的 API Key"
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
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>Size（可选）</Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.background }]}
              value={imageSize}
              onChangeText={setImageSize}
              placeholder="例如: 1024x1024（留空则不传 size）"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            onPress={handleSaveImageConfig}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          >
            <IconSymbol name="checkmark" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>保存图片配置</Text>
          </TouchableOpacity>
        </View>

        {/* About Section */}
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
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.cardRow}>
              <Text style={[styles.cardLabel, { color: colors.foreground }]}>AI引擎</Text>
              <Text style={[styles.cardValue, { color: colors.muted }]}>用户自定义 API</Text>
            </View>
          </View>
        </View>

        {/* How to play */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>玩法说明</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.helpText, { color: colors.foreground }]}>
              1. 在上方配置你的 AI API{"\n"}
              2. 创建新故事，填写标题和故事开头{"\n"}
              3. AI会根据你的设定生成剧情{"\n"}
              4. 点击对话框推进剧情{"\n"}
              5. 遇到选项时做出选择{"\n"}
              6. AI根据你的选择继续生成剧情{"\n"}
              7. 每个选择都会影响故事走向
            </Text>
          </View>
        </View>

        {/* Tester Mode */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>测试员验证</Text>
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
                  placeholder="输入测试员密钥"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (testerKey === "1234567") {
                    setTesterActivated(true);
                    setTestDiceValue(fixedDiceValue);
                    Alert.alert("成功", "测试模式已激活");
                  } else {
                    Alert.alert("错误", "密钥无效");
                  }
                }}
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
                <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((v) => (
                    <TouchableOpacity
                      key={v}
                      onPress={() => {
                        setFixedDiceValue(v);
                        setTestDiceValue(v);
                      }}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        backgroundColor: fixedDiceValue === v ? colors.primary : colors.background,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: fixedDiceValue === v ? colors.primary : colors.border,
                      }}
                    >
                      <Text style={{
                        fontSize: 16,
                        fontWeight: "700",
                        color: fixedDiceValue === v ? "#fff" : colors.foreground,
                      }}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setTesterActivated(false);
                  setTesterKey("");
                  setTestDiceValue(null);
                  Alert.alert("提示", "测试模式已关闭");
                }}
                style={[styles.dangerButton, { borderColor: colors.error }]}
              >
                <IconSymbol name="xmark.circle" size={18} color={colors.error} />
                <Text style={[styles.dangerButtonText, { color: colors.error }]}>关闭测试模式</Text>
              </TouchableOpacity>
            </>
          )}
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
      </ScrollView>

      {/* Preset Selection Modal */}
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
                key={index}
                style={[
                  styles.presetItem,
                  selectedPreset === index && { backgroundColor: colors.primary + "20" },
                ]}
                onPress={() => handleSelectPreset(index)}
              >
                <Text style={[
                  styles.presetName,
                  { color: colors.foreground },
                  selectedPreset === index && { color: colors.primary }
                ]}>
                  {preset.name}
                </Text>
                {selectedPreset === index && (
                  <IconSymbol name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
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
});
