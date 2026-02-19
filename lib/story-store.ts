import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ───────────────────────────────────────────────────────────

export type SegmentType = "narration" | "dialogue" | "choice";

export interface StorySegment {
  type: SegmentType;
  character?: string;
  text: string;
  choices?: string[];
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
export function buildHistoryContext(segments: StorySegment[], storySummary = ""): string {
  const formatSegment = (s: StorySegment) => {
    if (s.type === "narration") return `[旁白] ${s.text}`;
    if (s.type === "dialogue") return `[${s.character}] ${s.text}`;
    if (s.type === "choice") return `[选择] ${s.text}`;
    return s.text;
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

export async function getAllStories(): Promise<Story[]> {
  const ids = await getStoryIds();
  const stories: Story[] = [];
  for (const id of ids) {
    const raw = await AsyncStorage.getItem(storyKey(id));
    if (raw) stories.push(JSON.parse(raw));
  }
  // Sort by updatedAt descending
  stories.sort((a, b) => b.updatedAt - a.updatedAt);
  return stories;
}

export async function getStory(id: string): Promise<Story | null> {
  const raw = await AsyncStorage.getItem(storyKey(id));
  return raw ? JSON.parse(raw) : null;
}

export async function createStory(
  title: string,
  premise: string,
  genre: string,
  protagonistName: string,
  protagonistDescription: string
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
  };
  await AsyncStorage.setItem(storyKey(id), JSON.stringify(story));
  const ids = await getStoryIds();
  ids.unshift(id);
  await saveStoryIds(ids);
  return story;
}

export async function updateStory(story: Story): Promise<void> {
  story.updatedAt = Date.now();
  story.historyContext = buildHistoryContext(story.segments, story.storySummary);
  await AsyncStorage.setItem(storyKey(story.id), JSON.stringify(story));
}

export async function deleteStory(id: string): Promise<void> {
  await AsyncStorage.removeItem(storyKey(id));
  const ids = await getStoryIds();
  await saveStoryIds(ids.filter((i) => i !== id));
}
