import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ───────────────────────────────────────────────────────────

export type SegmentType = "narration" | "dialogue" | "choice";

export type DifficultyLevel = "简单" | "普通" | "困难" | "噩梦" | "无随机";

export type PaceLevel = "慵懒" | "轻松" | "紧张" | "紧迫";

export interface DiceResult {
  /** Dice roll value (1-8) */
  roll: number;
  /** AI-assigned difficulty threshold (1-8) */
  judgmentValue: number;
  /** Outcome relative to judgment */
  outcome: "worse" | "exact" | "better";
}

export interface CharacterCard {
  id: string;
  /** Real name provided by LLM, may be hidden in UI before reveal */
  name: string;
  /** Display alias before the protagonist learns the real name */
  hiddenName: string;
  /** Whether the protagonist has learned this character's real name */
  isNameRevealed: boolean;
  gender: string;
  /** Detailed personality description — must be unique and specific */
  personality: string;
  /** Background information */
  background: string;
  /** Appearance description (hair, eyes, build, clothing, etc.) */
  appearance: string;
  /** URI of AI-generated character portrait image */
  portraitUri?: string;
  /** Affinity with protagonist (0-100) */
  affinity: number;
  /** Segment index when character first appeared */
  firstAppearance: number;
}

export interface StorySegment {
  type: SegmentType;
  character?: string;
  text: string;
  choices?: string[];
  /** AI-assigned judgment values for each choice (1-8) or null if no check needed, parallel to choices[] */
  judgmentValues?: (number | null)[];
  /** Dice result attached to narration segments recording a player's choice */
  diceResult?: DiceResult;
}

export interface ImagePromptRecord {
  id: string;
  prompt: string;
  summary: string;
  status: "pending" | "success" | "failed";
  createdAt: number;
  imageUri?: string;
  error?: string;
}

export interface StorySummaryRecord {
  id: string;
  /** Short title for this summary (max 10 chars) */
  title: string;
  summary: string;
  /** Names of characters involved in this summary segment */
  involvedCharacters: string[];
  /** Full-history char length when this summary was generated */
  sourceChars?: number;
  createdAt: number;
}

export interface Story {
  id: string;
  title: string;
  premise: string;
  genre: string;
  protagonistName: string;
  protagonistGender: string;
  protagonistDescription: string;
  protagonistAppearance: string;
  createdAt: number;
  updatedAt: number;
  /** All segments accumulated so far */
  segments: StorySegment[];
  /** Index of the segment the player is currently viewing */
  currentIndex: number;
  /** Condensed history string sent to AI for context */
  historyContext: string;
  /** Number of choices the player has made */
  choiceCount: number;
  /** AI-generated summary of story so far, used to compress long history */
  storySummary: string;
  /** Current narrative pacing level evaluated by AI */
  currentPacing: PaceLevel;
  /** Total text chars generated in latest AI batch */
  lastGeneratedChars: number;
  /** Latest AI-generated plot batch used for image prompt input */
  latestGeneratedContext: string;
  /** URI of the current background image (base64 data URI or remote URL) */
  backgroundImageUri?: string;
  /** URI of protagonist portrait image */
  protagonistPortraitUri?: string;
  /** Current image generation status for user-facing feedback */
  imageGenerationStatus: "idle" | "generating" | "success" | "failed";
  /** Timestamp of the latest image generation attempt */
  lastImageGenerationAt?: number;
  /** History of generated image prompts and outcomes */
  imagePromptHistory: ImagePromptRecord[];
  /** Story generation status (cross-page UX) */
  storyGenerationStatus: "idle" | "generating" | "failed";
  /** Timestamp when story generation entered generating */
  storyGenerationStartedAt?: number;
  /** Last story generation error (keep only the latest) */
  lastStoryGenerationError: string;
  /** History of generated story summaries */
  summaryHistory: StorySummaryRecord[];
  /** Difficulty setting for dice mechanics */
  difficulty: DifficultyLevel;
  /** Character cards for named NPCs */
  characterCards: CharacterCard[];
  /** Background image zoom percent (50-150) */
  backgroundScalePercent?: number;
  /** Character portrait zoom percent (50-150) */
  characterScalePercent?: number;
  /** Last choice count checkpoint used for auto background generation */
  autoBgChoiceCheckpoint?: number;
  /** Evaluation feedback history for continuation quality */
  continuationFeedbackHistory?: Array<{
    id: string;
    content: string;
    createdAt: number;
  }>;
}

// ─── Storage Keys ────────────────────────────────────────────────────

const STORIES_KEY = "stories_index";
const storyKey = (id: string) => `story_${id}`;

// ─── Helpers ─────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Build a condensed history string from segments.
 *  If a summary exists, prepend it and only include the most recent segments. */
function formatHistorySegment(s: StorySegment): string {
  let base = "";
  if (s.type === "narration") base = `[旁白] ${s.text}`;
  else if (s.type === "dialogue") base = `[${s.character}] ${s.text}`;
  else if (s.type === "choice") base = `[选择] ${s.text}`;
  else base = s.text;
  if (s.diceResult) {
    base += ` [骰子:${s.diceResult.roll}/${s.diceResult.judgmentValue}=${s.diceResult.outcome}]`;
  }
  return base;
}

/** Build full (uncompressed) history string from all segments. */
export function buildFullHistoryContext(segments: StorySegment[]): string {
  return segments.map(formatHistorySegment).join("\n");
}

export function buildHistoryContext(
  segments: StorySegment[],
  storySummary = "",
): string {
  if (storySummary) {
    const recent = segments.slice(-100).map(formatHistorySegment).join("\n");
    return `[剧情摘要]\n${storySummary}\n\n[最近剧情]\n${recent}`;
  }

  return segments.slice(-100).map(formatHistorySegment).join("\n");
}

export interface BoundedHistoryContextOptions {
  maxRecentSegments?: number;
  maxChars?: number;
}

export interface BoundedHistoryContextResult {
  context: string;
  recentSegmentsIncluded: number;
  maxRecentSegments: number;
  maxChars: number;
}

function truncateWithMarker(text: string, maxChars: number): string {
  const normalized = (text ?? "").toString();
  if (normalized.length <= maxChars) return normalized;
  if (maxChars <= 0) return "";
  const head = Math.max(0, maxChars - 32);
  return `${normalized.slice(0, head)}...[truncated ${normalized.length - head} chars]`;
}

/**
 * 构建用于发送给 LLM 的上文：尽量保留摘要与最近段落，但强制限制最大字符数。
 */
export function buildHistoryContextBounded(
  segments: StorySegment[],
  storySummary = "",
  options: BoundedHistoryContextOptions = {},
): BoundedHistoryContextResult {
  const maxRecentSegments = Math.max(
    1,
    Math.floor(options.maxRecentSegments ?? 100),
  );
  const maxChars = Math.max(200, Math.floor(options.maxChars ?? 5000));

  const summaryText = (storySummary ?? "").trim();
  const recentSlice = segments.slice(-maxRecentSegments);
  const recentLines: string[] = [];

  if (summaryText) {
    const headerA = "[剧情摘要]\n";
    const headerB = "\n\n[最近剧情]\n";
    // Ensure summary itself doesn't blow the budget.
    const maxSummaryChars = Math.max(
      0,
      maxChars - headerA.length - headerB.length - 120,
    );
    const summarySafe = truncateWithMarker(summaryText, maxSummaryChars);
    const prefix = `${headerA}${summarySafe}${headerB}`;

    let remaining = Math.max(0, maxChars - prefix.length);
    let included = 0;
    for (let i = recentSlice.length - 1; i >= 0; i--) {
      const line = formatHistorySegment(recentSlice[i]);
      const extra = (recentLines.length > 0 ? 1 : 0) + line.length;
      if (extra <= remaining) {
        recentLines.push(line);
        remaining -= extra;
        included += 1;
      } else if (included === 0 && remaining > 16) {
        recentLines.push(truncateWithMarker(line, remaining));
        included = 1;
        remaining = 0;
        break;
      } else {
        break;
      }
    }

    recentLines.reverse();
    const recentText = recentLines.join("\n");
    return {
      context: (prefix + recentText).slice(0, maxChars),
      recentSegmentsIncluded: included,
      maxRecentSegments,
      maxChars,
    };
  }

  // No summary: only recent segments with hard char cap.
  let remaining = maxChars;
  let included = 0;
  for (let i = recentSlice.length - 1; i >= 0; i--) {
    const line = formatHistorySegment(recentSlice[i]);
    const extra = (recentLines.length > 0 ? 1 : 0) + line.length;
    if (extra <= remaining) {
      recentLines.push(line);
      remaining -= extra;
      included += 1;
    } else if (included === 0 && remaining > 16) {
      recentLines.push(truncateWithMarker(line, remaining));
      included = 1;
      remaining = 0;
      break;
    } else {
      break;
    }
  }
  recentLines.reverse();
  return {
    context: recentLines.join("\n").slice(0, maxChars),
    recentSegmentsIncluded: included,
    maxRecentSegments,
    maxChars,
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────

export async function getStoryIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(STORIES_KEY);
  const parsed = safeParseJson<unknown>(raw, []);
  return Array.isArray(parsed)
    ? parsed.filter((id) => typeof id === "string")
    : [];
}

async function saveStoryIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(STORIES_KEY, JSON.stringify(ids));
}

/** Apply migration defaults for stories created before difficulty/characterCards were added */
function migrateStory(story: Story): Story {
  if (!story.difficulty) story.difficulty = "普通";
  if (!story.characterCards) story.characterCards = [];
  story.characterCards = story.characterCards.map((card) => ({
    ...card,
    hiddenName: card.hiddenName || card.name || "陌生人",
    isNameRevealed:
      card.isNameRevealed ??
      !/(陌生|神秘|无名|未知|男人|女人|来客|路人)/.test(card.name),
    appearance: card.appearance || "",
    affinity:
      typeof card.affinity === "number"
        ? Math.max(0, Math.min(100, Math.round(card.affinity)))
        : 0,
  }));
  // Migrate summaryHistory records to new format
  if (story.summaryHistory) {
    story.summaryHistory = story.summaryHistory.map((rec: any) => ({
      ...rec,
      title: rec.title || "",
      involvedCharacters: rec.involvedCharacters || [],
    }));
  }
  if (!story.imageGenerationStatus) story.imageGenerationStatus = "idle";
  if (!story.imagePromptHistory) story.imagePromptHistory = [];
  if (!story.storyGenerationStatus) story.storyGenerationStatus = "idle";
  if (!story.storyGenerationStartedAt) {
    story.storyGenerationStartedAt =
      story.storyGenerationStatus === "generating" ? story.updatedAt : 0;
  }
  if (!story.lastStoryGenerationError) story.lastStoryGenerationError = "";
  if (!story.summaryHistory) story.summaryHistory = [];
  if (!story.currentPacing) story.currentPacing = "轻松";
  if (!story.lastGeneratedChars) story.lastGeneratedChars = 0;
  if (!story.latestGeneratedContext) story.latestGeneratedContext = "";
  if (!story.protagonistPortraitUri) story.protagonistPortraitUri = "";
  if (!story.protagonistAppearance) story.protagonistAppearance = "";
  if (!story.protagonistGender) story.protagonistGender = "未知";
  if (!story.backgroundScalePercent) story.backgroundScalePercent = 100;
  if (!story.characterScalePercent) story.characterScalePercent = 100;
  if (!story.autoBgChoiceCheckpoint) story.autoBgChoiceCheckpoint = 0;
  if (!story.continuationFeedbackHistory)
    story.continuationFeedbackHistory = [];
  return story;
}

export async function getAllStories(): Promise<Story[]> {
  const ids = await getStoryIds();
  const stories: Story[] = [];
  for (const id of ids) {
    const raw = await AsyncStorage.getItem(storyKey(id));
    const parsed = safeParseJson<Story | null>(raw, null);
    if (parsed) stories.push(migrateStory(parsed));
  }
  // Sort by updatedAt descending
  stories.sort((a, b) => b.updatedAt - a.updatedAt);
  return stories;
}

export async function getStory(id: string): Promise<Story | null> {
  const raw = await AsyncStorage.getItem(storyKey(id));
  const parsed = safeParseJson<Story | null>(raw, null);
  return parsed ? migrateStory(parsed) : null;
}

export async function createStory(
  title: string,
  premise: string,
  genre: string,
  protagonistName: string,
  protagonistGender: string,
  protagonistDescription: string,
  difficulty: DifficultyLevel = "普通",
  initialPacing: PaceLevel = "轻松",
  protagonistAppearance = "",
): Promise<Story> {
  const id = generateId();
  const now = Date.now();
  const story: Story = {
    id,
    title,
    premise,
    genre,
    protagonistName,
    protagonistGender: protagonistGender?.trim() || "未知",
    protagonistDescription,
    protagonistAppearance,
    createdAt: now,
    updatedAt: now,
    segments: [],
    currentIndex: 0,
    historyContext: "",
    choiceCount: 0,
    storySummary: "",
    currentPacing: initialPacing,
    lastGeneratedChars: 0,
    latestGeneratedContext: "",
    protagonistPortraitUri: "",
    imageGenerationStatus: "idle",
    imagePromptHistory: [],
    storyGenerationStatus: "idle",
    storyGenerationStartedAt: 0,
    lastStoryGenerationError: "",
    summaryHistory: [],
    difficulty,
    characterCards: [],
    backgroundScalePercent: 100,
    characterScalePercent: 100,
    autoBgChoiceCheckpoint: 0,
    continuationFeedbackHistory: [],
  };
  await AsyncStorage.setItem(storyKey(id), JSON.stringify(story));
  const ids = await getStoryIds();
  ids.unshift(id);
  await saveStoryIds(ids);
  return story;
}

export async function updateStory(story: Story): Promise<void> {
  story.updatedAt = Date.now();
  story.historyContext = buildHistoryContextBounded(
    story.segments,
    story.storySummary,
    {
      maxRecentSegments: 100,
      maxChars: 30000,
    },
  ).context;
  await AsyncStorage.setItem(storyKey(story.id), JSON.stringify(story));
}

export async function deleteStory(id: string): Promise<void> {
  await AsyncStorage.removeItem(storyKey(id));
  const ids = await getStoryIds();
  await saveStoryIds(ids.filter((i) => i !== id));
}
