import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { FastifyInstance } from "fastify";

import { db } from "../db/index.js";
import {
  contentReports,
  promptPresets,
  storySettings,
  users,
} from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";

const reportBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["targetType", "targetUuid", "reasonType"],
  properties: {
    targetType: { type: "string", enum: ["prompt", "story"] },
    targetUuid: { type: "string", minLength: 8, maxLength: 128 },
    reasonType: {
      type: "string",
      enum: ["illegal", "sexual", "abuse", "spam", "other"],
    },
    reasonText: { type: "string", minLength: 0, maxLength: 500 },
  },
} as const;

type ReportBody = {
  targetType: "prompt" | "story";
  targetUuid: string;
  reasonType: "illegal" | "sexual" | "abuse" | "spam" | "other";
  reasonText?: string;
};

function isDuplicateReportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /unique/i.test(message) &&
    message.includes("idx_content_reports_unique_user_target")
  );
}

async function findUserIdByUuid(userUuid: string) {
  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.uuid, userUuid))
    .get();
  return user?.id;
}

async function assertTargetExists(
  targetType: "prompt" | "story",
  targetUuid: string,
) {
  if (targetType === "prompt") {
    const target = await db
      .select({ id: promptPresets.id })
      .from(promptPresets)
      .where(
        and(
          eq(promptPresets.uuid, targetUuid),
          eq(promptPresets.status, "approved"),
        ),
      )
      .get();
    if (!target) throw notFound("内容不存在或不可举报");
    return;
  }

  const target = await db
    .select({ id: storySettings.id })
    .from(storySettings)
    .where(
      and(
        eq(storySettings.uuid, targetUuid),
        eq(storySettings.status, "approved"),
      ),
    )
    .get();
  if (!target) throw notFound("内容不存在或不可举报");
}

export async function reportRoutes(app: FastifyInstance) {
  app.post<{ Body: ReportBody }>(
    "/reports",
    { preHandler: [requireAuth], schema: { body: reportBodySchema } },
    async (request) => {
      const userUuid = request.user?.sub;
      if (!userUuid) throw badRequest("未找到用户信息");

      const reporterId = await findUserIdByUuid(userUuid);
      if (!reporterId) throw badRequest("未找到用户信息");

      const targetType = request.body.targetType;
      const targetUuid = request.body.targetUuid.trim();
      const reasonText = request.body.reasonText?.trim() || "";

      await assertTargetExists(targetType, targetUuid);

      try {
        const reportUuid = randomUUID();
        await db.insert(contentReports).values({
          uuid: reportUuid,
          reporterId,
          targetType,
          targetUuid,
          reasonType: request.body.reasonType,
          reasonText,
        });

        return { success: true, uuid: reportUuid };
      } catch (error) {
        if (isDuplicateReportError(error)) {
          throw conflict("你已举报过该内容，请勿重复提交");
        }
        throw error;
      }
    },
  );
}
