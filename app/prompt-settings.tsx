import { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  PROMPT_KEYS,
  PROMPT_META,
  getDefaultPrompts,
  getActivePresetId,
  setActivePresetId,
  getActivePrompts,
  listPresets,
  getPreset,
  savePreset,
  deletePreset,
  generatePresetId,
  type PromptKey,
  type PromptPreset,
  type PromptSet,
} from "@/lib/prompt-store";

export default function PromptSettingsScreen() {
  const colors = useColors();
  const router = useRouter();

  // State
  const [activeId, setActiveId] = useState("default");
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [currentPrompts, setCurrentPrompts] =
    useState<PromptSet>(getDefaultPrompts());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Prompt editor modal
  const [editingKey, setEditingKey] = useState<PromptKey | null>(null);
  const [editingText, setEditingText] = useState("");

  // Preset management modal
  const [showPresetList, setShowPresetList] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PromptPreset | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presetDesc, setPresetDesc] = useState("");
  const [presetImage, setPresetImage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const id = await getActivePresetId();
    setActiveId(id);
    const prompts = await getActivePrompts();
    setCurrentPrompts(prompts);
    const allPresets = await listPresets();
    setPresets(allPresets);
    setHasUnsavedChanges(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Prompt Editing ───────────────────────────────────────────────

  function openPromptEditor(key: PromptKey) {
    setEditingKey(key);
    setEditingText(currentPrompts[key]);
  }

  function savePromptEdit() {
    if (!editingKey) return;
    setCurrentPrompts((prev) => ({ ...prev, [editingKey]: editingText }));
    setHasUnsavedChanges(true);
    setEditingKey(null);
  }

  function resetPromptToDefault() {
    if (!editingKey) return;
    const defaults = getDefaultPrompts();
    setEditingText(defaults[editingKey]);
  }

  // ─── Save Changes ────────────────────────────────────────────────

  async function handleSaveChanges() {
    if (activeId === "default") {
      // Need to create a new preset
      const id = generatePresetId();
      const preset: PromptPreset = {
        id,
        name: "自定义预设",
        description: "基于默认提示词修改",
        imageUri: null,
        prompts: currentPrompts,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await savePreset(preset);
      await setActivePresetId(id);
      Alert.alert("已保存", "已创建新预设并激活");
    } else {
      // Update existing preset
      const preset = await getPreset(activeId);
      if (preset) {
        preset.prompts = currentPrompts;
        await savePreset(preset);
        Alert.alert("已保存", "提示词修改已保存");
      }
    }
    await loadData();
  }

  function handleResetAll() {
    Alert.alert("恢复默认", "将所有提示词恢复为默认值？", [
      { text: "取消", style: "cancel" },
      {
        text: "确认",
        onPress: () => {
          setCurrentPrompts(getDefaultPrompts());
          setHasUnsavedChanges(true);
        },
      },
    ]);
  }

  // ─── Preset Management ───────────────────────────────────────────

  async function handleSwitchPreset(id: string) {
    await setActivePresetId(id);
    setShowPresetList(false);
    await loadData();
  }

  async function handleCreatePreset() {
    setPresetName("");
    setPresetDesc("");
    setPresetImage(null);
    setEditingPreset({
      id: "",
      name: "",
      description: "",
      imageUri: null,
      prompts: currentPrompts,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  async function handleSavePresetMeta() {
    if (!editingPreset) return;
    if (!presetName.trim()) {
      Alert.alert("错误", "请输入预设名称");
      return;
    }

    const isNew = !editingPreset.id;
    const preset: PromptPreset = {
      ...editingPreset,
      id: isNew ? generatePresetId() : editingPreset.id,
      name: presetName.trim(),
      description: presetDesc.trim(),
      imageUri: presetImage,
      updatedAt: Date.now(),
    };
    if (isNew) preset.createdAt = Date.now();

    await savePreset(preset);
    if (isNew) {
      await setActivePresetId(preset.id);
    }
    setEditingPreset(null);
    await loadData();
    Alert.alert("已保存", isNew ? "新预设已创建并激活" : "预设信息已更新");
  }

  async function handleDeletePreset(id: string) {
    Alert.alert("删除预设", "确定要删除该预设吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          await deletePreset(id);
          await loadData();
        },
      },
    ]);
  }

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) {
      setPresetImage(result.assets[0].uri);
    }
  }

  function openEditPresetMeta(preset: PromptPreset) {
    setEditingPreset(preset);
    setPresetName(preset.name);
    setPresetDesc(preset.description);
    setPresetImage(preset.imageUri);
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  const activePresetName =
    activeId === "default"
      ? "默认"
      : presets.find((p) => p.id === activeId)?.name || "默认";

  function truncate(text: string, max: number) {
    return text.length > max ? text.slice(0, max) + "..." : text;
  }

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          提示词配置
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content}>
        {/* Active Preset Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>
            当前预设
          </Text>
          <TouchableOpacity
            onPress={() => setShowPresetList(true)}
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.cardRow}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                {activeId !== "default" &&
                presets.find((p) => p.id === activeId)?.imageUri ? (
                  <Image
                    source={{
                      uri: presets.find((p) => p.id === activeId)!.imageUri!,
                    }}
                    style={styles.presetThumb}
                  />
                ) : (
                  <View
                    style={[
                      styles.presetThumbPlaceholder,
                      { backgroundColor: colors.primary + "20" },
                    ]}
                  >
                    <IconSymbol
                      name="doc.text"
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                )}
                <View>
                  <Text
                    style={[styles.cardLabel, { color: colors.foreground }]}
                  >
                    {activePresetName}
                  </Text>
                  {activeId !== "default" && (
                    <Text
                      style={[styles.presetDescSmall, { color: colors.muted }]}
                    >
                      {truncate(
                        presets.find((p) => p.id === activeId)?.description ||
                          "",
                        20,
                      )}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.cardValueRow}>
                <Text style={[styles.cardValue, { color: colors.muted }]}>
                  切换
                </Text>
                <IconSymbol
                  name="chevron.right"
                  size={16}
                  color={colors.muted}
                />
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Prompt Cards */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>
            提示词列表
          </Text>
          {PROMPT_KEYS.map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => openPromptEditor(key)}
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.cardLabel, { color: colors.foreground }]}
                  >
                    {PROMPT_META[key].label}
                  </Text>
                  <Text
                    style={[styles.promptPreview, { color: colors.muted }]}
                    numberOfLines={1}
                  >
                    {PROMPT_META[key].description}
                  </Text>
                </View>
                <IconSymbol
                  name="chevron.right"
                  size={16}
                  color={colors.muted}
                />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.section}>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              onPress={handleResetAll}
              style={[styles.secondaryButton, { borderColor: colors.border }]}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: colors.foreground },
                ]}
              >
                恢复默认
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSaveChanges}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: hasUnsavedChanges
                    ? colors.primary
                    : colors.muted,
                },
              ]}
              disabled={!hasUnsavedChanges}
            >
              <Text style={styles.primaryButtonText}>保存修改</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ─── Prompt Editor Modal ─────────────────────────────────── */}
      <Modal
        visible={editingKey !== null}
        animationType="slide"
        onRequestClose={() => setEditingKey(null)}
      >
        <ScreenContainer edges={["top", "bottom", "left", "right"]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={[styles.modalFull, { backgroundColor: colors.background }]}
          >
            <View
              style={[styles.modalHeader, { borderBottomColor: colors.border }]}
            >
              <TouchableOpacity onPress={() => setEditingKey(null)}>
                <Text style={[styles.modalAction, { color: colors.muted }]}>
                  取消
                </Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {editingKey ? PROMPT_META[editingKey].label : ""}
              </Text>
              <TouchableOpacity onPress={savePromptEdit}>
                <Text style={[styles.modalAction, { color: colors.primary }]}>
                  保存
                </Text>
              </TouchableOpacity>
            </View>

            {editingKey ? (
              <Text style={[styles.editorDesc, { color: colors.muted }]}>
                {PROMPT_META[editingKey].description}
              </Text>
            ) : null}

            <TextInput
              style={[
                styles.editorInput,
                {
                  color: colors.foreground,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              value={editingText}
              onChangeText={setEditingText}
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              onPress={resetPromptToDefault}
              style={[styles.resetButton, { borderColor: colors.border }]}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: colors.foreground },
                ]}
              >
                恢复此项默认值
              </Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </ScreenContainer>
      </Modal>

      {/* ─── Preset List Modal ───────────────────────────────────── */}
      <Modal
        visible={showPresetList}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPresetList(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPresetList(false)}
        >
          <View
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: colors.foreground, marginBottom: 16 },
              ]}
            >
              选择预设
            </Text>

            <ScrollView style={{ maxHeight: 400 }}>
              {/* Default option */}
              <TouchableOpacity
                style={[
                  styles.presetItem,
                  activeId === "default" && {
                    backgroundColor: colors.primary + "20",
                  },
                ]}
                onPress={() => handleSwitchPreset("default")}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    flex: 1,
                  }}
                >
                  <View
                    style={[
                      styles.presetThumbPlaceholder,
                      { backgroundColor: colors.primary + "20" },
                    ]}
                  >
                    <IconSymbol
                      name="doc.text"
                      size={16}
                      color={colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.presetName, { color: colors.foreground }]}
                    >
                      默认
                    </Text>
                    <Text
                      style={[styles.presetDescSmall, { color: colors.muted }]}
                    >
                      内置提示词
                    </Text>
                  </View>
                </View>
                {activeId === "default" && (
                  <IconSymbol
                    name="checkmark"
                    size={18}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>

              {/* User presets */}
              {presets.map((preset) => (
                <TouchableOpacity
                  key={preset.id}
                  style={[
                    styles.presetItem,
                    activeId === preset.id && {
                      backgroundColor: colors.primary + "20",
                    },
                  ]}
                  onPress={() => handleSwitchPreset(preset.id)}
                  onLongPress={() => openEditPresetMeta(preset)}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      flex: 1,
                    }}
                  >
                    {preset.imageUri ? (
                      <Image
                        source={{ uri: preset.imageUri }}
                        style={styles.presetThumb}
                      />
                    ) : (
                      <View
                        style={[
                          styles.presetThumbPlaceholder,
                          { backgroundColor: colors.primary + "20" },
                        ]}
                      >
                        <IconSymbol
                          name="doc.text"
                          size={16}
                          color={colors.primary}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.presetName,
                          { color: colors.foreground },
                        ]}
                      >
                        {preset.name}
                      </Text>
                      {preset.description ? (
                        <Text
                          style={[
                            styles.presetDescSmall,
                            { color: colors.muted },
                          ]}
                          numberOfLines={1}
                        >
                          {preset.description}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        setShowPresetList(false);
                        setTimeout(() => openEditPresetMeta(preset), 300);
                      }}
                      hitSlop={8}
                    >
                      <IconSymbol
                        name="pencil"
                        size={16}
                        color={colors.muted}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeletePreset(preset.id)}
                      hitSlop={8}
                    >
                      <IconSymbol name="trash" size={16} color={colors.error} />
                    </TouchableOpacity>
                    {activeId === preset.id && (
                      <IconSymbol
                        name="checkmark"
                        size={18}
                        color={colors.primary}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              onPress={() => {
                setShowPresetList(false);
                setTimeout(() => handleCreatePreset(), 300);
              }}
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primary, marginTop: 16 },
              ]}
            >
              <IconSymbol name="plus" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>新建预设</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── Preset Edit Modal ───────────────────────────────────── */}
      <Modal
        visible={editingPreset !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingPreset(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setEditingPreset(null)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ width: "100%" }}
          >
            <View
              style={[styles.modalContent, { backgroundColor: colors.surface }]}
              onStartShouldSetResponder={() => true}
            >
              <Text
                style={[
                  styles.modalTitle,
                  { color: colors.foreground, marginBottom: 16 },
                ]}
              >
                {editingPreset?.id ? "编辑预设" : "新建预设"}
              </Text>

              {/* Image picker */}
              <TouchableOpacity
                onPress={handlePickImage}
                style={styles.imagePickerArea}
              >
                {presetImage ? (
                  <Image
                    source={{ uri: presetImage }}
                    style={styles.presetImagePreview}
                  />
                ) : (
                  <View
                    style={[
                      styles.presetImagePlaceholder,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <IconSymbol name="photo" size={32} color={colors.muted} />
                    <Text
                      style={[styles.imagePickerText, { color: colors.muted }]}
                    >
                      选择图片
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Name */}
              <TextInput
                style={[
                  styles.metaInput,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
                value={presetName}
                onChangeText={setPresetName}
                placeholder="预设名称"
                placeholderTextColor={colors.muted}
              />

              {/* Description */}
              <TextInput
                style={[
                  styles.metaInput,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
                value={presetDesc}
                onChangeText={setPresetDesc}
                placeholder="简短描述（可选）"
                placeholderTextColor={colors.muted}
              />

              <View style={[styles.buttonRow, { marginTop: 16 }]}>
                <TouchableOpacity
                  onPress={() => setEditingPreset(null)}
                  style={[
                    styles.secondaryButton,
                    { borderColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.secondaryButtonText,
                      { color: colors.foreground },
                    ]}
                  >
                    取消
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSavePresetMeta}
                  style={[
                    styles.primaryButton,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={styles.primaryButtonText}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  headerRight: {
    width: 40,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
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
    marginBottom: 10,
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
  promptPreview: {
    fontSize: 12,
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
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
  // Prompt editor modal
  modalFull: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  modalAction: {
    fontSize: 16,
    fontWeight: "600",
  },
  editorDesc: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  editorInput: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    fontSize: 14,
    lineHeight: 22,
    borderRadius: 12,
    borderWidth: 1,
  },
  resetButton: {
    marginHorizontal: 20,
    marginBottom: Platform.OS === "ios" ? 40 : 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  // Preset list modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  modalContent: {
    width: "100%",
    borderRadius: 16,
    padding: 20,
  },
  presetItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  presetName: {
    fontSize: 15,
    fontWeight: "500",
  },
  presetDescSmall: {
    fontSize: 12,
    marginTop: 1,
  },
  presetThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  presetThumbPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  // Preset edit modal
  imagePickerArea: {
    alignItems: "center",
    marginBottom: 16,
  },
  presetImagePreview: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  presetImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  imagePickerText: {
    fontSize: 11,
    marginTop: 4,
  },
  metaInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
});
