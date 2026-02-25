import { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import * as authService from "../services/auth.service.js";

const authRateLimitConfig = {
  rateLimit: {
    max: config.rateLimitAuthMax,
    timeWindow: config.rateLimitAuthWindow,
  },
} as const;

const refreshTokenBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["refreshToken"],
  properties: {
    refreshToken: { type: "string", minLength: 1, maxLength: 4096 },
  },
} as const;

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { deviceId: string } }>(
    "/auth/device-login",
    {
      config: authRateLimitConfig,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["deviceId"],
          properties: {
            deviceId: { type: "string", minLength: 8, maxLength: 256 },
          },
        },
      },
    },
    async (request) => {
      const { deviceId } = request.body;
      return authService.deviceLogin(deviceId);
    },
  );

  app.post<{ Body: { email: string } }>(
    "/auth/send-email-code",
    {
      config: authRateLimitConfig,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["email"],
          properties: {
            email: { type: "string", minLength: 3, maxLength: 254 },
          },
        },
      },
    },
    async (request) => {
      const { email } = request.body;
      return authService.sendEmailCode(email);
    },
  );

  app.post<{ Body: { email: string; code: string; nickname?: string } }>(
    "/auth/register",
    {
      preHandler: [requireAuth],
      config: authRateLimitConfig,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["email", "code"],
          properties: {
            email: { type: "string", minLength: 3, maxLength: 254 },
            code: { type: "string", minLength: 4, maxLength: 10 },
            nickname: { type: "string", minLength: 1, maxLength: 20 },
          },
        },
      },
    },
    async (request) => {
      const { email, code, nickname } = request.body;
      return authService.registerWithEmailCode(
        request.user!.sub,
        email,
        code,
        nickname,
      );
    },
  );

  app.post<{ Body: { email: string; code: string } }>(
    "/auth/login",
    {
      config: authRateLimitConfig,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["email", "code"],
          properties: {
            email: { type: "string", minLength: 3, maxLength: 254 },
            code: { type: "string", minLength: 4, maxLength: 10 },
          },
        },
      },
    },
    async (request) => {
      const { email, code } = request.body;
      return authService.loginWithEmailCode(email, code);
    },
  );

  app.post<{ Body: { username: string; password: string } }>(
    "/auth/password-login",
    {
      config: authRateLimitConfig,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["username", "password"],
          properties: {
            username: { type: "string", minLength: 1, maxLength: 64 },
            password: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request) => {
      const { username, password } = request.body;
      return authService.passwordLogin(username, password);
    },
  );

  app.post<{ Body: { refreshToken: string } }>(
    "/auth/refresh",
    {
      config: authRateLimitConfig,
      schema: { body: refreshTokenBodySchema },
    },
    async (request) => {
      const { refreshToken } = request.body;
      return authService.refresh(refreshToken);
    },
  );

  app.post<{ Body: { refreshToken: string } }>(
    "/auth/logout",
    {
      preHandler: [requireAuth],
      config: authRateLimitConfig,
      schema: { body: refreshTokenBodySchema },
    },
    async (request) => {
      const { refreshToken } = request.body;
      await authService.logout(refreshToken);
      return { success: true };
    },
  );

  app.get("/auth/me", { preHandler: [requireAuth] }, async (request) => {
    return authService.getMe(request.user!.sub);
  });

  app.put<{ Body: { nickname?: string; avatarSeed?: string } }>(
    "/users/me",
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            nickname: { type: "string", minLength: 1, maxLength: 20 },
            avatarSeed: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request) => {
      return authService.updateProfile(request.user!.sub, request.body);
    },
  );
}
