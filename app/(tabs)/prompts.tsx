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
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  PROMPT_KEYS,
  PROMPT_META,
  getDefaultPrompts,
  getActivePresetId,
  setActivePresetId,
  listPresets,
  getPreset,
  savePreset,
  deletePreset,
  generatePresetId,
  type PromptKey,
  type PromptPreset,
  type PromptSet,
} from "@/lib/prompt-store";

type ViewMode = "list" | "detail";

export default function PromptsScreen() {
  const colors = useColors();
  const router = useRouter();

  // ─── State ──────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState("default");
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Detail view state
  const [viewingPreset, setViewingPreset] = useState<PromptPreset | null>(null);
  const [currentPrompts, setCurrentPrompts] = useState<PromptSet>(getDefaultPrompts());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Prompt editor modal
  const [editingKey, setEditingKey] = useState<PromptKey | null>(null);
  const [editingText, setEditingText] = useState("");

  // Preset create/edit modal
  const [editingPresetMeta, setEditingPresetMeta] = useState<PromptPreset | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presetDesc, setPresetDesc] = useState("");
  const [presetImage, setPresetImage] = useState<string | null>(null);

  // ─── Data Loading ───────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const id = await getActivePresetId();
    setActiveId(id);
    const allPresets = await listPresets();
    setPresets(allPresets);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Preset Actions ─────────────────────────────────────────────────

  async function handleActivatePreset(id: string) {
    await setActivePresetId(id);
    setActiveId(id);
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

  function handleCreatePreset() {
    setPresetName("");
    setPresetDesc("");
    setPresetImage(null);
    setEditingPresetMeta({
      id: "",
      name: "",
      description: "",
      imageUri: null,
      prompts: getDefaultPrompts(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  async function handleShareToPlaza() {
    const activePresetId = await getActivePresetId();
    router.push({
      pathname: "/plaza/submit-prompt" as any,
      params: activePresetId ? { presetId: activePresetId } : undefined,
    });
  }

  function openEditPresetMeta(preset: PromptPreset) {
    setEditingPresetMeta(preset);
    setPresetName(preset.name);
    setPresetDesc(preset.description);
    setPresetImage(preset.imageUri);
  }

  async function handleSavePresetMeta() {
    if (!editingPresetMeta) return;
    if (!presetName.trim()) {
      Alert.alert("错误", "请输入预设名称");
      return;
    }

    const isNew = !editingPresetMeta.id;
    const preset: PromptPreset = {
      ...editingPresetMeta,
      id: isNew ? generatePresetId() : editingPresetMeta.id,
      name: presetName.trim(),
      description: presetDesc.trim(),
      imageUri: presetImage,
      updatedAt: Date.now(),
    };
    if (isNew) preset.createdAt = Date.now();

    await savePreset(preset);
    if (isNew) {
      await setActivePresetId(preset.id);
      setActiveId(preset.id);
      setViewingPreset(preset);
    }
    setHasUnsavedChanges(false);
    setEditingPresetMeta(null);
    await loadData();
    Alert.alert("已保存", isNew ? "新预设已创建并激活" : "预设信息已更新");
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

  // ─── Enter Detail View ──────────────────────────────────────────────

  async function enterDetail(presetId: string) {
    if (presetId === "default") {
      setViewingPreset(null);
      setCurrentPrompts(getDefaultPrompts());
    } else {
      const preset = await getPreset(presetId);
      if (!preset) return;
      setViewingPreset(preset);
      const defaults = getDefaultPrompts();
      setCurrentPrompts({ ...defaults, ...preset.prompts });
    }
    setHasUnsavedChanges(false);
    setViewMode("detail");
  }

  function exitDetail() {
    if (hasUnsavedChanges) {
      Alert.alert("未保存的修改", "确定放弃修改吗？", [
        { text: "继续编辑", style: "cancel" },
        {
          text: "放弃",
          onPress: () => {
            setViewMode("list");
            setHasUnsavedChanges(false);
          },
        },
      ]);
    } else {
      setViewMode("list");
    }
  }

  // ─── Prompt Editing (Detail View) ───────────────────────────────────

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

  async function handleSaveChanges() {
    if (!viewingPreset) {
      // Editing default → create new preset with custom meta
      setPresetName("自定义预设");
      setPresetDesc("基于默认提示词修改");
      setPresetImage(null);
      setEditingPresetMeta({
        id: "",
        name: "",
        description: "",
        imageUri: null,
        prompts: currentPrompts,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return;
    } else {
      viewingPreset.prompts = currentPrompts;
      await savePreset(viewingPreset);
      Alert.alert("已保存", "提示词修改已保存");
    }
    setHasUnsavedChanges(false);
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

  // ─── Helpers ────────────────────────────────────────────────────────

  function truncate(text: string, max: number) {
    return text.length > max ? text.slice(0, max) + "..." : text;
  }

  const activePresetName =
    activeId === "default"
      ? "默认"
      : presets.find((p) => p.id === activeId)?.name || "默认";

  const detailTitle = viewingPreset ? viewingPreset.name : "默认";

  // ─── Render: List View ──────────────────────────────────────────────

  function renderListView() {
    return (
      <>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}> 
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>提示词配置</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity onPress={handleShareToPlaza} style={styles.headerAction}>
              <IconSymbol name="person.2.fill" size={22} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCreatePreset} style={styles.headerAction}>
              <IconSymbol name="plus.circle.fill" size={26} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.content}>
          {/* Active indicator */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>当前激活</Text>
            <View style={[styles.activeIndicator, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
              <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
              <Text style={[styles.activeIndicatorText, { color: colors.primary }]}>{activePresetName}</Text>
            </View>
          </View>

          {/* Default preset card */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>配置列表</Text>

            <TouchableOpacity
              onPress={() => enterDetail("default")}
              style={[
                styles.presetCard,
                { backgroundColor: colors.surface, borderColor: activeId === "default" ? colors.primary : colors.border },
                activeId === "default" && { borderWidth: 2 },
              ]}
              activeOpacity={0.7}
            >
              <View style={styles.presetCardRow}>
                <View style={[styles.presetThumbPlaceholder, { backgroundColor: colors.primary + "20" }]}>
                  <IconSymbol name="doc.text" size={20} color={colors.primary} />
                </View>
                <View style={styles.presetCardInfo}>
                  <Text style={[styles.presetCardName, { color: colors.foreground }]}>默认</Text>
                  <Text style={[styles.presetCardDesc, { color: colors.muted }]}>内置提示词配置</Text>
                </View>
                <View style={styles.presetCardActions}>
                  {activeId === "default" ? (
                    <View style={[styles.activeBadge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.activeBadgeText}>已激活</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleActivatePreset("default")}
                      style={[styles.activateBtn, { borderColor: colors.primary }]}
                      hitSlop={8}
                    >
                      <Text style={[styles.activateBtnText, { color: colors.primary }]}>激活</Text>
                    </TouchableOpacity>
                  )}
                  <IconSymbol name="chevron.right" size={16} color={colors.muted} />
                </View>
              </View>
            </TouchableOpacity>

            {/* User preset cards */}
            {presets.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                onPress={() => enterDetail(preset.id)}
                onLongPress={() => openEditPresetMeta(preset)}
                style={[
                  styles.presetCard,
                  { backgroundColor: colors.surface, borderColor: activeId === preset.id ? colors.primary : colors.border },
                  activeId === preset.id && { borderWidth: 2 },
                ]}
                activeOpacity={0.7}
              >
                <View style={styles.presetCardRow}>
                  {preset.imageUri ? (
                    <Image source={{ uri: preset.imageUri }} style={styles.presetThumb} />
                  ) : (
                    <View style={[styles.presetThumbPlaceholder, { backgroundColor: colors.primary + "20" }]}>
                      <IconSymbol name="doc.text" size={20} color={colors.primary} />
                    </View>
                  )}
                  <View style={styles.presetCardInfo}>
                    <Text style={[styles.presetCardName, { color: colors.foreground }]}>{preset.name}</Text>
                    {preset.description ? (
                      <Text style={[styles.presetCardDesc, { color: colors.muted }]} numberOfLines={1}>
                        {truncate(preset.description, 30)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.presetCardActions}>
                    {activeId === preset.id ? (
                      <View style={[styles.activeBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.activeBadgeText}>已激活</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation?.();
                          handleActivatePreset(preset.id);
                        }}
                        style={[styles.activateBtn, { borderColor: colors.primary }]}
                        hitSlop={8}
                      >
                        <Text style={[styles.activateBtnText, { color: colors.primary }]}>激活</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation?.();
                        openEditPresetMeta(preset);
                      }}
                      hitSlop={8}
                    >
                      <IconSymbol name="pencil" size={16} color={colors.muted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation?.();
                        handleDeletePreset(preset.id);
                      }}
                      hitSlop={8}
                    >
                      <IconSymbol name="trash" size={16} color={colors.error} />
                    </TouchableOpacity>
                    <IconSymbol name="chevron.right" size={16} color={colors.muted} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </>
    );
  }

  // ─── Render: Detail View (Inner Cards) ──────────────────────────────

  function renderDetailView() {
    return (
      <>
        {/* Header with back */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}> 
          <TouchableOpacity onPress={exitDetail} style={styles.backBtn}>
            <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
            <Text style={[styles.backBtnText, { color: colors.foreground }]}>返回</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitleCenter, { color: colors.foreground }]} numberOfLines={1}>
            {detailTitle}
          </Text>
          {viewingPreset ? (
            <TouchableOpacity
              onPress={() => openEditPresetMeta(viewingPreset)}
              style={styles.headerRightBtn}
            >
              <IconSymbol name="pencil" size={16} color={colors.primary} />
              <Text style={[styles.headerRightText, { color: colors.primary }]}>编辑配置</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerRightBtn} />
          )}
        </View>

        <ScrollView style={styles.content}>
          {/* Prompt inner cards */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>提示词列表</Text>
            {PROMPT_KEYS.map((key) => (
              <TouchableOpacity
                key={key}
                onPress={() => openPromptEditor(key)}
                style={[styles.promptCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <View style={styles.promptCardHeader}>
                  <View style={[styles.promptIcon, { backgroundColor: colors.primary + "15" }]}>
                    <IconSymbol name="doc.text.fill" size={16} color={colors.primary} />
                  </View>
                  <View style={styles.promptCardInfo}>
                    <Text style={[styles.promptCardName, { color: colors.foreground }]}>
                      {PROMPT_META[key].label}
                    </Text>
                    <Text style={[styles.promptCardDesc, { color: colors.muted }]} numberOfLines={1}>
                      {PROMPT_META[key].description}
                    </Text>
                  </View>
                  <IconSymbol name="chevron.right" size={16} color={colors.muted} />
                </View>
                <Text style={[styles.promptPreviewText, { color: colors.muted }]} numberOfLines={2}>
                  {truncate(currentPrompts[key], 80)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Action buttons */}
          <View style={styles.section}>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={handleResetAll}
                style={[styles.secondaryButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>恢复默认</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveChanges}
                style={[
                  styles.primaryButton,
                  { backgroundColor: hasUnsavedChanges ? colors.primary : colors.muted },
                ]}
                disabled={!hasUnsavedChanges}
              >
                <Text style={styles.primaryButtonText}>保存修改</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </>
    );
  }

  // ─── Main Render ────────────────────────────────────────────────────

  return (
    <ScreenContainer>
      {viewMode === "list" ? renderListView() : renderDetailView()}

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
                <Text style={[styles.modalAction, { color: colors.muted }]}>取消</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {editingKey ? PROMPT_META[editingKey].label : ""}
              </Text>
              <TouchableOpacity onPress={savePromptEdit}>
                <Text style={[styles.modalAction, { color: colors.primary }]}>保存</Text>
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
                style={[styles.secondaryButtonText, { color: colors.foreground }]}
              >
                恢复此项默认值
              </Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </ScreenContainer>
      </Modal>

      {/* ─── Preset Create/Edit Modal ──────────────────────────── */}
      <Modal
        visible={editingPresetMeta !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingPresetMeta(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setEditingPresetMeta(null)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ width: "100%" }}
          >
            <View
              style={[styles.modalContent, { backgroundColor: colors.surface }]}
              onStartShouldSetResponder={() => true}
            >
            <Text style={[styles.modalTitle, { color: colors.foreground, marginBottom: 16 }]}>
              {editingPresetMeta?.id ? "编辑预设" : "新建预设"}
            </Text>

            {/* Image picker */}
            <TouchableOpacity onPress={handlePickImage} style={styles.imagePickerArea}>
              {presetImage ? (
                <Image source={{ uri: presetImage }} style={styles.presetImagePreview} />
              ) : (
                <View style={[styles.presetImagePlaceholder, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <IconSymbol name="photo" size={32} color={colors.muted} />
                  <Text style={[styles.imagePickerText, { color: colors.muted }]}>选择图片</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Name */}
            <TextInput
              style={[styles.metaInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              value={presetName}
              onChangeText={setPresetName}
              placeholder="预设名称"
              placeholderTextColor={colors.muted}
            />

            {/* Description */}
            <TextInput
              style={[styles.metaInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              value={presetDesc}
              onChangeText={setPresetDesc}
              placeholder="简短描述（可选）"
              placeholderTextColor={colors.muted}
            />

            <View style={[styles.buttonRow, { marginTop: 16 }]}>
              <TouchableOpacity
                onPress={() => setEditingPresetMeta(null)}
                style={[styles.secondaryButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSavePresetMeta}
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
  },
  headerTitleCenter: {
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  headerAction: {
    padding: 4,
  },
  backBtn: {
    minWidth: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  headerRightBtn: {
    minWidth: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  headerRightText: {
    fontSize: 13,
    fontWeight: "600",
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
  // Active indicator
  activeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  activeIndicatorText: {
    fontSize: 15,
    fontWeight: "600",
  },
  // Preset cards (outer)
  presetCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
    padding: 14,
  },
  presetCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  presetThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  presetThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  presetCardInfo: {
    flex: 1,
    gap: 2,
  },
  presetCardName: {
    fontSize: 16,
    fontWeight: "600",
  },
  presetCardDesc: {
    fontSize: 13,
  },
  presetCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  activeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activeBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  activateBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  activateBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  // Prompt cards (inner)
  promptCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 10,
    padding: 14,
  },
  promptCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  promptIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  promptCardInfo: {
    flex: 1,
    gap: 2,
  },
  promptCardName: {
    fontSize: 15,
    fontWeight: "600",
  },
  promptCardDesc: {
    fontSize: 12,
  },
  promptPreviewText: {
    fontSize: 12,
    lineHeight: 17,
    paddingLeft: 42,
  },
  // Buttons
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
  // Preset edit modal
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
