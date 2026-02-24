import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock AsyncStorage
const mockStorage: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStorage[key] ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
    getAllKeys: vi.fn(() => Promise.resolve(Object.keys(mockStorage))),
    multiRemove: vi.fn((keys: string[]) => {
      keys.forEach((k) => delete mockStorage[k]);
      return Promise.resolve();
    }),
  },
}));

import {
  createStory,
  getStory,
  getAllStories,
  updateStory,
  deleteStory,
  buildHistoryContext,
  buildHistoryContextBounded,
  type StorySegment,
} from "../lib/story-store";

beforeEach(() => {
  // Clear mock storage before each test
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
});

describe("story-store", () => {
  it("creates a story with correct fields", async () => {
    const story = await createStory(
      "测试故事",
      "这是一个测试开头",
      "奇幻冒险",
      "主角",
      "未知",
      "测试简介",
    );
    expect(story.id).toBeTruthy();
    expect(story.title).toBe("测试故事");
    expect(story.premise).toBe("这是一个测试开头");
    expect(story.genre).toBe("奇幻冒险");
    expect(story.segments).toEqual([]);
    expect(story.currentIndex).toBe(0);
    expect(story.imageGenerationStatus).toBe("idle");
    expect(story.storyGenerationStatus).toBe("idle");
    expect(story.lastStoryGenerationError).toBe("");
    expect(story.imagePromptHistory).toEqual([]);
    expect(story.summaryHistory).toEqual([]);
    expect(story.createdAt).toBeGreaterThan(0);
  });

  it("migrates legacy story fields", async () => {
    const legacyStory = {
      id: "legacy_1",
      title: "旧存档",
      premise: "旧开头",
      genre: "校园日常",
      protagonistName: "主角",
      protagonistDescription: "",
      createdAt: 1,
      updatedAt: 1,
      segments: [],
      currentIndex: 0,
      historyContext: "",
      choiceCount: 0,
      storySummary: "",
      difficulty: "普通",
      characterCards: [],
    };

    mockStorage.stories_index = JSON.stringify([legacyStory.id]);
    mockStorage[`story_${legacyStory.id}`] = JSON.stringify(legacyStory);

    const migrated = await getStory(legacyStory.id);
    expect(migrated).not.toBeNull();
    expect(migrated!.imageGenerationStatus).toBe("idle");
    expect(migrated!.imagePromptHistory).toEqual([]);
    expect(migrated!.summaryHistory).toEqual([]);
    expect(migrated!.protagonistGender).toBe("未知");
    expect(migrated!.storyGenerationStatus).toBe("idle");
  });

  it("retrieves a story by id", async () => {
    const created = await createStory(
      "故事A",
      "开头A",
      "校园日常",
      "主角A",
      "未知",
      "",
    );
    const retrieved = await getStory(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe("故事A");
    expect(retrieved!.genre).toBe("校园日常");
  });

  it("returns null for non-existent story", async () => {
    const result = await getStory("nonexistent");
    expect(result).toBeNull();
  });

  it("lists all stories sorted by updatedAt desc", async () => {
    const s1 = await createStory(
      "故事1",
      "开头1",
      "奇幻冒险",
      "主角1",
      "未知",
      "",
    );
    // Wait a bit so s2 has a later timestamp
    await new Promise((r) => setTimeout(r, 10));
    const s2 = await createStory(
      "故事2",
      "开头2",
      "悬疑推理",
      "主角2",
      "未知",
      "",
    );

    const all = await getAllStories();
    expect(all.length).toBe(2);
    // s2 was created later, so it should be first
    expect(all[0].title).toBe("故事2");
    expect(all[1].title).toBe("故事1");
  });

  it("deletes a story", async () => {
    const story = await createStory(
      "待删除",
      "开头",
      "科幻未来",
      "主角",
      "未知",
      "",
    );
    await deleteStory(story.id);
    const result = await getStory(story.id);
    expect(result).toBeNull();
  });

  it("updates story segments and history context", async () => {
    const story = await createStory(
      "更新测试",
      "开头",
      "古风仙侠",
      "主角",
      "未知",
      "",
    );
    story.segments = [
      { type: "narration", text: "夜幕降临，月光洒在古老的庭院中。" },
      { type: "dialogue", character: "林月", text: "你来了。" },
    ];
    await updateStory(story);

    const updated = await getStory(story.id);
    expect(updated!.segments.length).toBe(2);
    expect(updated!.historyContext).toContain("夜幕降临");
    expect(updated!.historyContext).toContain("林月");
  });
});

describe("buildHistoryContext", () => {
  it("builds context from segments", () => {
    const segments: StorySegment[] = [
      { type: "narration", text: "清晨的阳光透过窗帘。" },
      { type: "dialogue", character: "小明", text: "早上好！" },
      { type: "choice", text: "你选择了：「去学校」" },
    ];
    const context = buildHistoryContext(segments);
    expect(context).toContain("[旁白] 清晨的阳光透过窗帘。");
    expect(context).toContain("[小明] 早上好！");
    expect(context).toContain("[选择] 你选择了：「去学校」");
  });

  it("uses summary and limits recent segments", () => {
    const segments: StorySegment[] = Array.from({ length: 150 }, (_, i) => ({
      type: "narration" as const,
      text: `段落${i}`,
    }));
    const context = buildHistoryContext(segments, "这是剧情摘要");
    expect(context).toContain("[剧情摘要]");
    expect(context).toContain("这是剧情摘要");
    // With summary, only last 100 segments are included
    expect(context).toContain("段落149");
    expect(context).toContain("段落50");
    expect(context).toContain("段落100");
    expect(context).not.toContain("段落49");
  });
});

describe("buildHistoryContextBounded", () => {
  it("enforces hard char cap with summary", () => {
    const segments: StorySegment[] = Array.from({ length: 30 }, (_, i) => ({
      type: "narration",
      text: `第${i}段：` + "剧情".repeat(30),
    }));
    const result = buildHistoryContextBounded(segments, "这是摘要".repeat(60), {
      maxRecentSegments: 20,
      maxChars: 420,
    });

    expect(result.context.length).toBeLessThanOrEqual(420);
    expect(result.context).toContain("[剧情摘要]");
    expect(result.context).toContain("[最近剧情]");
    expect(result.recentSegmentsIncluded).toBeGreaterThan(0);
  });

  it("respects maxRecentSegments without summary", () => {
    const segments: StorySegment[] = Array.from({ length: 12 }, (_, i) => ({
      type: "narration",
      text: `段落${i}`,
    }));

    const result = buildHistoryContextBounded(segments, "", {
      maxRecentSegments: 5,
      maxChars: 5000,
    });

    expect(result.recentSegmentsIncluded).toBe(5);
    expect(result.context).toContain("段落11");
    expect(result.context).toContain("段落7");
    expect(result.context).not.toContain("段落6");
  });
});
