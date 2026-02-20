import { FastifyInstance } from "fastify";
import { requireAuth, requireBound } from "../middleware/auth.js";
import * as storyService from "../services/story.service.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

async function getCurrentUserId(userUuid?: string): Promise<number | undefined> {
  if (!userUuid) return undefined;
  const user = await db.select({ id: users.id }).from(users).where(eq(users.uuid, userUuid)).get();
  return user?.id;
}

async function getOptionalUserId(request: { headers: { authorization?: string } }) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return undefined;
  try {
    const { verifyToken } = await import("../utils/jwt.js");
    const payload = await verifyToken(authHeader.slice(7));
    return getCurrentUserId(payload.sub!);
  } catch {
    return undefined;
  }
}

export async function storyRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      sort?: string;
      search?: string;
      genre?: string;
      tags?: string;
    };
  }>("/stories", async (request) => {
    const currentUserId = await getOptionalUserId(request);
    const { page, limit, sort, search, genre, tags } = request.query;
    return storyService.list({
      page: parseInt(page || "1", 10),
      limit: Math.min(parseInt(limit || "20", 10), 50),
      sort: (sort as "newest" | "popular" | "downloads") || "newest",
      search: search || undefined,
      genre: genre || undefined,
      tags: tags ? tags.split(",") : undefined,
      currentUserId,
    });
  });

  app.get("/stories/mine", { preHandler: [requireAuth] }, async (request) => {
    return storyService.listMine(request.user!.sub);
  });

  app.get<{ Params: { uuid: string } }>("/stories/:uuid", async (request) => {
    const currentUserId = await getOptionalUserId(request);
    return storyService.getByUuid(request.params.uuid, currentUserId);
  });

  app.post<{
    Body: {
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
    };
  }>("/stories", { preHandler: [requireBound] }, async (request) => {
    return storyService.create(request.user!.sub, request.body);
  });

  app.put<{ Params: { uuid: string }; Body: Record<string, unknown> }>(
    "/stories/:uuid",
    { preHandler: [requireBound] },
    async (request) => {
      return storyService.update(request.params.uuid, request.user!.sub, request.body);
    }
  );

  app.delete<{ Params: { uuid: string } }>(
    "/stories/:uuid",
    { preHandler: [requireBound] },
    async (request) => {
      return storyService.remove(request.params.uuid, request.user!.sub);
    }
  );

  app.post<{ Params: { uuid: string } }>(
    "/stories/:uuid/like",
    { preHandler: [requireAuth] },
    async (request) => storyService.toggleLike(request.params.uuid, request.user!.sub)
  );

  app.post<{ Params: { uuid: string } }>(
    "/stories/:uuid/download",
    { preHandler: [requireAuth] },
    async (request) => storyService.recordDownload(request.params.uuid, request.user!.sub)
  );
}
