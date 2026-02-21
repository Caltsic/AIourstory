import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";

import { config } from "./config.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { promptRoutes } from "./routes/prompts.js";
import { storyRoutes } from "./routes/stories.js";
import { AppError } from "./utils/errors.js";

const app = Fastify({
  trustProxy: config.trustProxy,
  bodyLimit: 1024 * 1024,
  logger: {
    level: "info",
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
});

await app.register(cors, {
  origin: config.corsOrigins,
  credentials: true,
});

await app.register(helmet, {
  global: true,
  contentSecurityPolicy: false,
});

await app.register(rateLimit, {
  max: config.rateLimitGlobalMax,
  timeWindow: config.rateLimitGlobalWindow,
});

app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({ error: error.message });
    return;
  }

  if ((error as { validation?: unknown }).validation) {
    reply.status(400).send({ error: "请求参数无效", details: (error as Error).message });
    return;
  }

  if ((error as { statusCode?: number }).statusCode === 429) {
    reply.status(429).send({ error: "请求过于频繁，请稍后再试" });
    return;
  }

  request.log.error(error);
  reply.status(500).send({ error: "服务器内部错误" });
});

app.get("/health", async () => ({
  status: "ok",
  uptime: process.uptime(),
  memory: process.memoryUsage(),
  timestamp: new Date().toISOString(),
}));

await app.register(
  async (instance) => {
    await instance.register(authRoutes);
    await instance.register(promptRoutes);
    await instance.register(storyRoutes);
    await instance.register(adminRoutes);
  },
  { prefix: "/v1" }
);

try {
  await app.listen({ port: config.port, host: config.host });
  console.log(`Server running at http://${config.host}:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
