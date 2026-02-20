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
  createdAt: number;
}

export interface Story {
  id: string;
  title: string;
  premise: string;
  genre: string;
  protagonistName: string;
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
  /** History of generated story summaries */
  summaryHistory: StorySummaryRecord[];
  /** Difficulty setting for dice mechanics */
  difficulty: DifficultyLevel;
  /** Character cards for named NPCs */
  characterCards: CharacterCard[];
}

// ─── Storage Keys ────────────────────────────────────────────────────

const STORIES_KEY = "stories_index";
const storyKey = (id: string) => `story_${id}`;

// ─── Helpers ─────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
    const recent = segments.slice(-15).map(formatHistorySegment).join("\n");
    return `[剧情摘要]\n${storySummary}\n\n[最近剧情]\n${recent}`;
  }

  return segments.slice(-30).map(formatHistorySegment).join("\n");
}

// ─── CRUD ────────────────────────────────────────────────────────────

export async function getStoryIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(STORIES_KEY);
  return raw ? JSON.parse(raw) : [];
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
  if (!story.summaryHistory) story.summaryHistory = [];
  if (!story.currentPacing) story.currentPacing = "轻松";
  if (!story.lastGeneratedChars) story.lastGeneratedChars = 0;
  if (!story.latestGeneratedContext) story.latestGeneratedContext = "";
  if (!story.protagonistPortraitUri) story.protagonistPortraitUri = "";
  if (!story.protagonistAppearance) story.protagonistAppearance = "";
  return story;
}

export async function getAllStories(): Promise<Story[]> {
  const ids = await getStoryIds();
  const stories: Story[] = [];
  for (const id of ids) {
    const raw = await AsyncStorage.getItem(storyKey(id));
    if (raw) stories.push(migrateStory(JSON.parse(raw)));
  }
  // Sort by updatedAt descending
  stories.sort((a, b) => b.updatedAt - a.updatedAt);
  return stories;
}

export async function getStory(id: string): Promise<Story | null> {
  const raw = await AsyncStorage.getItem(storyKey(id));
  return raw ? migrateStory(JSON.parse(raw)) : null;
}

export async function createStory(
  title: string,
  premise: string,
  genre: string,
  protagonistName: string,
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
    summaryHistory: [],
    difficulty,
    characterCards: [],
  };
  await AsyncStorage.setItem(storyKey(id), JSON.stringify(story));
  const ids = await getStoryIds();
  ids.unshift(id);
  await saveStoryIds(ids);
  return story;
}

export async function updateStory(story: Story): Promise<void> {
  story.updatedAt = Date.now();
  story.historyContext = buildHistoryContext(
    story.segments,
    story.storySummary,
  );
  await AsyncStorage.setItem(storyKey(story.id), JSON.stringify(story));
}

export async function deleteStory(id: string): Promise<void> {
  await AsyncStorage.removeItem(storyKey(id));
  const ids = await getStoryIds();
  await saveStoryIds(ids.filter((i) => i !== id));
}
