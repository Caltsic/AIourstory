import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";

import { config } from "../config.js";
import { db } from "../db/index.js";
import { promptPresets, storySettings, users } from "../db/schema.js";
import { requireAdmin } from "../middleware/auth.js";
import { badRequest, notFound } from "../utils/errors.js";

type ReviewType = "prompt" | "story";
type ReviewStatus = "pending" | "approved" | "rejected" | "unpublished";

const REVIEW_STATUSES: ReviewStatus[] = [
  "pending",
  "approved",
  "rejected",
  "unpublished",
];

function safeJsonArray(input: string): string[] {
  try {
    const value = JSON.parse(input);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function normalizeReviewStatus(input?: string): ReviewStatus {
  if (!input) return "pending";
  if (REVIEW_STATUSES.includes(input as ReviewStatus)) {
    return input as ReviewStatus;
  }
  throw badRequest("invalid review status");
}

function rowsAffected(result: unknown): number {
  return Number((result as { rowsAffected?: number })?.rowsAffected ?? 0);
}

const adminRateLimitConfig = {
  rateLimit: {
    max: config.rateLimitAdminMax,
    timeWindow: config.rateLimitAdminWindow,
  },
} as const;

const reviewListQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: REVIEW_STATUSES },
    keyword: { type: "string", minLength: 1, maxLength: 100 },
  },
} as const;

const reviewParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "uuid"],
  properties: {
    type: { type: "string", enum: ["prompt", "story"] },
    uuid: { type: "string", minLength: 1, maxLength: 128 },
  },
} as const;

const rejectBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["reason"],
  properties: {
    reason: { type: "string", minLength: 1, maxLength: 500 },
  },
} as const;

const moderateBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reason: { type: "string", minLength: 0, maxLength: 500 },
  },
} as const;

async function findAdminUserId(adminUuid: string) {
  const adminUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.uuid, adminUuid))
    .get();
  return adminUser?.id ?? null;
}

export async function adminRoutes(app: FastifyInstance) {
  app.get(
    "/admin/review/stats",
    { preHandler: [requireAdmin], config: adminRateLimitConfig },
    async () => {
      const promptStats = Object.fromEntries(
        REVIEW_STATUSES.map((status) => [status, 0]),
      ) as Record<ReviewStatus, number>;
      const storyStats = Object.fromEntries(
        REVIEW_STATUSES.map((status) => [status, 0]),
      ) as Record<ReviewStatus, number>;

      const promptRows = await db
        .select({ status: promptPresets.status, count: sql<number>`count(*)` })
        .from(promptPresets)
        .groupBy(promptPresets.status);
      const storyRows = await db
        .select({ status: storySettings.status, count: sql<number>`count(*)` })
        .from(storySettings)
        .groupBy(storySettings.status);

      for (const row of promptRows) {
        const status = row.status as ReviewStatus;
        if (REVIEW_STATUSES.includes(status)) promptStats[status] = row.count;
      }
      for (const row of storyRows) {
        const status = row.status as ReviewStatus;
        if (REVIEW_STATUSES.includes(status)) storyStats[status] = row.count;
      }

      return { prompt: promptStats, story: storyStats };
    },
  );

  app.get<{ Querystring: { status?: string; keyword?: string } }>(
    "/admin/review/prompts",
    {
      preHandler: [requireAdmin],
      config: adminRateLimitConfig,
      schema: { querystring: reviewListQuerySchema },
    },
    async (request) => {
      const status = normalizeReviewStatus(request.query.status);
      const keyword = request.query.keyword?.trim();

      const whereList = [eq(promptPresets.status, status)];
      if (keyword) {
        whereList.push(
          or(
            like(promptPresets.name, `%${keyword}%`),
            like(promptPresets.description, `%${keyword}%`),
          )!,
        );
      }

      const whereClause =
        whereList.length === 1 ? whereList[0] : and(...whereList);
      const items = await db
        .select({
          uuid: promptPresets.uuid,
          name: promptPresets.name,
          description: promptPresets.description,
          promptsJson: promptPresets.promptsJson,
          tags: promptPresets.tags,
          status: promptPresets.status,
          rejectReason: promptPresets.rejectReason,
          reviewedAt: promptPresets.reviewedAt,
          createdAt: promptPresets.createdAt,
          authorUuid: users.uuid,
          authorNickname: users.nickname,
          authorUsername: users.username,
        })
        .from(promptPresets)
        .leftJoin(users, eq(users.id, promptPresets.authorId))
        .where(whereClause)
        .orderBy(desc(promptPresets.createdAt));

      return items.map((item) => ({
        uuid: item.uuid,
        name: item.name,
        description: item.description,
        promptsJson: item.promptsJson,
        tags: safeJsonArray(item.tags),
        status: item.status,
        rejectReason: item.rejectReason,
        reviewedAt: item.reviewedAt,
        createdAt: item.createdAt,
        author: {
          uuid: item.authorUuid ?? "",
          nickname: item.authorNickname ?? "unknown",
          username: item.authorUsername ?? null,
        },
      }));
    },
  );

  app.get<{ Querystring: { status?: string; keyword?: string } }>(
    "/admin/review/stories",
    {
      preHandler: [requireAdmin],
      config: adminRateLimitConfig,
      schema: { querystring: reviewListQuerySchema },
    },
    async (request) => {
      const status = normalizeReviewStatus(request.query.status);
      const keyword = request.query.keyword?.trim();

      const whereList = [eq(storySettings.status, status)];
      if (keyword) {
        whereList.push(
          or(
            like(storySettings.title, `%${keyword}%`),
            like(storySettings.premise, `%${keyword}%`),
            like(storySettings.protagonistName, `%${keyword}%`),
          )!,
        );
      }

      const whereClause =
        whereList.length === 1 ? whereList[0] : and(...whereList);
      const items = await db
        .select({
          uuid: storySettings.uuid,
          title: storySettings.title,
          premise: storySettings.premise,
          genre: storySettings.genre,
          protagonistName: storySettings.protagonistName,
          protagonistDescription: storySettings.protagonistDescription,
          protagonistAppearance: storySettings.protagonistAppearance,
          difficulty: storySettings.difficulty,
          initialPacing: storySettings.initialPacing,
          extraDescription: storySettings.extraDescription,
          tags: storySettings.tags,
          status: storySettings.status,
          rejectReason: storySettings.rejectReason,
          reviewedAt: storySettings.reviewedAt,
          createdAt: storySettings.createdAt,
          authorUuid: users.uuid,
          authorNickname: users.nickname,
          authorUsername: users.username,
        })
        .from(storySettings)
        .leftJoin(users, eq(users.id, storySettings.authorId))
        .where(whereClause)
        .orderBy(desc(storySettings.createdAt));

      return items.map((item) => ({
        uuid: item.uuid,
        title: item.title,
        premise: item.premise,
        genre: item.genre,
        protagonistName: item.protagonistName,
        protagonistDescription: item.protagonistDescription,
        protagonistAppearance: item.protagonistAppearance,
        difficulty: item.difficulty,
        initialPacing: item.initialPacing,
        extraDescription: item.extraDescription,
        tags: safeJsonArray(item.tags),
        status: item.status,
        rejectReason: item.rejectReason,
        reviewedAt: item.reviewedAt,
        createdAt: item.createdAt,
        author: {
          uuid: item.authorUuid ?? "",
          nickname: item.authorNickname ?? "unknown",
          username: item.authorUsername ?? null,
        },
      }));
    },
  );

  app.post<{ Params: { type: ReviewType; uuid: string } }>(
    "/admin/review/:type/:uuid/approve",
    {
      preHandler: [requireAdmin],
      config: adminRateLimitConfig,
      schema: { params: reviewParamsSchema },
    },
    async (request) => {
      const { type, uuid } = request.params;
      const adminUserId = await findAdminUserId(request.user!.sub);
      const reviewTime = new Date().toISOString();

      if (type === "prompt") {
        const preset = await db
          .select()
          .from(promptPresets)
          .where(eq(promptPresets.uuid, uuid))
          .get();
        if (!preset) throw notFound("prompt preset not found");
        await db
          .update(promptPresets)
          .set({
            status: "approved",
            rejectReason: null,
            reviewedBy: adminUserId,
            reviewedAt: reviewTime,
          })
          .where(eq(promptPresets.id, preset.id));
      } else if (type === "story") {
        const story = await db
          .select()
          .from(storySettings)
          .where(eq(storySettings.uuid, uuid))
          .get();
        if (!story) throw notFound("story setting not found");
        await db
          .update(storySettings)
          .set({
            status: "approved",
            rejectReason: null,
            reviewedBy: adminUserId,
            reviewedAt: reviewTime,
          })
          .where(eq(storySettings.id, story.id));
      } else {
        throw badRequest("invalid review type");
      }

      return { success: true, status: "approved" as const };
    },
  );

  app.post<{
    Params: { type: ReviewType; uuid: string };
    Body: { reason: string };
  }>(
    "/admin/review/:type/:uuid/reject",
    {
      preHandler: [requireAdmin],
      config: adminRateLimitConfig,
      schema: { params: reviewParamsSchema, body: rejectBodySchema },
    },
    async (request) => {
      const { type, uuid } = request.params;
      const reason = request.body.reason.trim();
      if (!reason) {
        throw badRequest("reject reason is required");
      }

      const adminUserId = await findAdminUserId(request.user!.sub);
      const reviewTime = new Date().toISOString();

      if (type === "prompt") {
        const preset = await db
          .select()
          .from(promptPresets)
          .where(eq(promptPresets.uuid, uuid))
          .get();
        if (!preset) throw notFound("prompt preset not found");
        await db
          .update(promptPresets)
          .set({
            status: "rejected",
            rejectReason: reason,
            reviewedBy: adminUserId,
            reviewedAt: reviewTime,
          })
          .where(eq(promptPresets.id, preset.id));
      } else if (type === "story") {
        const story = await db
          .select()
          .from(storySettings)
          .where(eq(storySettings.uuid, uuid))
          .get();
        if (!story) throw notFound("story setting not found");
        await db
          .update(storySettings)
          .set({
            status: "rejected",
            rejectReason: reason,
            reviewedBy: adminUserId,
            reviewedAt: reviewTime,
          })
          .where(eq(storySettings.id, story.id));
      } else {
        throw badRequest("invalid review type");
      }

      return { success: true, status: "rejected" as const };
    },
  );

  app.post<{
    Params: { type: ReviewType; uuid: string };
    Body: { reason?: string };
  }>(
    "/admin/review/:type/:uuid/unpublish",
    {
      preHandler: [requireAdmin],
      config: adminRateLimitConfig,
      schema: { params: reviewParamsSchema, body: moderateBodySchema },
    },
    async (request) => {
      const { type, uuid } = request.params;
      const reason =
        request.body.reason?.trim() || "manually unpublished by admin";
      const adminUserId = await findAdminUserId(request.user!.sub);
      const reviewTime = new Date().toISOString();

      if (type === "prompt") {
        const preset = await db
          .select()
          .from(promptPresets)
          .where(eq(promptPresets.uuid, uuid))
          .get();
        if (!preset) throw notFound("prompt preset not found");
        if (preset.status !== "approved") {
          throw badRequest("only approved content can be unpublished");
        }

        const result = await db
          .update(promptPresets)
          .set({
            status: "unpublished",
            rejectReason: reason,
            reviewedBy: adminUserId,
            reviewedAt: reviewTime,
          })
          .where(
            and(
              eq(promptPresets.id, preset.id),
              eq(promptPresets.status, "approved"),
            ),
          );
        if (rowsAffected(result) === 0) {
          throw badRequest("content status changed, please refresh and retry");
        }
      } else if (type === "story") {
        const story = await db
          .select()
          .from(storySettings)
          .where(eq(storySettings.uuid, uuid))
          .get();
        if (!story) throw notFound("story setting not found");
        if (story.status !== "approved") {
          throw badRequest("only approved content can be unpublished");
        }

        const result = await db
          .update(storySettings)
          .set({
            status: "unpublished",
            rejectReason: reason,
            reviewedBy: adminUserId,
            reviewedAt: reviewTime,
          })
          .where(
            and(
              eq(storySettings.id, story.id),
              eq(storySettings.status, "approved"),
            ),
          );
        if (rowsAffected(result) === 0) {
          throw badRequest("content status changed, please refresh and retry");
        }
      } else {
        throw badRequest("invalid review type");
      }

      return { success: true, status: "unpublished" as const };
    },
  );

  app.post<{ Params: { type: ReviewType; uuid: string } }>(
    "/admin/review/:type/:uuid/restore",
    {
      preHandler: [requireAdmin],
      config: adminRateLimitConfig,
      schema: { params: reviewParamsSchema },
    },
    async (request) => {
      const { type, uuid } = request.params;
      const adminUserId = await findAdminUserId(request.user!.sub);
      const reviewTime = new Date().toISOString();

      if (type === "prompt") {
        const preset = await db
          .select()
          .from(promptPresets)
          .where(eq(promptPresets.uuid, uuid))
          .get();
        if (!preset) throw notFound("prompt preset not found");
        if (!["rejected", "unpublished"].includes(preset.status)) {
          throw badRequest("only rejected/unpublished content can be restored");
        }

        const result = await db
          .update(promptPresets)
          .set({
            status: "approved",
            rejectReason: null,
            reviewedBy: adminUserId,
            reviewedAt: reviewTime,
          })
          .where(
            and(
              eq(promptPresets.id, preset.id),
              or(
                eq(promptPresets.status, "rejected"),
                eq(promptPresets.status, "unpublished"),
              )!,
            ),
          );
        if (rowsAffected(result) === 0) {
          throw badRequest("content status changed, please refresh and retry");
        }
      } else if (type === "story") {
        const story = await db
          .select()
          .from(storySettings)
          .where(eq(storySettings.uuid, uuid))
          .get();
        if (!story) throw notFound("story setting not found");
        if (!["rejected", "unpublished"].includes(story.status)) {
          throw badRequest("only rejected/unpublished content can be restored");
        }

        const result = await db
          .update(storySettings)
          .set({
            status: "approved",
            rejectReason: null,
            reviewedBy: adminUserId,
            reviewedAt: reviewTime,
          })
          .where(
            and(
              eq(storySettings.id, story.id),
              or(
                eq(storySettings.status, "rejected"),
                eq(storySettings.status, "unpublished"),
              )!,
            ),
          );
        if (rowsAffected(result) === 0) {
          throw badRequest("content status changed, please refresh and retry");
        }
      } else {
        throw badRequest("invalid review type");
      }

      return { success: true, status: "approved" as const };
    },
  );
}
