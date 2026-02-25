/**
 * LLM 客户端
 * 直接调用 OpenAI 兼容的 API，无需后端
 */

import {
  buildDifficultyContext,
  buildCharacterCardsContext,
} from "./llm-prompts";
import { getActivePrompts } from "./prompt-store";
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
  PaceLevel,
} from "./story-store";
import { normalizeLLMNewCharacters } from "./new-character-normalizer";

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
  protagonistAppearance?: string;
  difficulty: DifficultyLevel;
  pacing?: PaceLevel;
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
  protagonistAppearance?: string;
  difficulty: DifficultyLevel;
  pacing?: PaceLevel;
  characterCards?: CharacterCard[];
  diceOutcomeContext?: string;
  continuationFeedback?: string[];
}

export interface SummarizeStoryParams {
  history: string;
  recentTitles?: string[];
}

export interface LLMRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number | null;
}

export interface RandomStoryConfig {
  title: string;
  genre: string;
  protagonistName: string;
  protagonistDescription: string;
  protagonistAppearance?: string;
  premise: string;
}

const RANDOM_GENRE_POOL = [
  "奇幻冒险",
  "校园日常",
  "悬疑推理",
  "古风仙侠",
  "都市情感",
] as const;

function buildFallbackProtagonistAppearance(params: {
  genre?: string;
  personality?: string;
  premise?: string;
}): string {
  const genre = (params.genre || "").trim();
  const personality = (params.personality || "").trim();
  const premise = (params.premise || "").trim();
  const seedText = `${genre}|${personality}|${premise}`;

  const hair = [
    "黑色短发",
    "深棕中长发",
    "银灰短发",
    "栗色微卷发",
    "深蓝利落短发",
  ];
  const eyes = [
    "灰蓝色眼睛",
    "琥珀色眼睛",
    "墨色眼睛",
    "翠绿色眼睛",
    "茶褐色眼睛",
  ];
  const body = ["身形修长", "肩背挺拔", "体态轻盈", "身材匀称", "动作利落"];

  const genreOutfitMap: Record<string, string[]> = {
    奇幻冒险: [
      "常穿旅行斗篷与轻甲护腕",
      "常备皮革腰带与实用长靴",
      "披着旧披风，随身挂着符纹小饰物",
    ],
    校园日常: [
      "常见学院外套与整洁衬衫",
      "偏好宽松针织衫与校裤",
      "日常是简洁校服与帆布鞋",
    ],
    悬疑推理: [
      "偏好深色风衣与便于行动的长裤",
      "常穿低调夹克与防滑短靴",
      "衣着克制，常备便携记事本与手套",
    ],
    古风仙侠: [
      "身着素色长衫与束袖外袍",
      "常着轻便道袍与云纹靴履",
      "衣袂简雅，腰间悬挂玉饰与香囊",
    ],
    都市情感: [
      "偏好简洁风衣与通勤长裤",
      "常穿衬衫叠搭针织外套",
      "服饰利落干净，配色克制",
    ],
  };

  const personalityOutfitTweaks: Array<{ pattern: RegExp; tweak: string }> = [
    { pattern: /(冷静|克制|理性|沉着)/, tweak: "配色偏冷，细节收敛" },
    { pattern: /(活泼|外向|热情|开朗)/, tweak: "衣装点缀更明快" },
    {
      pattern: /(谨慎|敏锐|警惕|侦探)/,
      tweak: "常把实用口袋与便携工具带在身上",
    },
    { pattern: /(温柔|善良|治愈)/, tweak: "整体气质柔和，线条更轻" },
  ];

  const pick = (arr: string[], salt: number) => {
    const code = seedText.charCodeAt(salt % Math.max(seedText.length, 1)) || 17;
    const base = seedText.length * 7 + salt * 13 + code;
    return arr[Math.abs(base) % arr.length];
  };

  const matchedOutfits = genreOutfitMap[genre] || [
    "常穿简洁便于行动的日常服装",
    "衣着朴素利落",
    "偏好低调耐用的搭配",
  ];
  const baseOutfit = pick(matchedOutfits, 4);
  const tweak = personalityOutfitTweaks.find((item) =>
    item.pattern.test(personality),
  )?.tweak;
  const finalOutfit = tweak ? `${baseOutfit}，${tweak}` : baseOutfit;

  return `${pick(hair, 1)}，${pick(eyes, 2)}，${pick(body, 3)}，${finalOutfit}。`;
}

export interface NewCharacterData {
  name: string;
  hiddenName?: string;
  knownToPlayer?: boolean;
  gender: string;
  personality: string;
  background: string;
  appearance?: string;
}

export interface EvaluateInitialAffinityParams {
  title: string;
  premise: string;
  genre: string;
  protagonistName: string;
  protagonistDescription: string;
  protagonistAppearance?: string;
  characters: Array<{
    name: string;
    gender: string;
    personality: string;
    background: string;
    appearance?: string;
  }>;
}

export interface SummaryResult {
  title: string;
  summary: string;
  involvedCharacters: string[];
}

export interface LLMResponse {
  segments: StorySegment[];
  newCharacters?: NewCharacterData[];
  pacing: PaceLevel;
  generatedChars: number;
  minCharsTarget: number;
}

export interface ContinuationEvaluationResult {
  score: number;
  strengths: string[];
  issues: string[];
  advice: string;
}

export const PACE_MIN_CHARS: Record<PaceLevel, number> = {
  慵懒: 1600,
  轻松: 1200,
  紧张: 900,
  紧迫: 600,
};

const DEFAULT_LLM_TEMPERATURE = 0.7;

function resolveConfiguredTemperature(config: LLMConfig): number {
  const value = Number(config.temperature);
  if (Number.isNaN(value)) return DEFAULT_LLM_TEMPERATURE;
  return Math.max(0, Math.min(2, value));
}

const DEFAULT_PACE: PaceLevel = "轻松";

function normalizePaceLevel(value: unknown): PaceLevel {
  if (
    value === "慵懒" ||
    value === "轻松" ||
    value === "紧张" ||
    value === "紧迫"
  ) {
    return value;
  }
  return DEFAULT_PACE;
}

function countSegmentsChars(segments: StorySegment[]): number {
  return segments.reduce((sum, segment) => {
    const main = typeof segment.text === "string" ? segment.text.length : 0;
    const choices = Array.isArray(segment.choices)
      ? segment.choices.join("").length
      : 0;
    return sum + main + choices;
  }, 0);
}

function buildPacingConstraint(requiredPacing: PaceLevel): string {
  const minCharsTarget = PACE_MIN_CHARS[requiredPacing];
  const lowerBound = Math.max(200, minCharsTarget - 100);
  const upperBound = minCharsTarget + 100;
  return `本轮节奏固定为「${requiredPacing}」。你必须输出 pacing="${requiredPacing}"，不得改成其他值。\n字符数规则（统计 segments 的 text 与 choices 合计）：目标值为 ${minCharsTarget}。请将总字符数控制在目标附近的范围（建议 ${lowerBound}~${upperBound}），在保证信息密度的前提下避免明显超写。`;
}

function buildPacingStructureConstraint(requiredPacing: PaceLevel): string {
  if (requiredPacing === "慵懒") {
    return "结构配额（推理向）：12-16 个 segments；至少 2 次场景推进（时间跳转/地点迁移/局势升级满足其二）；至少 2 条可验证新线索、1 个新矛盾点、1 次误导或反转。";
  }
  if (requiredPacing === "轻松") {
    return "结构配额（推理向）：10-14 个 segments；至少 1 次场景推进 + 1 次局势变化；至少 2 条可验证新线索、1 个新矛盾点。";
  }
  if (requiredPacing === "紧张") {
    return "结构配额（推理向）：9-12 个 segments；至少 1 次场景推进 + 2 次连续压力事件；至少 1 条关键线索、1 个伪线索、1 次高风险试探行动。";
  }
  return "结构配额（推理向）：8-10 个 segments；至少 1 次硬后果（暴露/受伤/证物损失/关系破裂）并抛出倒计时悬念；至少 1 条关键线索与 1 个矛盾证词。";
}

export const HISTORY_CONTEXT_CHARS_LIMIT = 8000;
const LLM_REQUEST_TIMEOUT_MS = 90_000;
const HIGH_UNCERTAINTY_ACTION_PATTERNS = [
  /尝试|试图/,
  /强行|硬闯|蛮力|撞开|破门|砸开/,
  /撬锁|开锁|破解|解锁|黑入|入侵/,
  /翻越|攀爬|跳下|潜入/,
  /躲避|逃脱|甩开|反追踪/,
  /说服|谈判|威胁|欺骗|伪装|套话/,
  /搏斗|反击|制服|抢夺|夺取|袭击/,
  /拆弹|急救|手术|修复|调试/,
  /赌一把|冒险/,
];
const ROUTINE_ACTION_PATTERNS = [
  /接电话|打电话|挂电话/,
  /观察|查看|环顾|看向|听/,
  /敲门|开门|关门/,
  /走进|离开|跟上|转身/,
  /询问|对话|打招呼|回应/,
  /等待|整理|坐下|站起/,
];
const HIGH_RISK_CONTEXT_PATTERNS = [
  /卡住|上锁|封死|塌陷|爆炸|火势|毒气|追兵|倒计时/,
  /枪|刀|坠落|窒息|中毒|重伤/,
];

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number | null = LLM_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const hasTimeout = typeof timeoutMs === "number" && timeoutMs > 0;
  if (!hasTimeout) {
    return fetch(input, init);
  }

  const externalSignal = init.signal;
  const controller = new AbortController();
  let detachExternalAbort: (() => void) | null = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      const forwardAbort = () => controller.abort();
      externalSignal.addEventListener("abort", forwardAbort, { once: true });
      detachExternalAbort = () =>
        externalSignal.removeEventListener("abort", forwardAbort);
    }
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const { signal: _ignoredSignal, ...restInit } = init;
  try {
    return await fetch(input, { ...restInit, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (detachExternalAbort) detachExternalAbort();
  }
}

export function shouldRequireDiceCheck(
  action: string,
  contextSnippet = "",
): boolean {
  const actionText = (action ?? "").replace(/\s+/g, "");
  if (!actionText) return false;

  if (HIGH_UNCERTAINTY_ACTION_PATTERNS.some((rule) => rule.test(actionText))) {
    return true;
  }

  if (ROUTINE_ACTION_PATTERNS.some((rule) => rule.test(actionText))) {
    const ctx = (contextSnippet ?? "").replace(/\s+/g, "").slice(-220);
    return HIGH_RISK_CONTEXT_PATTERNS.some((rule) => rule.test(ctx));
  }

  // 默认保守：没有明显风险信号时，不触发判定。
  return false;
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

function normalizeJsonLikeText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function replaceSingleQuotedJsonLiterals(raw: string): string {
  const quotedKey = /([{,]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g;
  const quotedValue = /:\s*'([^'\\]*(?:\\.[^'\\]*)*)'(\s*[,}\]])/g;
  let next = raw.replace(quotedKey, (_m, prefix: string, key: string) => {
    return `${prefix}"${key.replace(/"/g, '\\"')}":`;
  });
  next = next.replace(
    quotedValue,
    (_m, value: string, suffix: string) =>
      `: "${value.replace(/"/g, '\\"')}"${suffix}`,
  );
  return next;
}

function removeTrailingCommas(raw: string): string {
  return raw.replace(/,\s*([}\]])/g, "$1");
}

function balanceJsonClosings(raw: string): string {
  let text = raw;
  const stack: ("}" | "]")[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      stack.push("}");
      continue;
    }
    if (ch === "[") {
      stack.push("]");
      continue;
    }
    if ((ch === "}" || ch === "]") && stack.length > 0) {
      stack.pop();
    }
  }

  if (inString) {
    if (escaped) text += "\\";
    text += '"';
  }
  while (stack.length > 0) {
    text += stack.pop();
  }
  return text;
}

function parseJsonObjectWithRecovery(content: string): any {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const pushCandidate = (value: string | null | undefined) => {
    const normalized = (value ?? "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  let strictPayload = "";
  try {
    strictPayload = extractJsonPayload(content);
    pushCandidate(strictPayload);
  } catch {
    // fall through with recovery candidates
  }

  const normalizedContent = normalizeJsonLikeText(content ?? "");
  pushCandidate(normalizedContent);

  const firstBrace = normalizedContent.indexOf("{");
  if (firstBrace >= 0) {
    pushCandidate(normalizedContent.slice(firstBrace));
  }
  if (strictPayload) {
    pushCandidate(normalizeJsonLikeText(strictPayload));
  }

  const expandedCandidates = [...candidates];
  for (const item of candidates) {
    expandedCandidates.push(replaceSingleQuotedJsonLiterals(item));
    expandedCandidates.push(removeTrailingCommas(item));
    expandedCandidates.push(balanceJsonClosings(item));
    expandedCandidates.push(
      balanceJsonClosings(
        removeTrailingCommas(replaceSingleQuotedJsonLiterals(item)),
      ),
    );
  }

  let lastError: unknown;
  for (const candidate of expandedCandidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new SyntaxError("AI 返回的不是有效的 JSON 格式");
}

function splitNarrationText(text: string, maxLen = 60): string[] {
  const normalized = text.trim();
  if (!normalized) return [""];
  if (normalized.length <= maxLen) return [normalized];

  const parts: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLen) {
    const candidate = remaining.slice(0, maxLen);
    let splitAt = -1;
    for (let i = candidate.length - 1; i >= 0; i -= 1) {
      const ch = candidate[i];
      if ("，。！？；,.!?;：".includes(ch)) {
        splitAt = i + 1;
        break;
      }
    }
    if (splitAt < 20) {
      splitAt = maxLen;
    }

    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) parts.push(remaining);
  return parts.filter(Boolean);
}

function buildFallbackStoryResponse(requiredPacing?: PaceLevel): LLMResponse {
  const pacing = normalizePaceLevel(requiredPacing ?? DEFAULT_PACE);
  const segments: StorySegment[] = [
    {
      type: "narration",
      text: "你先稳住呼吸，快速复盘现场，判断眼前局势的真实威胁。",
    },
    {
      type: "narration",
      text: "细节逐渐浮出水面，但关键线索仍然隐藏在风险更高的行动里。",
    },
    {
      type: "choice",
      text: "接下来你要怎么做？",
      choices: [
        "你先观察周围并整理可用线索",
        "你主动接触关键人物并试探其反应",
        "你选择高风险行动直接突破当前僵局",
      ],
      judgmentValues: [null, null, 5],
    },
  ];
  return {
    segments,
    newCharacters: [],
    pacing,
    generatedChars: countSegmentsChars(segments),
    minCharsTarget: PACE_MIN_CHARS[pacing],
  };
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
  temperature?: number;
  evalApiKey?: string;
  evalApiUrl?: string;
  evalModel?: string;
  evalTemperature?: number;
  autoBackgroundEveryChoices?: number;
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
  temperature = DEFAULT_LLM_TEMPERATURE,
): Promise<boolean> {
  try {
    // 如果 apiUrl 已经包含了完整路径，直接使用；否则添加 /chat/completions
    const url = apiUrl.includes("/chat/completions")
      ? apiUrl
      : `${apiUrl}/chat/completions`;
    const response = await fetchWithTimeout(url, {
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
        temperature: Math.max(0, Math.min(2, temperature)),
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
  options: LLMRequestOptions = {},
): Promise<LLMResponse> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const prompts = await getActivePrompts();
  const requiredPacing = normalizePaceLevel(params.pacing ?? DEFAULT_PACE);
  const temperature = resolveConfiguredTemperature(config);

  // 如果 apiUrl 已经包含了完整路径，直接使用；否则添加 /chat/completions
  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: options.signal,
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: prompts.STORY_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: `创建一个${params.genre}类型的故事，标题是"${params.title}"，前提是"${params.premise}"。玩家主角姓名：${params.protagonistName}${params.protagonistDescription ? `，主角简介：${params.protagonistDescription}` : ""}${params.protagonistAppearance ? `，主角外貌：${params.protagonistAppearance}` : ""}。\n\n${buildDifficultyContext(params.difficulty)}\n${buildCharacterCardsContext(params.characterCards ?? [])}\n\n${buildPacingConstraint(requiredPacing)}\n${buildPacingStructureConstraint(requiredPacing)}\n\n请生成剧情片段，每个片段包含类型、角色（对话时）、文本和选项（最后一个片段）。`,
          },
        ],
        temperature,
        max_tokens: 4000,
      }),
    },
    options.timeoutMs ?? null,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 调用失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || "";

  return parseLLMResponse(content, requiredPacing);
}

/**
 * 继续故事
 */
export async function continueStory(
  params: ContinueStoryParams,
  options: LLMRequestOptions = {},
): Promise<LLMResponse> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const prompts = await getActivePrompts();
  const requiredPacing = normalizePaceLevel(params.pacing ?? DEFAULT_PACE);
  const temperature = resolveConfiguredTemperature(config);

  // 如果 apiUrl 已经包含了完整路径，直接使用；否则添加 /chat/completions
  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: options.signal,
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: prompts.CONTINUE_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: `故事标题：${params.title}\n类型：${params.genre}\n前提：${params.premise}\n玩家主角：${params.protagonistName}${params.protagonistDescription ? `（${params.protagonistDescription}）` : ""}${params.protagonistAppearance ? `，外貌：${params.protagonistAppearance}` : ""}\n\n${buildDifficultyContext(params.difficulty)}\n${buildCharacterCardsContext(params.characterCards ?? [])}\n\n前情提要与最近剧情：\n${params.history.trim()}\n\n${params.continuationFeedback?.length ? `[最近续写复盘建议]\n${params.continuationFeedback.join("\n")}` : ""}\n\n${params.diceOutcomeContext ? params.diceOutcomeContext + "\n\n" : ""}用户选择了：${params.choiceText}\n\n${buildPacingConstraint(requiredPacing)}\n${buildPacingStructureConstraint(requiredPacing)}\n\n请根据用户的选择继续生成新的故事片段，保持剧情连贯性。`,
          },
        ],
        temperature,
        max_tokens: 4000,
      }),
    },
    options.timeoutMs ?? null,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 调用失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || "";

  return parseLLMResponse(content, requiredPacing);
}

/**
 * 生成剧情摘要（用于长剧情的上下文压缩）
 * Returns structured summary with title and involved characters
 */
export async function summarizeStory(
  params: SummarizeStoryParams,
): Promise<SummaryResult> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const prompts = await getActivePrompts();
  const temperature = resolveConfiguredTemperature(config);

  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: prompts.SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: params.recentTitles?.length
            ? `${params.history}\n\n[近期总结标题（避免重复）]\n${params.recentTitles.join("\n")}`
            : params.history,
        },
      ],
      temperature,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`摘要生成失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content: string = data.choices[0]?.message?.content?.trim() ?? "";

  // Try to parse as JSON first (new format)
  try {
    const parsed = parseJsonObjectWithRecovery(content);
    return {
      title: parsed.title || "",
      summary: parsed.summary || content,
      involvedCharacters: Array.isArray(parsed.involvedCharacters)
        ? parsed.involvedCharacters
        : [],
    };
  } catch {
    // Fallback: treat entire content as plain summary text (backward compat)
    return {
      title: "",
      summary: content,
      involvedCharacters: [],
    };
  }
}

/**
 * 为摘要生成简短标题（用于事件标签展示）
 */
export async function generateSummaryTitle(params: {
  summary: string;
  recentTitles?: string[];
}): Promise<string> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const prompts = await getActivePrompts();
  const temperature = resolveConfiguredTemperature(config);

  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: prompts.SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: `请为下面这段剧情摘要生成一个不超过10个字的中文短标题，避免与近期标题重复。只输出标题本身，不要解释。\n\n[摘要]\n${params.summary.trim()}\n\n[近期标题]\n${(params.recentTitles ?? []).join("\n") || "（无）"}`,
        },
      ],
      temperature,
      max_tokens: 30,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`标题生成失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const rawTitle: string = data.choices[0]?.message?.content?.trim() ?? "";
  return rawTitle
    .replace(/["“”'`]/g, "")
    .trim()
    .slice(0, 10);
}

/**
 * 随机生成故事设定
 */
export async function randomizeStory(): Promise<RandomStoryConfig> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const prompts = await getActivePrompts();
  const temperature = resolveConfiguredTemperature(config);
  const randomBucket = Math.floor(Math.random() * 5) + 1;
  const targetGenre = RANDOM_GENRE_POOL[randomBucket - 1];

  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: prompts.RANDOMIZE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `请基于题材「${targetGenre}」生成一套故事设定。必须使用该题材，不要改成其他题材。默认避免硬科幻术语与生僻专业词，语言自然口语化。`,
        },
      ],
      temperature,
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
    const parsed = parseJsonObjectWithRecovery(content) as RandomStoryConfig;
    if (!parsed.title || !parsed.premise || !parsed.protagonistName) {
      throw new Error("返回字段不完整");
    }
    return {
      ...parsed,
      genre: targetGenre,
      protagonistAppearance:
        parsed.protagonistAppearance?.trim() ||
        buildFallbackProtagonistAppearance({
          genre: targetGenre,
          personality: parsed.protagonistDescription,
          premise: parsed.premise,
        }),
    };
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

  const prompts = await getActivePrompts();
  const temperature = resolveConfiguredTemperature(config);

  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: prompts.IMAGE_PROMPT_SYSTEM_PROMPT },
        { role: "user", content: `剧情摘要：\n${summary}` },
      ],
      temperature,
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
function parseLLMResponse(
  content: string,
  requiredPacing?: PaceLevel,
): LLMResponse {
  try {
    const parsed = parseJsonObjectWithRecovery(content);

    // 验证返回的数据结构
    if (!Array.isArray(parsed.segments)) {
      throw new Error("AI 返回的数据格式不正确：缺少 segments 数组");
    }

    // 验证每个片段的结构
    const normalizedSegments: StorySegment[] = [];

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
            segment.judgmentValues = segment.choices.map(() => null);
          }
          // Clamp numeric values to 1-8, keep null as-is
          segment.judgmentValues = segment.judgmentValues.map(
            (v: number | null, idx: number) => {
              const choiceText = segment.choices?.[idx] ?? "";
              if (!shouldRequireDiceCheck(choiceText)) {
                return null;
              }
              return v === null || v === undefined
                ? null
                : Math.max(1, Math.min(8, Math.round(v)));
            },
          );
        }
        // judgmentValues may be absent in 无随机 mode — that's fine
      }

      if (segment.type === "narration" && typeof segment.text === "string") {
        const chunks = splitNarrationText(segment.text, 60);
        for (const chunk of chunks) {
          normalizedSegments.push({ ...segment, text: chunk });
        }
        continue;
      }

      normalizedSegments.push(segment);
    }

    // Extract newCharacters if present
    const newCharacters: NewCharacterData[] = normalizeLLMNewCharacters(
      parsed.newCharacters,
      (message) => console.warn(`[LLM] parseLLMResponse: ${message}`),
    );

    const parsedPacing = normalizePaceLevel(parsed.pacing);
    const pacing = parsedPacing;
    const validationPacing = requiredPacing ?? parsedPacing;
    const generatedChars = countSegmentsChars(normalizedSegments);
    const minCharsTarget = PACE_MIN_CHARS[validationPacing];

    return {
      segments: normalizedSegments,
      newCharacters,
      pacing,
      generatedChars,
      minCharsTarget,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      "[LLM] parseLLMResponse failed, fallback response enabled:",
      message,
    );
    return buildFallbackStoryResponse(requiredPacing);
  }
}

/**
 * 评估自定义行动的判定值（轻量 API 调用）
 */
export async function evaluateCustomAction(
  action: string,
  history: string,
  difficulty: DifficultyLevel,
  protagonistName?: string,
  protagonistDescription?: string,
  options: LLMRequestOptions = {},
): Promise<number> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const contextSnippet = history.slice(-220);

  const prompts = await getActivePrompts();
  const temperature = resolveConfiguredTemperature(config);

  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: options.signal,
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: prompts.EVALUATE_ACTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: `${buildDifficultyContext(difficulty)}\n\n${protagonistName ? `主角：${protagonistName}${protagonistDescription ? `（${protagonistDescription}）` : ""}` : ""}\n\n最近剧情：\n${history.slice(-500)}\n\n玩家自定义行动："${action}"\n\n该行动为玩家主动输入的自定义行动，必须给出 1-8 的判定值，不允许输出 null。只输出数字，不要解释。`,
          },
        ],
        temperature,
        max_tokens: 10,
      }),
    },
    options.timeoutMs,
  );

  const fallbackByDifficulty: Record<DifficultyLevel, number> = {
    简单: 3,
    普通: 4,
    困难: 5,
    噩梦: 6,
    无随机: 4,
  };
  const fallbackValue = shouldRequireDiceCheck(action, contextSnippet)
    ? Math.min(8, fallbackByDifficulty[difficulty] + 1)
    : fallbackByDifficulty[difficulty];

  if (!response.ok) {
    return fallbackValue;
  }

  const data = await response.json();
  const content: string = data.choices[0]?.message?.content?.trim() ?? "4";
  const normalized = content.toLowerCase();
  if (normalized === "null") {
    return fallbackValue;
  }
  const match = content.match(/[1-8]/);
  const value = match ? parseInt(match[0], 10) : Number.NaN;
  return Number.isNaN(value) ? fallbackValue : Math.max(1, Math.min(8, value));
}

/**
 * 评估新角色初始好感度（0-100）
 */
export async function evaluateInitialAffinities(
  params: EvaluateInitialAffinityParams,
): Promise<Record<string, number>> {
  if (!params.characters.length) return {};

  const config = await getLLMConfig();
  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const temperature = resolveConfiguredTemperature(config);
  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;

  const response = await fetchWithTimeout(url, {
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
          content:
            "你是剧情关系评估器。请根据主角与出场角色的关系亲疏，返回每个角色初始好感度（0-100）。仅输出 JSON。",
        },
        {
          role: "user",
          content: `故事标题：${params.title}\n题材：${params.genre}\n开场：${params.premise}\n主角：${params.protagonistName}${params.protagonistDescription ? `（${params.protagonistDescription}）` : ""}${params.protagonistAppearance ? `，外貌：${params.protagonistAppearance}` : ""}\n\n请为以下角色评估初始好感度。输出格式：{ "affinities": [ { "name": "角色名", "affinity": 0-100 } ] }\n\n角色列表：\n${params.characters
            .map(
              (c, i) =>
                `${i + 1}. ${c.name}｜性别:${c.gender || "未知"}｜性格:${c.personality || "未知"}｜背景:${c.background || "未知"}｜外貌:${c.appearance || "未提供"}`,
            )
            .join("\n")}`,
        },
      ],
      temperature,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`初始好感评估失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content: string = data.choices[0]?.message?.content?.trim() ?? "";
  if (!content) return {};

  try {
    const parsed = parseJsonObjectWithRecovery(content) as {
      affinities?: Array<{ name?: string; affinity?: number }>;
    };
    const list = Array.isArray(parsed.affinities) ? parsed.affinities : [];
    const mapped: Record<string, number> = {};
    for (const item of list) {
      const name = (item.name || "").trim();
      if (!name) continue;
      const affinity = Math.round(Number(item.affinity));
      if (Number.isNaN(affinity)) continue;
      mapped[name] = Math.max(0, Math.min(100, affinity));
    }
    return mapped;
  } catch {
    return {};
  }
}

/**
 * 根据角色信息生成角色立绘的英文提示词
 */
export async function generateCharacterPortraitPrompt(
  character: CharacterCard,
): Promise<string> {
  const config = await getLLMConfig();

  if (!config.apiKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  const prompts = await getActivePrompts();
  const temperature = resolveConfiguredTemperature(config);

  const url = config.apiUrl.includes("/chat/completions")
    ? config.apiUrl
    : `${config.apiUrl}/chat/completions`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: prompts.CHARACTER_PORTRAIT_SYSTEM_PROMPT },
        {
          role: "user",
          content: `角色信息：\n姓名：${character.name}\n性别：${character.gender}\n外貌：${character.appearance || "未提供"}\n性格：${character.personality}\n背景：${character.background}`,
        },
      ],
      temperature,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `角色立绘提示词生成失败: ${response.status} - ${errorText}`,
    );
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() ?? "";
}

export async function evaluateContinuationQuality(params: {
  title: string;
  genre: string;
  premise: string;
  historyBefore: string;
  generatedSegments: StorySegment[];
}): Promise<ContinuationEvaluationResult | null> {
  const config = await getLLMConfig();
  if (!config.apiKey) return null;

  const evalApiKey = config.evalApiKey?.trim() || config.apiKey;
  const evalApiUrl = config.evalApiUrl?.trim() || config.apiUrl;
  const evalModel = config.evalModel?.trim() || config.model;

  if (!evalApiKey || !evalApiUrl || !evalModel) return null;

  const prompts = await getActivePrompts();
  const evalTemp = Number(config.evalTemperature);
  const temperature = Number.isNaN(evalTemp)
    ? resolveConfiguredTemperature(config)
    : Math.max(0, Math.min(2, evalTemp));
  const url = evalApiUrl.includes("/chat/completions")
    ? evalApiUrl
    : `${evalApiUrl}/chat/completions`;

  const generatedText = params.generatedSegments
    .map((segment) => {
      if (segment.type === "dialogue") {
        return `[${segment.character || "角色"}] ${segment.text}`;
      }
      if (segment.type === "choice") {
        const choices = Array.isArray(segment.choices)
          ? segment.choices.join(" | ")
          : "";
        return `[选择] ${segment.text}${choices ? ` | ${choices}` : ""}`;
      }
      return `[旁白] ${segment.text}`;
    })
    .join("\n");

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${evalApiKey}`,
    },
    body: JSON.stringify({
      model: evalModel,
      messages: [
        {
          role: "system",
          content: prompts.EVALUATE_CONTINUATION_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `故事标题：${params.title}\n题材：${params.genre}\n开场：${params.premise}\n\n[续写前上下文]\n${params.historyBefore}\n\n[本轮新增片段]\n${generatedText}`,
        },
      ],
      temperature,
      max_tokens: 500,
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  const content: string = data.choices?.[0]?.message?.content?.trim() || "";
  if (!content) return null;

  try {
    const parsed = parseJsonObjectWithRecovery(content) as {
      score?: number;
      strengths?: string[];
      issues?: string[];
      advice?: string;
    };
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
    return {
      score: Number.isNaN(score) ? 0 : score,
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.map((item) => String(item)).slice(0, 5)
        : [],
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map((item) => String(item)).slice(0, 5)
        : [],
      advice: String(parsed.advice || "").trim(),
    };
  } catch {
    return null;
  }
}
