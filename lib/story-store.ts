import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ───────────────────────────────────────────────────────────

export type SegmentType = "narration" | "dialogue" | "choice";

export type DifficultyLevel = "简单" | "普通" | "困难" | "噩梦" | "无随机";

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
  name: string;
  gender: string;
  /** Detailed personality description — must be unique and specific */
  personality: string;
  /** Background information */
  background: string;
  /** Segment index when character first appeared */
  firstAppearance: number;
}

export interface StorySegment {
  type: SegmentType;
  character?: string;
  text: string;
  choices?: string[];
  /** AI-assigned judgment values for each choice (1-8), parallel to choices[] */
  judgmentValues?: number[];
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

export interface Story {
  id: string;
  title: string;
  premise: string;
  genre: string;
  protagonistName: string;
  protagonistDescription: string;
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
  /** URI of the current background image (base64 data URI or remote URL) */
  backgroundImageUri?: string;
  /** Current image generation status for user-facing feedback */
  imageGenerationStatus: "idle" | "generating" | "success" | "failed";
  /** Timestamp of the latest image generation attempt */
  lastImageGenerationAt?: number;
  /** History of generated image prompts and outcomes */
  imagePromptHistory: ImagePromptRecord[];
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
export function buildHistoryContext(
  segments: StorySegment[],
  storySummary = "",
): string {
  const formatSegment = (s: StorySegment) => {
    let base = "";
    if (s.type === "narration") base = `[旁白] ${s.text}`;
    else if (s.type === "dialogue") base = `[${s.character}] ${s.text}`;
    else if (s.type === "choice") base = `[选择] ${s.text}`;
    else base = s.text;
    if (s.diceResult) {
      base += ` [骰子:${s.diceResult.roll}/${s.diceResult.judgmentValue}=${s.diceResult.outcome}]`;
    }
    return base;
  };

  if (storySummary) {
    const recent = segments.slice(-15).map(formatSegment).join("\n");
    return `[剧情摘要]\n${storySummary}\n\n[最近剧情]\n${recent}`;
  }

  return segments.slice(-30).map(formatSegment).join("\n");
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
  if (!story.imageGenerationStatus) story.imageGenerationStatus = "idle";
  if (!story.imagePromptHistory) story.imagePromptHistory = [];
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
    createdAt: now,
    updatedAt: now,
    segments: [],
    currentIndex: 0,
    historyContext: "",
    choiceCount: 0,
    storySummary: "",
    imageGenerationStatus: "idle",
    imagePromptHistory: [],
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
