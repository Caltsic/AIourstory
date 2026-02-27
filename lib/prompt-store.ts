/**
 * 提示词预设存储层
 * 管理用户自定义提示词配置和预设切换
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  STORY_SYSTEM_PROMPT,
  CONTINUE_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  IMAGE_PROMPT_SYSTEM_PROMPT,
  RANDOMIZE_SYSTEM_PROMPT,
  EVALUATE_ACTION_SYSTEM_PROMPT,
  CHARACTER_PORTRAIT_SYSTEM_PROMPT,
  EVALUATE_CONTINUATION_SYSTEM_PROMPT,
} from "./llm-prompts";

// ─── Types ──────────────────────────────────────────────────────────

export type PromptKey =
  | "STORY_SYSTEM_PROMPT"
  | "CONTINUE_SYSTEM_PROMPT"
  | "SUMMARY_SYSTEM_PROMPT"
  | "IMAGE_PROMPT_SYSTEM_PROMPT"
  | "RANDOMIZE_SYSTEM_PROMPT"
  | "EVALUATE_ACTION_SYSTEM_PROMPT"
  | "CHARACTER_PORTRAIT_SYSTEM_PROMPT"
  | "EVALUATE_CONTINUATION_SYSTEM_PROMPT";

export type PromptSet = Record<PromptKey, string>;

export interface PromptPreset {
  id: string;
  name: string;
  description: string;
  imageUri: string | null;
  prompts: PromptSet;
  createdAt: number;
  updatedAt: number;
}

export interface PromptMeta {
  key: PromptKey;
  label: string;
  description: string;
}

type PromptPresetPortable = {
  name: string;
  description: string;
  imageUri: string | null;
  prompts: PromptSet;
  sourceId?: string;
  isDefault?: boolean;
};

type PromptPresetExportPayload = {
  format: "AIourStory-Prompt-Presets";
  version: 1;
  exportedAt: string;
  presets: PromptPresetPortable[];
};

// ─── Constants ──────────────────────────────────────────────────────

export const PROMPT_KEYS: PromptKey[] = [
  "STORY_SYSTEM_PROMPT",
  "CONTINUE_SYSTEM_PROMPT",
  "SUMMARY_SYSTEM_PROMPT",
  "IMAGE_PROMPT_SYSTEM_PROMPT",
  "RANDOMIZE_SYSTEM_PROMPT",
  "EVALUATE_ACTION_SYSTEM_PROMPT",
  "CHARACTER_PORTRAIT_SYSTEM_PROMPT",
  "EVALUATE_CONTINUATION_SYSTEM_PROMPT",
];

export const PROMPT_META: Record<
  PromptKey,
  { label: string; description: string }
> = {
  STORY_SYSTEM_PROMPT: {
    label: "故事生成",
    description: "初始故事生成时使用的系统提示词",
  },
  CONTINUE_SYSTEM_PROMPT: {
    label: "故事续写",
    description: "玩家选择后继续生成剧情的提示词",
  },
  SUMMARY_SYSTEM_PROMPT: {
    label: "剧情总结",
    description: "压缩历史剧情为摘要的提示词",
  },
  IMAGE_PROMPT_SYSTEM_PROMPT: {
    label: "图片生成",
    description: "根据剧情生成绘画提示词",
  },
  RANDOMIZE_SYSTEM_PROMPT: {
    label: "随机故事",
    description: "随机生成故事设定的提示词",
  },
  EVALUATE_ACTION_SYSTEM_PROMPT: {
    label: "行动判定",
    description: "评估自定义行动难度的提示词",
  },
  CHARACTER_PORTRAIT_SYSTEM_PROMPT: {
    label: "角色立绘",
    description: "根据角色信息生成人物形象绘画提示词",
  },
  EVALUATE_CONTINUATION_SYSTEM_PROMPT: {
    label: "续写评估",
    description: "评估本轮续写质量并给出下轮改进建议",
  },
};

// ─── Storage Keys ───────────────────────────────────────────────────

const PRESETS_INDEX_KEY = "prompt_presets_index";
const PRESET_KEY_PREFIX = "prompt_preset_";
const ACTIVE_PRESET_KEY = "prompt_active_preset_id";

// ─── Default Prompts ────────────────────────────────────────────────

export function getDefaultPrompts(): PromptSet {
  return {
    STORY_SYSTEM_PROMPT,
    CONTINUE_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
    IMAGE_PROMPT_SYSTEM_PROMPT,
    RANDOMIZE_SYSTEM_PROMPT,
    EVALUATE_ACTION_SYSTEM_PROMPT,
    CHARACTER_PORTRAIT_SYSTEM_PROMPT,
    EVALUATE_CONTINUATION_SYSTEM_PROMPT,
  };
}

// ─── Active Preset ──────────────────────────────────────────────────

export async function getActivePresetId(): Promise<string> {
  const id = await AsyncStorage.getItem(ACTIVE_PRESET_KEY);
  return id || "default";
}

export async function setActivePresetId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_PRESET_KEY, id);
}

export async function getActivePrompts(): Promise<PromptSet> {
  const activeId = await getActivePresetId();
  if (activeId === "default") {
    return getDefaultPrompts();
  }
  const preset = await getPreset(activeId);
  if (!preset) {
    return getDefaultPrompts();
  }
  // Merge with defaults to fill any missing keys
  const defaults = getDefaultPrompts();
  return { ...defaults, ...preset.prompts };
}

// ─── Preset CRUD ────────────────────────────────────────────────────

export async function listPresets(): Promise<PromptPreset[]> {
  const indexJson = await AsyncStorage.getItem(PRESETS_INDEX_KEY);
  if (!indexJson) return [];

  const ids: string[] = JSON.parse(indexJson);
  const keys = ids.map((id) => `${PRESET_KEY_PREFIX}${id}`);
  const pairs = await AsyncStorage.multiGet(keys);

  const presets: PromptPreset[] = [];
  for (const [, value] of pairs) {
    if (value) {
      try {
        presets.push(JSON.parse(value));
      } catch {
        // skip corrupted entries
      }
    }
  }
  return presets.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getPreset(id: string): Promise<PromptPreset | null> {
  const json = await AsyncStorage.getItem(`${PRESET_KEY_PREFIX}${id}`);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function savePreset(preset: PromptPreset): Promise<void> {
  preset.updatedAt = Date.now();
  await AsyncStorage.setItem(
    `${PRESET_KEY_PREFIX}${preset.id}`,
    JSON.stringify(preset),
  );

  // Update index
  const indexJson = await AsyncStorage.getItem(PRESETS_INDEX_KEY);
  const ids: string[] = indexJson ? JSON.parse(indexJson) : [];
  if (!ids.includes(preset.id)) {
    ids.push(preset.id);
    await AsyncStorage.setItem(PRESETS_INDEX_KEY, JSON.stringify(ids));
  }
}

export async function deletePreset(id: string): Promise<void> {
  await AsyncStorage.removeItem(`${PRESET_KEY_PREFIX}${id}`);

  const indexJson = await AsyncStorage.getItem(PRESETS_INDEX_KEY);
  if (indexJson) {
    const ids: string[] = JSON.parse(indexJson);
    const filtered = ids.filter((i) => i !== id);
    await AsyncStorage.setItem(PRESETS_INDEX_KEY, JSON.stringify(filtered));
  }

  // If deleted preset was active, reset to default
  const activeId = await getActivePresetId();
  if (activeId === id) {
    await setActivePresetId("default");
  }
}

export function generatePresetId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePromptSet(input: unknown): PromptSet {
  const defaults = getDefaultPrompts();
  if (!input || typeof input !== "object") return defaults;

  const normalized = { ...defaults };
  for (const key of PROMPT_KEYS) {
    const raw = (input as Record<string, unknown>)[key];
    if (typeof raw === "string") {
      normalized[key] = raw;
    }
  }
  return normalized;
}

function toPortablePreset(
  preset: PromptPreset,
  options?: { isDefault?: boolean; sourceId?: string },
): PromptPresetPortable {
  return {
    name: preset.name,
    description: preset.description,
    imageUri: preset.imageUri,
    prompts: normalizePromptSet(preset.prompts),
    sourceId: options?.sourceId,
    isDefault: options?.isDefault,
  };
}

export async function exportAllPresetsToText(): Promise<string> {
  const defaultsPortable = toPortablePreset(
    {
      id: "default",
      name: "默认",
      description: "内置提示词配置",
      imageUri: null,
      prompts: getDefaultPrompts(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    { isDefault: true, sourceId: "default" },
  );

  const customPresets = await listPresets();
  const portablePresets = customPresets.map((preset) =>
    toPortablePreset(preset, { sourceId: preset.id }),
  );

  const payload: PromptPresetExportPayload = {
    format: "AIourStory-Prompt-Presets",
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: [defaultsPortable, ...portablePresets],
  };

  return [
    "# AIourStory Prompt Presets Export",
    "# Keep this file as UTF-8 .txt",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");
}

export function parsePresetsFromExportText(
  text: string,
): PromptPresetPortable[] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("导入文件为空");

  const jsonStart = trimmed.indexOf("{");
  if (jsonStart < 0) {
    throw new Error("导入文件格式无效（未找到数据块）");
  }

  const jsonText = trimmed.slice(jsonStart);
  let payload: PromptPresetExportPayload;
  try {
    payload = JSON.parse(jsonText) as PromptPresetExportPayload;
  } catch {
    throw new Error("导入文件格式无效（JSON 解析失败）");
  }

  if (
    payload?.format !== "AIourStory-Prompt-Presets" ||
    payload?.version !== 1 ||
    !Array.isArray(payload?.presets)
  ) {
    throw new Error("导入文件版本或格式不匹配");
  }

  return payload.presets
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      name:
        typeof item.name === "string" && item.name.trim()
          ? item.name.trim()
          : "未命名配置",
      description:
        typeof item.description === "string" ? item.description.trim() : "",
      imageUri: typeof item.imageUri === "string" ? item.imageUri : null,
      prompts: normalizePromptSet(item.prompts),
      sourceId: typeof item.sourceId === "string" ? item.sourceId : undefined,
      isDefault: Boolean(item.isDefault),
    }));
}
