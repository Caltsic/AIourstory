import { randomUUID } from "node:crypto";
import { eq, and, like, desc, sql, or, inArray, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { promptPresets, users, likes, downloads } from "../db/schema.js";
import { badRequest, notFound, forbidden } from "../utils/errors.js";

interface ListParams {
  page: number;
  limit: number;
  cursor?: string;
  sort: "newest" | "popular" | "downloads";
  search?: string;
  tags?: string[];
  currentUserId?: number;
}

interface ListCursorPayload {
  createdAt: string;
  id: number;
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

function encodeListCursor(item: { createdAt: string; id: number }): string {
  return Buffer.from(
    JSON.stringify({ createdAt: item.createdAt, id: item.id }),
    "utf8",
  ).toString("base64url");
}

function decodeListCursor(cursor?: string): ListCursorPayload | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { createdAt?: string; id?: number };
    if (!parsed.createdAt || !Number.isFinite(parsed.id)) return null;
    return { createdAt: parsed.createdAt, id: Number(parsed.id) };
  } catch {
    return null;
  }
}

export async function list(params: ListParams) {
  const { page, limit, cursor, sort, search, tags, currentUserId } = params;
  const offset = (page - 1) * limit;
  const cursorPayload = sort === "newest" ? decodeListCursor(cursor) : null;

  const whereList = [eq(promptPresets.status, "approved")];
  if (search) {
    whereList.push(
      or(
        like(promptPresets.name, `%${search}%`),
        like(promptPresets.description, `%${search}%`),
      )!,
    );
  }
  if (tags && tags.length > 0) {
    whereList.push(
      or(...tags.map((tag) => like(promptPresets.tags, `%"${tag}"%`)))!,
    );
  }

  if (cursorPayload) {
    whereList.push(
      or(
        lt(promptPresets.createdAt, cursorPayload.createdAt),
        and(
          eq(promptPresets.createdAt, cursorPayload.createdAt),
          lt(promptPresets.id, cursorPayload.id),
        ),
      )!,
    );
  }

  const whereClause = whereList.length === 1 ? whereList[0] : and(...whereList);
  const orderByList =
    sort === "popular"
      ? [desc(promptPresets.likeCount), desc(promptPresets.id)]
      : sort === "downloads"
        ? [desc(promptPresets.downloadCount), desc(promptPresets.id)]
        : [desc(promptPresets.createdAt), desc(promptPresets.id)];

  const rowLimit = cursorPayload ? limit + 1 : limit;

  const queriedRows = await db
    .select({
      id: promptPresets.id,
      uuid: promptPresets.uuid,
      name: promptPresets.name,
      description: promptPresets.description,
      tags: promptPresets.tags,
      downloadCount: promptPresets.downloadCount,
      likeCount: promptPresets.likeCount,
      createdAt: promptPresets.createdAt,
      authorUuid: users.uuid,
      authorNickname: users.nickname,
      authorAvatarSeed: users.avatarSeed,
    })
    .from(promptPresets)
    .leftJoin(users, eq(users.id, promptPresets.authorId))
    .where(whereClause)
    .orderBy(...orderByList)
    .limit(rowLimit)
    .offset(cursorPayload ? 0 : offset);

  const hasMoreByCursor = cursorPayload ? queriedRows.length > limit : false;
  const rows = hasMoreByCursor ? queriedRows.slice(0, limit) : queriedRows;

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(promptPresets)
    .where(whereClause)
    .get();
  const total = countResult?.count ?? 0;

  let likedIdSet = new Set<number>();
  if (currentUserId && rows.length > 0) {
    const likeRows = await db
      .select({ targetId: likes.targetId })
      .from(likes)
      .where(
        and(
          eq(likes.userId, currentUserId),
          eq(likes.targetType, "prompt"),
          inArray(
            likes.targetId,
            rows.map((item) => item.id),
          ),
        ),
      );
    likedIdSet = new Set(likeRows.map((row) => row.targetId));
  }

  const items = rows.map((item) => ({
    uuid: item.uuid,
    name: item.name,
    description: item.description,
    tags: safeJsonArray(item.tags),
    downloadCount: item.downloadCount,
    likeCount: item.likeCount,
    isLiked: likedIdSet.has(item.id),
    createdAt: item.createdAt,
    author: {
      uuid: item.authorUuid ?? "",
      nickname: item.authorNickname ?? "未知",
      avatarSeed: item.authorAvatarSeed ?? "",
    },
  }));

  const hasNextByPage =
    !cursorPayload && sort === "newest" && rows.length === limit;
  const nextCursor =
    sort === "newest" && rows.length > 0 && (hasMoreByCursor || hasNextByPage)
      ? encodeListCursor({
          createdAt: rows[rows.length - 1].createdAt,
          id: rows[rows.length - 1].id,
        })
      : undefined;

  return { items, total, page, limit, nextCursor };
}

export async function getByUuid(uuid: string, currentUserId?: number) {
  const preset = await db
    .select()
    .from(promptPresets)
    .where(eq(promptPresets.uuid, uuid))
    .get();
  if (!preset || preset.status !== "approved") {
    throw notFound("提示词预设不存在");
  }

  const author = await db
    .select({
      uuid: users.uuid,
      nickname: users.nickname,
      avatarSeed: users.avatarSeed,
    })
    .from(users)
    .where(eq(users.id, preset.authorId))
    .get();

  let isLiked = false;
  if (currentUserId) {
    const likeRecord = await db
      .select({ id: likes.id })
      .from(likes)
      .where(
        and(
          eq(likes.userId, currentUserId),
          eq(likes.targetType, "prompt"),
          eq(likes.targetId, preset.id),
        ),
      )
      .get();
    isLiked = Boolean(likeRecord);
  }

  return {
    uuid: preset.uuid,
    name: preset.name,
    description: preset.description,
    promptsJson: preset.promptsJson,
    tags: safeJsonArray(preset.tags),
    downloadCount: preset.downloadCount,
    likeCount: preset.likeCount,
    isLiked,
    status: preset.status,
    createdAt: preset.createdAt,
    author: author ?? { uuid: "", nickname: "未知", avatarSeed: "" },
  };
}

export async function create(
  authorUuid: string,
  data: {
    name: string;
    description: string;
    promptsJson: string;
    tags: string[];
  },
) {
  const author = await getUserByUuid(authorUuid);
  if (!author) {
    throw notFound("用户不存在");
  }

  if (!data.name || data.name.length < 1 || data.name.length > 50) {
    throw badRequest("预设名称长度应为1-50个字符");
  }

  try {
    JSON.parse(data.promptsJson);
  } catch {
    throw badRequest("提示词数据格式无效");
  }

  const uuid = randomUUID();
  await db.insert(promptPresets).values({
    uuid,
    authorId: author.id,
    name: data.name,
    description: data.description || "",
    promptsJson: data.promptsJson,
    tags: JSON.stringify(data.tags || []),
  });

  return { uuid, status: "pending" as const };
}

export async function update(
  presetUuid: string,
  authorUuid: string,
  data: {
    name?: string;
    description?: string;
    promptsJson?: string;
    tags?: string[];
  },
) {
  const preset = await db
    .select()
    .from(promptPresets)
    .where(eq(promptPresets.uuid, presetUuid))
    .get();
  if (!preset) {
    throw notFound("提示词预设不存在");
  }

  const author = await getUserByUuid(authorUuid);
  if (!author || author.id !== preset.authorId) {
    throw forbidden("只能修改自己的预设");
  }
  if (preset.status === "approved") {
    throw badRequest("已通过审核的预设不能修改，请重新提交");
  }

  const updates: Partial<typeof promptPresets.$inferInsert> = {
    updatedAt: new Date().toISOString(),
    status: "pending",
    rejectReason: null,
    reviewedBy: null,
    reviewedAt: null,
  };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.promptsJson !== undefined) updates.promptsJson = data.promptsJson;
  if (data.tags !== undefined) updates.tags = JSON.stringify(data.tags);

  await db
    .update(promptPresets)
    .set(updates)
    .where(eq(promptPresets.id, preset.id));
  return { uuid: presetUuid, status: "pending" as const };
}

export async function remove(presetUuid: string, authorUuid: string) {
  const preset = await db
    .select()
    .from(promptPresets)
    .where(eq(promptPresets.uuid, presetUuid))
    .get();
  if (!preset) {
    throw notFound("提示词预设不存在");
  }

  const author = await getUserByUuid(authorUuid);
  if (!author || author.id !== preset.authorId) {
    throw forbidden("只能删除自己的预设");
  }

  await db
    .delete(likes)
    .where(and(eq(likes.targetType, "prompt"), eq(likes.targetId, preset.id)));
  await db
    .delete(downloads)
    .where(
      and(
        eq(downloads.targetType, "prompt"),
        eq(downloads.targetId, preset.id),
      ),
    );
  await db.delete(promptPresets).where(eq(promptPresets.id, preset.id));

  return { success: true };
}

export async function toggleLike(presetUuid: string, userUuid: string) {
  const preset = await db
    .select()
    .from(promptPresets)
    .where(eq(promptPresets.uuid, presetUuid))
    .get();
  if (!preset) {
    throw notFound("提示词预设不存在");
  }
  if (preset.status !== "approved") {
    throw notFound("提示词预设不存在");
  }

  const user = await getUserByUuid(userUuid);
  if (!user) {
    throw notFound("用户不存在");
  }

  return db.transaction(async (tx) => {
    const deleteResult = await tx
      .delete(likes)
      .where(
        and(
          eq(likes.userId, user.id),
          eq(likes.targetType, "prompt"),
          eq(likes.targetId, preset.id),
        ),
      );
    const deleted =
      Number((deleteResult as { rowsAffected?: number }).rowsAffected ?? 0) > 0;

    if (deleted) {
      await tx
        .update(promptPresets)
        .set({
          likeCount: sql`CASE WHEN ${promptPresets.likeCount} > 0 THEN ${promptPresets.likeCount} - 1 ELSE 0 END`,
        })
        .where(eq(promptPresets.id, preset.id));
      return { liked: false };
    }

    const insertResult = await tx
      .insert(likes)
      .values({ userId: user.id, targetType: "prompt", targetId: preset.id })
      .onConflictDoNothing();
    const inserted =
      Number((insertResult as { rowsAffected?: number }).rowsAffected ?? 0) > 0;

    if (inserted) {
      await tx
        .update(promptPresets)
        .set({ likeCount: sql`${promptPresets.likeCount} + 1` })
        .where(eq(promptPresets.id, preset.id));
    }
    return { liked: true };
  });
}

export async function recordDownload(presetUuid: string, userUuid: string) {
  const preset = await db
    .select()
    .from(promptPresets)
    .where(eq(promptPresets.uuid, presetUuid))
    .get();
  if (!preset) {
    throw notFound("提示词预设不存在");
  }
  if (preset.status !== "approved") {
    throw notFound("提示词预设不存在");
  }

  const user = await getUserByUuid(userUuid);
  if (!user) {
    throw notFound("用户不存在");
  }

  await db.transaction(async (tx) => {
    const insertResult = await tx
      .insert(downloads)
      .values({ userId: user.id, targetType: "prompt", targetId: preset.id })
      .onConflictDoNothing();
    const inserted =
      Number((insertResult as { rowsAffected?: number }).rowsAffected ?? 0) > 0;
    if (!inserted) return;

    await tx
      .update(promptPresets)
      .set({ downloadCount: sql`${promptPresets.downloadCount} + 1` })
      .where(eq(promptPresets.id, preset.id));
  });

  return getByUuid(presetUuid, user.id);
}

export async function listMine(authorUuid: string) {
  const author = await getUserByUuid(authorUuid);
  if (!author) {
    throw notFound("用户不存在");
  }

  const items = await db
    .select()
    .from(promptPresets)
    .where(eq(promptPresets.authorId, author.id))
    .orderBy(desc(promptPresets.createdAt));

  return items.map((item) => ({
    uuid: item.uuid,
    name: item.name,
    description: item.description,
    tags: safeJsonArray(item.tags),
    status: item.status,
    rejectReason: item.rejectReason,
    downloadCount: item.downloadCount,
    likeCount: item.likeCount,
    createdAt: item.createdAt,
  }));
}
