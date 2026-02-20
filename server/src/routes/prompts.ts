import { FastifyInstance } from "fastify";
import { requireAuth, requireBound } from "../middleware/auth.js";
import * as promptService from "../services/prompt.service.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

async function getCurrentUserId(userUuid?: string): Promise<number | undefined> {
  if (!userUuid) return undefined;
  const user = await db.select({ id: users.id }).from(users).where(eq(users.uuid, userUuid)).get();
  return user?.id;
}

export async function promptRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      sort?: string;
      search?: string;
      tags?: string;
    };
  }>("/prompts", async (request) => {
    let currentUserId: number | undefined;
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const { verifyToken } = await import("../utils/jwt.js");
        const payload = await verifyToken(authHeader.slice(7));
        currentUserId = await getCurrentUserId(payload.sub!);
      } catch {
        currentUserId = undefined;
      }
    }

    const { page, limit, sort, search, tags } = request.query;
    return promptService.list({
      page: parseInt(page || "1", 10),
      limit: Math.min(parseInt(limit || "20", 10), 50),
      sort: (sort as "newest" | "popular" | "downloads") || "newest",
      search: search || undefined,
      tags: tags ? tags.split(",") : undefined,
      currentUserId,
    });
  });

  app.get("/prompts/mine", { preHandler: [requireAuth] }, async (request) => {
    return promptService.listMine(request.user!.sub);
  });

  app.get<{ Params: { uuid: string } }>("/prompts/:uuid", async (request) => {
    let currentUserId: number | undefined;
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const { verifyToken } = await import("../utils/jwt.js");
        const payload = await verifyToken(authHeader.slice(7));
        currentUserId = await getCurrentUserId(payload.sub!);
      } catch {
        currentUserId = undefined;
      }
    }
    return promptService.getByUuid(request.params.uuid, currentUserId);
  });

  app.post<{
    Body: { name: string; description: string; promptsJson: string; tags: string[] };
  }>("/prompts", { preHandler: [requireBound] }, async (request) => {
    return promptService.create(request.user!.sub, request.body);
  });

  app.put<{
    Params: { uuid: string };
    Body: { name?: string; description?: string; promptsJson?: string; tags?: string[] };
  }>("/prompts/:uuid", { preHandler: [requireBound] }, async (request) => {
    return promptService.update(request.params.uuid, request.user!.sub, request.body);
  });

  app.delete<{ Params: { uuid: string } }>(
    "/prompts/:uuid",
    { preHandler: [requireBound] },
    async (request) => {
      return promptService.remove(request.params.uuid, request.user!.sub);
    }
  );

  app.post<{ Params: { uuid: string } }>(
    "/prompts/:uuid/like",
    { preHandler: [requireAuth] },
    async (request) => promptService.toggleLike(request.params.uuid, request.user!.sub)
  );

  app.post<{ Params: { uuid: string } }>(
    "/prompts/:uuid/download",
    { preHandler: [requireAuth] },
    async (request) => promptService.recordDownload(request.params.uuid, request.user!.sub)
  );
}
