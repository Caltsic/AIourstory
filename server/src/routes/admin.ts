import { desc, eq } from "drizzle-orm";
import { FastifyInstance } from "fastify";

import { config } from "../config.js";
import { db } from "../db/index.js";
import { promptPresets, storySettings, users } from "../db/schema.js";
import { requireAdmin } from "../middleware/auth.js";
import { badRequest, notFound } from "../utils/errors.js";

function safeJsonArray(input: string): string[] {
  try {
    const value = JSON.parse(input);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const adminRateLimitConfig = {
  rateLimit: {
    max: config.rateLimitAdminMax,
    timeWindow: config.rateLimitAdminWindow,
  },
} as const;

export async function adminRoutes(app: FastifyInstance) {
  app.get(
    "/admin/review/prompts",
    { preHandler: [requireAdmin], config: adminRateLimitConfig },
    async () => {
      const items = await db
        .select()
        .from(promptPresets)
        .where(eq(promptPresets.status, "pending"))
        .orderBy(desc(promptPresets.createdAt));

      return Promise.all(
        items.map(async (item) => {
          const author = await db
            .select({ uuid: users.uuid, nickname: users.nickname, username: users.username })
            .from(users)
            .where(eq(users.id, item.authorId))
            .get();
          return {
            uuid: item.uuid,
            name: item.name,
            description: item.description,
            promptsJson: item.promptsJson,
            tags: safeJsonArray(item.tags),
            createdAt: item.createdAt,
            author: author ?? { uuid: "", nickname: "未知", username: null },
          };
        })
      );
    }
  );

  app.get(
    "/admin/review/stories",
    { preHandler: [requireAdmin], config: adminRateLimitConfig },
    async () => {
      const items = await db
        .select()
        .from(storySettings)
        .where(eq(storySettings.status, "pending"))
        .orderBy(desc(storySettings.createdAt));

      return Promise.all(
        items.map(async (item) => {
          const author = await db
            .select({ uuid: users.uuid, nickname: users.nickname, username: users.username })
            .from(users)
            .where(eq(users.id, item.authorId))
            .get();
          return {
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
            createdAt: item.createdAt,
            author: author ?? { uuid: "", nickname: "未知", username: null },
          };
        })
      );
    }
  );

  app.post<{ Params: { type: string; uuid: string } }>(
    "/admin/review/:type/:uuid/approve",
    { preHandler: [requireAdmin], config: adminRateLimitConfig },
    async (request) => {
      const { type, uuid } = request.params;
      const adminUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.uuid, request.user!.sub))
        .get();

      if (type === "prompt") {
        const preset = await db.select().from(promptPresets).where(eq(promptPresets.uuid, uuid)).get();
        if (!preset) throw notFound("提示词预设不存在");
        await db
          .update(promptPresets)
          .set({
            status: "approved",
            reviewedBy: adminUser?.id,
            reviewedAt: new Date().toISOString(),
          })
          .where(eq(promptPresets.id, preset.id));
      } else if (type === "story") {
        const story = await db.select().from(storySettings).where(eq(storySettings.uuid, uuid)).get();
        if (!story) throw notFound("故事设置不存在");
        await db
          .update(storySettings)
          .set({
            status: "approved",
            reviewedBy: adminUser?.id,
            reviewedAt: new Date().toISOString(),
          })
          .where(eq(storySettings.id, story.id));
      } else {
        throw badRequest("无效类型，应为 prompt 或 story");
      }

      return { success: true };
    }
  );

  app.post<{ Params: { type: string; uuid: string }; Body: { reason: string } }>(
    "/admin/review/:type/:uuid/reject",
    { preHandler: [requireAdmin], config: adminRateLimitConfig },
    async (request) => {
      const { type, uuid } = request.params;
      const { reason } = request.body;
      if (!reason) {
        throw badRequest("请提供驳回原因");
      }

      const adminUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.uuid, request.user!.sub))
        .get();

      if (type === "prompt") {
        const preset = await db.select().from(promptPresets).where(eq(promptPresets.uuid, uuid)).get();
        if (!preset) throw notFound("提示词预设不存在");
        await db
          .update(promptPresets)
          .set({
            status: "rejected",
            rejectReason: reason,
            reviewedBy: adminUser?.id,
            reviewedAt: new Date().toISOString(),
          })
          .where(eq(promptPresets.id, preset.id));
      } else if (type === "story") {
        const story = await db.select().from(storySettings).where(eq(storySettings.uuid, uuid)).get();
        if (!story) throw notFound("故事设置不存在");
        await db
          .update(storySettings)
          .set({
            status: "rejected",
            rejectReason: reason,
            reviewedBy: adminUser?.id,
            reviewedAt: new Date().toISOString(),
          })
          .where(eq(storySettings.id, story.id));
      } else {
        throw badRequest("无效类型，应为 prompt 或 story");
      }

      return { success: true };
    }
  );
}
