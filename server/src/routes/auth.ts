import { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import * as authService from "../services/auth.service.js";

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/device-login
  app.post<{ Body: { deviceId: string } }>(
    "/auth/device-login",
    {
      config: {
        rateLimit: {
          max: config.rateLimitAuthMax,
          timeWindow: config.rateLimitAuthWindow,
        },
      },
    },
    async (request) => {
      const { deviceId } = request.body;
      return authService.deviceLogin(deviceId);
    }
  );

  // POST /auth/register (bind username + password)
  app.post<{ Body: { username: string; password: string; nickname?: string } }>(
    "/auth/register",
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: config.rateLimitAuthMax,
          timeWindow: config.rateLimitAuthWindow,
        },
      },
    },
    async (request) => {
      const { username, password, nickname } = request.body;
      return authService.register(request.user!.sub, username, password, nickname);
    }
  );

  // POST /auth/login
  app.post<{ Body: { username: string; password: string } }>(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: config.rateLimitAuthMax,
          timeWindow: config.rateLimitAuthWindow,
        },
      },
    },
    async (request) => {
      const { username, password } = request.body;
      return authService.login(username, password);
    }
  );

  // POST /auth/refresh
  app.post<{ Body: { refreshToken: string } }>(
    "/auth/refresh",
    {
      config: {
        rateLimit: {
          max: config.rateLimitAuthMax,
          timeWindow: config.rateLimitAuthWindow,
        },
      },
    },
    async (request) => {
      const { refreshToken } = request.body;
      return authService.refresh(refreshToken);
    }
  );

  // POST /auth/logout
  app.post<{ Body: { refreshToken: string } }>(
    "/auth/logout",
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: config.rateLimitAuthMax,
          timeWindow: config.rateLimitAuthWindow,
        },
      },
    },
    async (request) => {
      const { refreshToken } = request.body;
      await authService.logout(refreshToken);
      return { success: true };
    }
  );

  // GET /auth/me
  app.get("/auth/me", { preHandler: [requireAuth] }, async (request) => {
    return authService.getMe(request.user!.sub);
  });

  // PUT /users/me
  app.put<{ Body: { nickname?: string; avatarSeed?: string } }>(
    "/users/me",
    { preHandler: [requireAuth] },
    async (request) => {
      return authService.updateProfile(request.user!.sub, request.body);
    }
  );
}
