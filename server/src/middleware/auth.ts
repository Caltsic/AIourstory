import { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken, JwtPayload } from "../utils/jwt.js";
import { unauthorized, forbidden } from "../utils/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw unauthorized("缺少认证令牌");
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token);
    request.user = {
      sub: payload.sub!,
      role: payload.role,
      isBound: payload.isBound,
    };
  } catch {
    throw unauthorized("认证令牌无效或已过期");
  }
}

export async function requireBound(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (!request.user?.isBound) {
    throw forbidden("请先绑定账号（设置用户名和密码）后再进行此操作");
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (request.user?.role !== "admin") {
    throw forbidden("需要管理员权限");
  }
}
