/**
 * LLM 客户端
 * 直接调用 OpenAI 兼容的 API，无需后端
 */

import * as SecureStore from 'expo-secure-store';
import { STORY_SYSTEM_PROMPT, CONTINUE_SYSTEM_PROMPT } from './llm-prompts';

// ─── SecureStore Keys ───────────────────────────────────────────────────────

const API_KEY_KEY = 'user_api_key';
const API_URL_KEY = 'user_api_url';
const MODEL_KEY = 'user_model';

// ─── Types ─────────────────────────────────────────────────────────────────

export type SegmentType = 'narration' | 'dialogue' | 'choice';

export interface StorySegment {
  type: SegmentType;
  character?: string;
  text: string;
  choices?: string[];
}

export interface LLMConfig {
  apiKey: string | null;
  apiUrl: string;
  model: string;
}

export interface GenerateStoryParams {
  title: string;
  premise: string;
  genre: string;
}

export interface ContinueStoryParams {
  title: string;
  genre: string;
  premise: string;
  history: string;
  choiceText: string;
}

export interface LLMResponse {
  segments: StorySegment[];
}

// ─── Config Management ──────────────────────────────────────────────────────

/**
 * 获取用户配置的 API 信息
 */
export async function getLLMConfig(): Promise<LLMConfig> {
  const apiKey = await SecureStore.getItemAsync(API_KEY_KEY);
  const apiUrl = await SecureStore.getItemAsync(API_URL_KEY);
  const model = await SecureStore.getItemAsync(MODEL_KEY);

  return {
    apiKey: apiKey || null,
    apiUrl: apiUrl || 'https://api.openai.com/v1/chat/completions',
    model: model || 'gpt-4o-mini',
  };
}

/**
 * 保存 API 配置
 */
export async function saveLLMConfig(config: {
  apiKey: string;
  apiUrl: string;
  model: string;
}): Promise<void> {
  await SecureStore.setItemAsync(API_KEY_KEY, config.apiKey);
  await SecureStore.setItemAsync(API_URL_KEY, config.apiUrl);
  await SecureStore.setItemAsync(MODEL_KEY, config.model);
}

/**
 * 清除 API 配置
 */
export async function clearLLMConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY_KEY);
  await SecureStore.deleteItemAsync(API_URL_KEY);
  await SecureStore.deleteItemAsync(MODEL_KEY);
}

// ─── LLM API Calls ─────────────────────────────────────────────────────────

/**
 * 验证 API Key 是否有效
 */
export async function testAPIKey(apiKey: string, apiUrl: string, model: string): Promise<boolean> {
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: '测试连接' },
        ],
        max_tokens: 10,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 生成初始剧情
 */
export async function generateStory(params: GenerateStoryParams): Promise<LLMResponse> {
  const { apiKey, apiUrl, model } = await getLLMConfig();

  if (!apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  const userMessage = `故事标题：${params.title}
故事风格：${params.genre}
故事开头/背景设定：
${params.premise}

请根据以上设定，生成故事的开篇剧情。先用旁白描述场景和氛围，然后引入角色对话，最后给出玩家的第一个选择。`;

  const response = await invokeLLM({
    apiUrl,
    apiKey,
    model,
    systemPrompt: STORY_SYSTEM_PROMPT,
    userMessage,
  });

  return parseLLMResponse(response);
}

/**
 * 继续剧情
 */
export async function continueStory(params: ContinueStoryParams): Promise<LLMResponse> {
  const { apiKey, apiUrl, model } = await getLLMConfig();

  if (!apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  const userMessage = `故事标题：${params.title}
故事风格：${params.genre}
故事背景：${params.premise}

之前的剧情摘要：
${params.history}

玩家选择了：「${params.choiceText}」

请根据玩家的选择，继续生成接下来的剧情。`;

  const response = await invokeLLM({
    apiUrl,
    apiKey,
    model,
    systemPrompt: CONTINUE_SYSTEM_PROMPT,
    userMessage,
  });

  return parseLLMResponse(response);
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

interface InvokeLLMParams {
  apiUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
}

async function invokeLLM(params: InvokeLLMParams): Promise<string> {
  const { apiUrl, apiKey, model, systemPrompt, userMessage } = params;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 32768,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 调用失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content || typeof content !== 'string') {
    throw new Error('AI 未能生成有效的剧情内容');
  }

  return content;
}

function parseLLMResponse(content: string): LLMResponse {
  try {
    const parsed = JSON.parse(content);
    
    // 验证返回的数据结构
    if (!parsed.segments || !Array.isArray(parsed.segments)) {
      throw new Error('AI 返回的数据格式错误：缺少 segments 数组');
    }

    // 验证每个 segment 的结构
    for (const segment of parsed.segments) {
      if (!segment.type || !['narration', 'dialogue', 'choice'].includes(segment.type)) {
        throw new Error(`AI 返回的数据格式错误：无效的 type "${segment.type}"`);
      }
      if (!segment.text || typeof segment.text !== 'string') {
        throw new Error('AI 返回的数据格式错误：缺少 text 字段');
      }
      if (segment.type === 'dialogue' && !segment.character) {
        throw new Error('AI 返回的数据格式错误：dialogue 类型缺少 character 字段');
      }
      if (segment.type === 'choice' && (!segment.choices || !Array.isArray(segment.choices))) {
        throw new Error('AI 返回的数据格式错误：choice 类型缺少 choices 数组');
      }
    }

    return { segments: parsed.segments };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('AI 返回的内容不是有效的 JSON 格式');
    }
    throw error;
  }
}
