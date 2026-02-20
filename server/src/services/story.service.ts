import { randomUUID } from "node:crypto";
import { eq, and, like, desc, sql, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { storySettings, users, likes, downloads } from "../db/schema.js";
import { badRequest, notFound, forbidden } from "../utils/errors.js";

interface ListParams {
  page: number;
  limit: number;
  sort: "newest" | "popular" | "downloads";
  search?: string;
  genre?: string;
  tags?: string[];
  currentUserId?: number;
}

async function getUserByUuid(uuid: string) {
  return db.select().from(users).where(eq(users.uuid, uuid)).get();
}

function safeJsonArray(input: string): string[] {
  try {
    const value = JSON.parse(input);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function list(params: ListParams) {
  const { page, limit, sort, search, genre, tags, currentUserId } = params;
  const offset = (page - 1) * limit;

  const whereList = [eq(storySettings.status, "approved")];
  if (search) {
    whereList.push(or(like(storySettings.title, `%${search}%`), like(storySettings.premise, `%${search}%`))!);
  }
  if (genre) {
    whereList.push(eq(storySettings.genre, genre));
  }

  const whereClause = whereList.length === 1 ? whereList[0] : and(...whereList);
  const orderBy =
    sort === "popular"
      ? desc(storySettings.likeCount)
      : sort === "downloads"
        ? desc(storySettings.downloadCount)
        : desc(storySettings.createdAt);

  const rows = await db
    .select({
      id: storySettings.id,
      uuid: storySettings.uuid,
      title: storySettings.title,
      premise: storySettings.premise,
      genre: storySettings.genre,
      protagonistName: storySettings.protagonistName,
      difficulty: storySettings.difficulty,
      tags: storySettings.tags,
      downloadCount: storySettings.downloadCount,
      likeCount: storySettings.likeCount,
      createdAt: storySettings.createdAt,
      authorId: storySettings.authorId,
    })
    .from(storySettings)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(storySettings)
    .where(whereClause)
    .get();
  const total = countResult?.count ?? 0;

  const items = await Promise.all(
    rows.map(async (item) => {
      const itemTags = safeJsonArray(item.tags);
      if (tags && tags.length > 0 && !tags.some((tag) => itemTags.includes(tag))) {
        return null;
      }

      const author = await db
        .select({ uuid: users.uuid, nickname: users.nickname, avatarSeed: users.avatarSeed })
        .from(users)
        .where(eq(users.id, item.authorId))
        .get();

      let isLiked = false;
      if (currentUserId) {
        const likeRecord = await db
          .select({ id: likes.id })
          .from(likes)
          .where(
            and(
              eq(likes.userId, currentUserId),
              eq(likes.targetType, "story"),
              eq(likes.targetId, item.id)
            )
          )
          .get();
        isLiked = Boolean(likeRecord);
      }

      return {
        uuid: item.uuid,
        title: item.title,
        premise: item.premise.length > 100 ? `${item.premise.slice(0, 100)}...` : item.premise,
        genre: item.genre,
        protagonistName: item.protagonistName,
        difficulty: item.difficulty,
        tags: itemTags,
        downloadCount: item.downloadCount,
        likeCount: item.likeCount,
        isLiked,
        createdAt: item.createdAt,
        author: author ?? { uuid: "", nickname: "未知", avatarSeed: "" },
      };
    })
  );

  return { items: items.filter(Boolean), total, page, limit };
}

export async function getByUuid(uuid: string, currentUserId?: number) {
  const story = await db.select().from(storySettings).where(eq(storySettings.uuid, uuid)).get();
  if (!story || story.status !== "approved") {
    throw notFound("故事设置不存在");
  }

  const author = await db
    .select({ uuid: users.uuid, nickname: users.nickname, avatarSeed: users.avatarSeed })
    .from(users)
    .where(eq(users.id, story.authorId))
    .get();

  let isLiked = false;
  if (currentUserId) {
    const likeRecord = await db
      .select({ id: likes.id })
      .from(likes)
      .where(
        and(
          eq(likes.userId, currentUserId),
          eq(likes.targetType, "story"),
          eq(likes.targetId, story.id)
        )
      )
      .get();
    isLiked = Boolean(likeRecord);
  }

  return {
    uuid: story.uuid,
    title: story.title,
    premise: story.premise,
    genre: story.genre,
    protagonistName: story.protagonistName,
    protagonistDescription: story.protagonistDescription,
    protagonistAppearance: story.protagonistAppearance,
    difficulty: story.difficulty,
    initialPacing: story.initialPacing,
    extraDescription: story.extraDescription,
    tags: safeJsonArray(story.tags),
    downloadCount: story.downloadCount,
    likeCount: story.likeCount,
    isLiked,
    status: story.status,
    createdAt: story.createdAt,
    author: author ?? { uuid: "", nickname: "未知", avatarSeed: "" },
  };
}

export async function create(
  authorUuid: string,
  data: {
    title: string;
    premise: string;
    genre: string;
    protagonistName: string;
    protagonistDescription?: string;
    protagonistAppearance?: string;
    difficulty?: string;
    initialPacing?: string;
    extraDescription?: string;
    tags?: string[];
  }
) {
  const author = await getUserByUuid(authorUuid);
  if (!author) {
    throw notFound("用户不存在");
  }

  if (!data.title || data.title.length < 1 || data.title.length > 50) {
    throw badRequest("标题长度应为1-50个字符");
  }
  if (!data.premise || data.premise.length < 10) {
    throw badRequest("故事前提至少需要10个字符");
  }
  if (!data.genre) {
    throw badRequest("请选择故事类型");
  }
  if (!data.protagonistName) {
    throw badRequest("请填写主角名称");
  }

  const uuid = randomUUID();
  await db.insert(storySettings).values({
    uuid,
    authorId: author.id,
    title: data.title,
    premise: data.premise,
    genre: data.genre,
    protagonistName: data.protagonistName,
    protagonistDescription: data.protagonistDescription || "",
    protagonistAppearance: data.protagonistAppearance || "",
    difficulty: data.difficulty || "普通",
    initialPacing: data.initialPacing || "轻松",
    extraDescription: data.extraDescription || "",
    tags: JSON.stringify(data.tags || []),
  });

  return { uuid, status: "pending" as const };
}

export async function update(
  storyUuid: string,
  authorUuid: string,
  data: Record<string, unknown>
) {
  const story = await db.select().from(storySettings).where(eq(storySettings.uuid, storyUuid)).get();
  if (!story) {
    throw notFound("故事设置不存在");
  }

  const author = await getUserByUuid(authorUuid);
  if (!author || author.id !== story.authorId) {
    throw forbidden("只能修改自己的故事设置");
  }
  if (story.status === "approved") {
    throw badRequest("已通过审核的故事设置不能修改，请重新提交");
  }

  const updates: Partial<typeof storySettings.$inferInsert> = {
    updatedAt: new Date().toISOString(),
    status: "pending",
  };

  const allowedFields = [
    "title",
    "premise",
    "genre",
    "protagonistName",
    "protagonistDescription",
    "protagonistAppearance",
    "difficulty",
    "initialPacing",
    "extraDescription",
  ] as const;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      (updates as Record<string, unknown>)[field] = data[field];
    }
  }
  if (data.tags !== undefined) {
    updates.tags = JSON.stringify(data.tags);
  }

  await db.update(storySettings).set(updates).where(eq(storySettings.id, story.id));
  return { uuid: storyUuid, status: "pending" as const };
}

export async function remove(storyUuid: string, authorUuid: string) {
  const story = await db.select().from(storySettings).where(eq(storySettings.uuid, storyUuid)).get();
  if (!story) {
    throw notFound("故事设置不存在");
  }

  const author = await getUserByUuid(authorUuid);
  if (!author || author.id !== story.authorId) {
    throw forbidden("只能删除自己的故事设置");
  }

  await db.delete(likes).where(and(eq(likes.targetType, "story"), eq(likes.targetId, story.id)));
  await db
    .delete(downloads)
    .where(and(eq(downloads.targetType, "story"), eq(downloads.targetId, story.id)));
  await db.delete(storySettings).where(eq(storySettings.id, story.id));

  return { success: true };
}

export async function toggleLike(storyUuid: string, userUuid: string) {
  const story = await db.select().from(storySettings).where(eq(storySettings.uuid, storyUuid)).get();
  if (!story) {
    throw notFound("故事设置不存在");
  }

  const user = await getUserByUuid(userUuid);
  if (!user) {
    throw notFound("用户不存在");
  }

  const existing = await db
    .select({ id: likes.id })
    .from(likes)
    .where(and(eq(likes.userId, user.id), eq(likes.targetType, "story"), eq(likes.targetId, story.id)))
    .get();

  if (existing) {
    await db.delete(likes).where(eq(likes.id, existing.id));
    await db
      .update(storySettings)
      .set({ likeCount: sql`CASE WHEN ${storySettings.likeCount} > 0 THEN ${storySettings.likeCount} - 1 ELSE 0 END` })
      .where(eq(storySettings.id, story.id));
    return { liked: false };
  }

  await db.insert(likes).values({ userId: user.id, targetType: "story", targetId: story.id });
  await db
    .update(storySettings)
    .set({ likeCount: sql`${storySettings.likeCount} + 1` })
    .where(eq(storySettings.id, story.id));
  return { liked: true };
}

export async function recordDownload(storyUuid: string, userUuid: string) {
  const story = await db.select().from(storySettings).where(eq(storySettings.uuid, storyUuid)).get();
  if (!story) {
    throw notFound("故事设置不存在");
  }

  const user = await getUserByUuid(userUuid);
  if (!user) {
    throw notFound("用户不存在");
  }

  const existing = await db
    .select({ id: downloads.id })
    .from(downloads)
    .where(
      and(
        eq(downloads.userId, user.id),
        eq(downloads.targetType, "story"),
        eq(downloads.targetId, story.id)
      )
    )
    .get();

  if (!existing) {
    await db.insert(downloads).values({ userId: user.id, targetType: "story", targetId: story.id });
    await db
      .update(storySettings)
      .set({ downloadCount: sql`${storySettings.downloadCount} + 1` })
      .where(eq(storySettings.id, story.id));
  }

  return getByUuid(storyUuid, user.id);
}

export async function listMine(authorUuid: string) {
  const author = await getUserByUuid(authorUuid);
  if (!author) {
    throw notFound("用户不存在");
  }

  const items = await db
    .select()
    .from(storySettings)
    .where(eq(storySettings.authorId, author.id))
    .orderBy(desc(storySettings.createdAt));

  return items.map((item) => ({
    uuid: item.uuid,
    title: item.title,
    premise: item.premise.length > 100 ? `${item.premise.slice(0, 100)}...` : item.premise,
    genre: item.genre,
    status: item.status,
    rejectReason: item.rejectReason,
    downloadCount: item.downloadCount,
    likeCount: item.likeCount,
    createdAt: item.createdAt,
  }));
}
