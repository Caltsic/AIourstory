import { randomUUID, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, refreshTokens } from "../db/schema.js";
import { signAccessToken, signRefreshToken, verifyToken } from "../utils/jwt.js";
import { badRequest, unauthorized, conflict, notFound } from "../utils/errors.js";
import { config } from "../config.js";

const BCRYPT_ROUNDS = 10;

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    bcrypt.hash(password, BCRYPT_ROUNDS, (err, hash) => {
      if (err || !hash) {
        reject(err ?? new Error("Password hash failed"));
        return;
      }
      resolve(hash);
    });
  });
}

function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    bcrypt.compare(password, hash, (err, ok) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(Boolean(ok));
    });
  });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createTokenPair(user: { uuid: string; role: string; isBound: boolean }) {
  return Promise.all([
    signAccessToken({ sub: user.uuid, role: user.role, isBound: user.isBound }),
    signRefreshToken({ sub: user.uuid }),
  ]);
}

async function saveRefreshToken(userId: number, token: string) {
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt });
}

function formatUser(user: typeof users.$inferSelect) {
  return {
    uuid: user.uuid,
    username: user.username,
    nickname: user.nickname,
    avatarSeed: user.avatarSeed,
    role: user.role,
    isBound: user.isBound,
    createdAt: user.createdAt,
  };
}

export async function deviceLogin(deviceId: string) {
  if (!deviceId || deviceId.length < 8) {
    throw badRequest("设备ID无效");
  }

  let user = await db.select().from(users).where(eq(users.deviceId, deviceId)).get();

  if (!user) {
    const uuid = randomUUID();
    await db.insert(users).values({
      uuid,
      deviceId,
      nickname: "匿名玩家",
      avatarSeed: uuid.slice(0, 8),
    });
    user = await db.select().from(users).where(eq(users.uuid, uuid)).get();
  }

  if (!user) {
    throw notFound("用户不存在");
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(users.id, user.id));

  const [accessToken, refreshToken] = await createTokenPair(user);
  await saveRefreshToken(user.id, refreshToken);

  return { accessToken, refreshToken, user: formatUser(user) };
}

export async function register(
  userUuid: string,
  username: string,
  password: string,
  nickname?: string
) {
  if (!username || username.length < 2 || username.length > 20) {
    throw badRequest("用户名长度应为2-20个字符");
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fff]+$/.test(username)) {
    throw badRequest("用户名只能包含字母、数字、下划线和中文");
  }
  if (!password || password.length < 6 || password.length > 64) {
    throw badRequest("密码长度应为6-64个字符");
  }

  const user = await db.select().from(users).where(eq(users.uuid, userUuid)).get();
  if (!user) {
    throw notFound("用户不存在");
  }
  if (user.isBound) {
    throw conflict("账号已绑定");
  }

  const existing = await db.select().from(users).where(eq(users.username, username)).get();
  if (existing) {
    throw conflict("用户名已被占用");
  }

  const passwordHash = await hashPassword(password);
  const role: "user" | "admin" = config.adminUsernames.includes(username) ? "admin" : "user";

  await db
    .update(users)
    .set({
      username,
      passwordHash,
      nickname: nickname || username,
      isBound: true,
      role,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id));

  const updatedUser = await db.select().from(users).where(eq(users.id, user.id)).get();
  if (!updatedUser) {
    throw notFound("用户不存在");
  }

  const [accessToken, refreshToken] = await createTokenPair(updatedUser);
  await saveRefreshToken(updatedUser.id, refreshToken);

  return { accessToken, refreshToken, user: formatUser(updatedUser) };
}

export async function login(username: string, password: string) {
  if (!username || !password) {
    throw badRequest("用户名和密码不能为空");
  }

  const user = await db.select().from(users).where(eq(users.username, username)).get();
  if (!user || !user.passwordHash) {
    throw unauthorized("用户名或密码错误");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw unauthorized("用户名或密码错误");
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(users.id, user.id));

  const [accessToken, refreshToken] = await createTokenPair(user);
  await saveRefreshToken(user.id, refreshToken);

  return { accessToken, refreshToken, user: formatUser(user) };
}

export async function refresh(token: string) {
  let payload: Awaited<ReturnType<typeof verifyToken>>;
  try {
    payload = await verifyToken(token);
  } catch {
    throw unauthorized("刷新令牌无效或已过期");
  }

  const tokenHash = hashToken(token);
  const stored = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .get();

  if (!stored) {
    throw unauthorized("刷新令牌已失效");
  }

  await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

  const user = await db.select().from(users).where(eq(users.uuid, payload.sub!)).get();
  if (!user) {
    throw unauthorized("用户不存在");
  }

  const [accessToken, refreshToken] = await createTokenPair(user);
  await saveRefreshToken(user.id, refreshToken);

  return { accessToken, refreshToken, user: formatUser(user) };
}

export async function logout(token: string) {
  const tokenHash = hashToken(token);
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
}

export async function getMe(userUuid: string) {
  const user = await db.select().from(users).where(eq(users.uuid, userUuid)).get();
  if (!user) {
    throw notFound("用户不存在");
  }
  return formatUser(user);
}

export async function updateProfile(
  userUuid: string,
  data: { nickname?: string; avatarSeed?: string }
) {
  const user = await db.select().from(users).where(eq(users.uuid, userUuid)).get();
  if (!user) {
    throw notFound("用户不存在");
  }

  const updates: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (data.nickname !== undefined) {
    if (data.nickname.length < 1 || data.nickname.length > 20) {
      throw badRequest("昵称长度应为1-20个字符");
    }
    updates.nickname = data.nickname;
  }
  if (data.avatarSeed !== undefined) {
    updates.avatarSeed = data.avatarSeed;
  }

  await db.update(users).set(updates).where(eq(users.id, user.id));
  const updatedUser = await db.select().from(users).where(eq(users.id, user.id)).get();
  if (!updatedUser) {
    throw notFound("用户不存在");
  }
  return formatUser(updatedUser);
}
