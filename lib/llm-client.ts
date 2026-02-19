/**
 * LLM 客户端
 * 直接调用 OpenAI 兼容的 API，无需后端
 */

import {
  STORY_SYSTEM_PROMPT,
  CONTINUE_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  RANDOMIZE_SYSTEM_PROMPT,
  IMAGE_PROMPT_SYSTEM_PROMPT,
  EVALUATE_ACTION_SYSTEM_PROMPT,
  buildDifficultyContext,
  buildCharacterCardsContext,
} from "./llm-prompts";
import {
  getStorageConfig,
  saveStorageConfig,
  clearStorageConfig,
  type StorageConfig,
} from "./storage";
import type {
  StorySegment,
  CharacterCard,
  DifficultyLevel,
} from "./story-store";

// ─── Types ─────────────────────────────────────────────────────────────────

// Re-export for backward compatibility
export type { StorySegment } from "./story-store";

// LLMConfig 已在 storage.ts 中定义，这里导出以保持兼容性
export type LLMConfig = StorageConfig;

export interface GenerateStoryParams {
  title: string;
  premise: string;
  genre: string;
  protagonistName: string;
  protagonistDescription: string;
  difficulty: DifficultyLevel;
  characterCards?: CharacterCard[];
}

export interface ContinueStoryParams {
  title: string;
  genre: string;
  premise: string;
  history: string;
  choiceText: string;
  protagonistName: string;
  protagonistDescription: string;
  difficulty: DifficultyLevel;
  characterCards?: CharacterCard[];
  diceOutcomeContext?: string;
}

export interface SummarizeStoryParams {
  history: string;
}

export interface RandomStoryConfig {
  title: string;
  genre: string;
  protagonistName: string;
  protagonistDescription: string;
  premise: string;
}

export interface NewCharacterData {
  name: string;
  gender: string;
  personality: string;
  background: string;
}

export interface LLMResponse {
  segments: StorySegment[];
  newCharacters?: NewCharacterData[];
}

function extractJsonPayload(content: string): string {
  const fencedMatch = content.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = content.indexOf("{");
  if (firstBrace === -1) {
    throw new Error("无法解析 AI 返回的内容");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = firstBrace; i < content.length; i++) {
    const ch = content[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return content.slice(firstBrace, i + 1).trim();
      }
    }
  }

  throw new Error("无法解析 AI 返回的内容");
}

// ─── Config Management ──────────────────────────────────────────────

/**
 * 获取用户配置的 API 信息
 */
export async function getLLMConfig(): Promise<LLMConfig> {
  return await getStorageConfig();
}

/**
 * 保存 API 配置
 */
export async function saveLLMConfig(config: {
  apiKey: string;
  apiUrl: string;
  model: string;
}): Promise<void> {
  await saveStorageConfig(config);
}

/**
 * 清除 API 配置
 */
export async function clearLLMConfig(): Promise<void> {
  await clearStorageConfig();
}

// ─── LLM API Calls ─────────────────────────────────────────────────

/**
 * 测试 API Key 是否有效
 */
export async function testAPIKey(
  apiKey: string,
  apiUrl: string,
  model: string,
): Promise<boolean> {
  try {
    // 如果 apiUrl 已经包含了完整路径，直接使用；否则添加 /chat/completions
    const url = apiUrl.includes("/chat/completions")
      ? apiUrl
      : `${apiUrl}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: "Test",
          },
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.choices && data.choices.length > 0;
  } catch (error) {
    console.error("[LLM] API Key test failed:", error);
    return false;
  }
}

/**
 * 生成初始故事
 */
export async function generateStory(
  params: GenerateStoryParams,
): Promise<LLMResponse> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  // 如果 apiUrl 已经包含了完整路径，直接使用；否则添加 /chat/completions
  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: STORY_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `创建一个${params.genre}类型的故事，标题是"${params.title}"，前提是"${params.premise}"。玩家主角姓名：${params.protagonistName}${params.protagonistDescription ? `，主角简介：${params.protagonistDescription}` : ""}。\n\n${buildDifficultyContext(params.difficulty)}\n${buildCharacterCardsContext(params.characterCards ?? [])}\n\n请生成5-10个故事片段，每个片段包含类型、角色（对话时）、文本和选项（最后一个片段）。`,
        },
      ],
      temperature: 0.8,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 调用失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || "";

  return parseLLMResponse(content);
}

/**
 * 继续故事
 */
export async function continueStory(
  params: ContinueStoryParams,
): Promise<LLMResponse> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  // 如果 apiUrl 已经包含了完整路径，直接使用；否则添加 /chat/completions
  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: CONTINUE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `故事标题：${params.title}\n类型：${params.genre}\n前提：${params.premise}\n玩家主角：${params.protagonistName}${params.protagonistDescription ? `（${params.protagonistDescription}）` : ""}\n\n${buildDifficultyContext(params.difficulty)}\n${buildCharacterCardsContext(params.characterCards ?? [])}\n\n历史剧情：\n${params.history}\n\n${params.diceOutcomeContext ? params.diceOutcomeContext + "\n\n" : ""}用户选择了：${params.choiceText}\n\n请根据用户的选择继续生成3-5个新的故事片段，保持剧情连贯性。`,
        },
      ],
      temperature: 0.8,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 调用失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || "";

  return parseLLMResponse(content);
}

/**
 * 生成剧情摘要（用于长剧情的上下文压缩）
 */
export async function summarizeStory(
  params: SummarizeStoryParams,
): Promise<string> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: params.history },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`摘要生成失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * 随机生成故事设定
 */
export async function randomizeStory(): Promise<RandomStoryConfig> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: RANDOMIZE_SYSTEM_PROMPT },
        { role: "user", content: "请随机生成一套故事设定。" },
      ],
      temperature: 1.0,
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`随机生成失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content: string = data.choices[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(extractJsonPayload(content)) as RandomStoryConfig;
    if (!parsed.title || !parsed.premise || !parsed.protagonistName) {
      throw new Error("返回字段不完整");
    }
    return parsed;
  } catch {
    throw new Error("AI 返回的设定格式不正确，请重试");
  }
}

/**
 * 根据剧情摘要生成图片提示词（英文）
 */
export async function generateImagePrompt(summary: string): Promise<string> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: IMAGE_PROMPT_SYSTEM_PROMPT },
        { role: "user", content: `剧情摘要：\n${summary}` },
      ],
      temperature: 0.7,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`图片提示词生成失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * 解析 LLM 返回的 JSON 响应
 */
function parseLLMResponse(content: string): LLMResponse {
  try {
    const parsed = JSON.parse(extractJsonPayload(content));

    // 验证返回的数据结构
    if (!Array.isArray(parsed.segments)) {
      throw new Error("AI 返回的数据格式不正确：缺少 segments 数组");
    }

    // 验证每个片段的结构
    for (const segment of parsed.segments) {
      if (!segment.type) {
        throw new Error("AI 返回的数据格式不正确：片段缺少 type 字段");
      }

      // choice 类型允许 text 为空（AI 可能只提供 choices 数组）
      if (!segment.text) {
        if (segment.type === "choice") {
          segment.text = "";
        } else {
          throw new Error("AI 返回的数据格式不正确：片段缺少 text 字段");
        }
      }

      if (segment.type === "dialogue" && !segment.character) {
        throw new Error("AI 返回的数据格式不正确：对话片段缺少 character 字段");
      }

      if (segment.type === "choice" && !Array.isArray(segment.choices)) {
        throw new Error("AI 返回的数据格式不正确：选择片段缺少 choices 数组");
      }

      // Validate and clamp judgmentValues for choice segments
      if (segment.type === "choice" && segment.choices) {
        if (Array.isArray(segment.judgmentValues)) {
          // Ensure length matches choices
          if (segment.judgmentValues.length !== segment.choices.length) {
            segment.judgmentValues = segment.choices.map(() => 4);
          }
          // Clamp values to 1-8
          segment.judgmentValues = segment.judgmentValues.map((v: number) =>
            Math.max(1, Math.min(8, Math.round(v || 4))),
          );
        }
        // judgmentValues may be absent in 无随机 mode — that's fine
      }
    }

    // Extract newCharacters if present
    const newCharacters: NewCharacterData[] = Array.isArray(
      parsed.newCharacters,
    )
      ? parsed.newCharacters.filter(
          (c: NewCharacterData) =>
            c.name && c.gender && c.personality && c.background,
        )
      : [];

    return { segments: parsed.segments, newCharacters };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("AI 返回的不是有效的 JSON 格式");
    }
    throw error;
  }
}

/**
 * 评估自定义行动的判定值（轻量 API 调用）
 */
export async function evaluateCustomAction(
  action: string,
  history: string,
  difficulty: DifficultyLevel,
): Promise<number> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: EVALUATE_ACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${buildDifficultyContext(difficulty)}\n\n最近剧情：\n${history.slice(-500)}\n\n玩家自定义行动："${action}"\n\n请评估该行动的判定值（1-8），只输出数字。`,
        },
      ],
      temperature: 0.3,
      max_tokens: 10,
    }),
  });

  if (!response.ok) {
    return 4; // fallback to medium difficulty
  }

  const data = await response.json();
  const content: string = data.choices[0]?.message?.content?.trim() ?? "4";
  const value = parseInt(content, 10);
  return Number.isNaN(value) ? 4 : Math.max(1, Math.min(8, value));
}
