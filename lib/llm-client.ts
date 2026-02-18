/**
 * LLM 客户端
 * 直接调用 OpenAI 兼容的 API，无需后端
 */

import { STORY_SYSTEM_PROMPT, CONTINUE_SYSTEM_PROMPT, SUMMARY_SYSTEM_PROMPT } from './llm-prompts';
import { getStorageConfig, saveStorageConfig, clearStorageConfig, type StorageConfig } from './storage';

// ─── Types ─────────────────────────────────────────────────────────────────

export type SegmentType = 'narration' | 'dialogue' | 'choice';

export interface StorySegment {
  type: SegmentType;
  character?: string;
  text: string;
  choices?: string[];
}

// LLMConfig 已在 storage.ts 中定义，这里导出以保持兼容性
export type LLMConfig = StorageConfig;

export interface GenerateStoryParams {
  title: string;
  premise: string;
  genre: string;
  protagonistName: string;
  protagonistDescription: string;
}

export interface ContinueStoryParams {
  title: string;
  genre: string;
  premise: string;
  history: string;
  choiceText: string;
  protagonistName: string;
  protagonistDescription: string;
}

export interface SummarizeStoryParams {
  history: string;
}

export interface LLMResponse {
  segments: StorySegment[];
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
export async function testAPIKey(apiKey: string, apiUrl: string, model: string): Promise<boolean> {
  try {
    // 如果 apiUrl 已经包含了完整路径，直接使用；否则添加 /chat/completions
    const url = apiUrl.includes('/chat/completions') ? apiUrl : `${apiUrl}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: 'Test',
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
    console.error('[LLM] API Key test failed:', error);
    return false;
  }
}

/**
 * 生成初始故事
 */
export async function generateStory(params: GenerateStoryParams): Promise<LLMResponse> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  // 如果 apiUrl 已经包含了完整路径，直接使用；否则添加 /chat/completions
  const url = config.apiUrl.includes('/chat/completions') ? config.apiUrl : `${config.apiUrl}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: STORY_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `创建一个${params.genre}类型的故事，标题是"${params.title}"，前提是"${params.premise}"。玩家主角姓名：${params.protagonistName}${params.protagonistDescription ? `，主角简介：${params.protagonistDescription}` : ''}。请生成5-10个故事片段，每个片段包含类型、角色（对话时）、文本和选项（最后一个片段）。`,
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
  const content = data.choices[0]?.message?.content || '';

  return parseLLMResponse(content);
}

/**
 * 继续故事
 */
export async function continueStory(params: ContinueStoryParams): Promise<LLMResponse> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  // 如果 apiUrl 已经包含了完整路径，直接使用；否则添加 /chat/completions
  const url = config.apiUrl.includes('/chat/completions') ? config.apiUrl : `${config.apiUrl}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: CONTINUE_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `故事标题：${params.title}\n类型：${params.genre}\n前提：${params.premise}\n玩家主角：${params.protagonistName}${params.protagonistDescription ? `（${params.protagonistDescription}）` : ''}\n\n历史剧情：\n${params.history}\n\n用户选择了：${params.choiceText}\n\n请根据用户的选择继续生成3-5个新的故事片段，保持剧情连贯性。`,
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
  const content = data.choices[0]?.message?.content || '';

  return parseLLMResponse(content);
}

/**
 * 生成剧情摘要（用于长剧情的上下文压缩）
 */
export async function summarizeStory(params: SummarizeStoryParams): Promise<string> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  const url = config.apiUrl.includes('/chat/completions') ? config.apiUrl : `${config.apiUrl}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: params.history },
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
  return data.choices[0]?.message?.content?.trim() ?? '';
}

/**
 * 解析 LLM 返回的 JSON 响应
 */
function parseLLMResponse(content: string): LLMResponse {
  try {
    // 尝试提取 JSON 内容
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                      content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('无法解析 AI 返回的内容');
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    // 验证返回的数据结构
    if (!Array.isArray(parsed.segments)) {
      throw new Error('AI 返回的数据格式不正确：缺少 segments 数组');
    }

    // 验证每个片段的结构
    for (const segment of parsed.segments) {
      if (!segment.type) {
        throw new Error('AI 返回的数据格式不正确：片段缺少 type 字段');
      }

      // choice 类型允许 text 为空（AI 可能只提供 choices 数组）
      if (!segment.text) {
        if (segment.type === 'choice') {
          segment.text = '';
        } else {
          throw new Error('AI 返回的数据格式不正确：片段缺少 text 字段');
        }
      }

      if (segment.type === 'dialogue' && !segment.character) {
        throw new Error('AI 返回的数据格式不正确：对话片段缺少 character 字段');
      }

      if (segment.type === 'choice' && !Array.isArray(segment.choices)) {
        throw new Error('AI 返回的数据格式不正确：选择片段缺少 choices 数组');
      }
    }

    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('AI 返回的不是有效的 JSON 格式');
    }
    throw error;
  }
}
