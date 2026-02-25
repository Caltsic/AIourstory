import { FastifyInstance } from "fastify";
import { requireAuth, requireBound } from "../middleware/auth.js";
import * as promptService from "../services/prompt.service.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const promptCreateBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "promptsJson", "tags"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 50 },
    description: { type: "string", minLength: 0, maxLength: 2000 },
    promptsJson: { type: "string", minLength: 2, maxLength: 200000 },
    tags: {
      type: "array",
      maxItems: 30,
      items: { type: "string", minLength: 1, maxLength: 32 },
    },
  },
} as const;

const promptUpdateBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: "string", minLength: 1, maxLength: 50 },
    description: { type: "string", minLength: 0, maxLength: 2000 },
    promptsJson: { type: "string", minLength: 2, maxLength: 200000 },
    tags: {
      type: "array",
      maxItems: 30,
      items: { type: "string", minLength: 1, maxLength: 32 },
    },
  },
} as const;

const promptListQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    page: { type: "string", pattern: "^[1-9]\\d*$" },
    limit: { type: "string", pattern: "^[1-9]\\d*$" },
    cursor: { type: "string", minLength: 8, maxLength: 256 },
    sort: { type: "string", enum: ["newest", "popular", "downloads"] },
    search: { type: "string", minLength: 1, maxLength: 100 },
    tags: { type: "string", minLength: 1, maxLength: 500 },
  },
} as const;

function parsePositiveInt(input: string | undefined, fallback: number) {
  const parsed = Number.parseInt(input || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function getCurrentUserId(
  userUuid?: string,
): Promise<number | undefined> {
  if (!userUuid) return undefined;
  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.uuid, userUuid))
    .get();
  return user?.id;
}

export async function promptRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      cursor?: string;
      sort?: string;
      search?: string;
      tags?: string;
    };
  }>(
    "/prompts",
    { schema: { querystring: promptListQuerySchema } },
    async (request) => {
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

      const { page, limit, cursor, sort, search, tags } = request.query;
      return promptService.list({
        page: parsePositiveInt(page, 1),
        limit: Math.min(parsePositiveInt(limit, 20), 50),
        cursor: cursor || undefined,
        sort: (sort as "newest" | "popular" | "downloads") || "newest",
        search: search || undefined,
        tags: tags ? tags.split(",") : undefined,
        currentUserId,
      });
    },
  );

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
    Body: {
      name: string;
      description: string;
      promptsJson: string;
      tags: string[];
    };
  }>(
    "/prompts",
    { preHandler: [requireBound], schema: { body: promptCreateBodySchema } },
    async (request) => {
      return promptService.create(request.user!.sub, request.body);
    },
  );

  app.put<{
    Params: { uuid: string };
    Body: {
      name?: string;
      description?: string;
      promptsJson?: string;
      tags?: string[];
    };
  }>(
    "/prompts/:uuid",
    { preHandler: [requireBound], schema: { body: promptUpdateBodySchema } },
    async (request) => {
      return promptService.update(
        request.params.uuid,
        request.user!.sub,
        request.body,
      );
    },
  );

  app.delete<{ Params: { uuid: string } }>(
    "/prompts/:uuid",
    { preHandler: [requireBound] },
    async (request) => {
      return promptService.remove(request.params.uuid, request.user!.sub);
    },
  );

  app.post<{ Params: { uuid: string } }>(
    "/prompts/:uuid/like",
    { preHandler: [requireAuth] },
    async (request) =>
      promptService.toggleLike(request.params.uuid, request.user!.sub),
  );

  app.post<{ Params: { uuid: string } }>(
    "/prompts/:uuid/download",
    { preHandler: [requireAuth] },
    async (request) =>
      promptService.recordDownload(request.params.uuid, request.user!.sub),
  );
}
