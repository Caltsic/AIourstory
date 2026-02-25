import { randomInt, randomUUID, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { config } from "../config.js";
import { db } from "../db/index.js";
import { emailVerificationCodes, refreshTokens, users } from "../db/schema.js";
import {
  badRequest,
  conflict,
  notFound,
  unauthorized,
} from "../utils/errors.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from "../utils/jwt.js";
import { sendEmail } from "../utils/mailer.js";

const BCRYPT_ROUNDS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUsersUniqueConflict(
  error: unknown,
  field: "username" | "email",
): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /unique/i.test(message) &&
    (message.includes(`users.${field}`) ||
      message.includes(`users_${field}_unique`))
  );
}

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(normalized) || normalized.length > 254) {
    throw badRequest("邮箱格式无效");
  }
  return normalized;
}

function generateEmailCode() {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

function hashEmailCode(email: string, code: string): string {
  return createHash("sha256")
    .update(`${config.emailCodeSecret}:${normalizeEmail(email)}:${code}`)
    .digest("hex");
}

function createTokenPair(user: {
  uuid: string;
  role: string;
  isBound: boolean;
}) {
  return Promise.all([
    signAccessToken({ sub: user.uuid, role: user.role, isBound: user.isBound }),
    signRefreshToken({ sub: user.uuid }),
  ]);
}

async function saveRefreshToken(userId: number, token: string) {
  const tokenHash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt });
}

function formatUser(user: typeof users.$inferSelect) {
  return {
    uuid: user.uuid,
    email: user.email,
    username: user.username,
    nickname: user.nickname,
    avatarSeed: user.avatarSeed,
    role: user.role,
    isBound: user.isBound,
    createdAt: user.createdAt,
  };
}

async function consumeEmailCode(email: string, code: string) {
  const normalizedEmail = validateEmail(email);
  const latest = await db
    .select()
    .from(emailVerificationCodes)
    .where(
      and(
        eq(emailVerificationCodes.email, normalizedEmail),
        isNull(emailVerificationCodes.consumedAt),
      ),
    )
    .orderBy(desc(emailVerificationCodes.createdAt))
    .get();

  if (!latest) {
    throw unauthorized("验证码错误或已过期");
  }

  const now = Date.now();
  const expiresAt = Date.parse(latest.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt < now) {
    throw unauthorized("验证码错误或已过期");
  }

  if (latest.attempts >= config.emailCodeMaxAttempts) {
    throw unauthorized("验证码输入次数过多，请重新获取");
  }

  const expectedHash = hashEmailCode(normalizedEmail, code.trim());
  if (expectedHash !== latest.codeHash) {
    await db
      .update(emailVerificationCodes)
      .set({ attempts: latest.attempts + 1 })
      .where(eq(emailVerificationCodes.id, latest.id));
    throw unauthorized("验证码错误或已过期");
  }

  await db
    .update(emailVerificationCodes)
    .set({ consumedAt: new Date().toISOString() })
    .where(eq(emailVerificationCodes.id, latest.id));

  return normalizedEmail;
}

function validatePassword(password: string) {
  const value = password.trim();
  if (value.length < 6 || value.length > 64) {
    throw badRequest("密码长度应为6-64个字符");
  }
  return value;
}

type EmailCodePurpose = "register" | "reset";

async function consumeEmailCodeByPurpose(
  email: string,
  code: string,
  purpose: EmailCodePurpose,
) {
  const normalizedEmail = validateEmail(email);
  const latest = await db
    .select()
    .from(emailVerificationCodes)
    .where(
      and(
        eq(emailVerificationCodes.email, normalizedEmail),
        eq(emailVerificationCodes.purpose, purpose),
        isNull(emailVerificationCodes.consumedAt),
      ),
    )
    .orderBy(desc(emailVerificationCodes.createdAt))
    .get();

  if (!latest) {
    throw unauthorized("验证码错误或已过期");
  }

  const now = Date.now();
  const expiresAt = Date.parse(latest.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt < now) {
    throw unauthorized("验证码错误或已过期");
  }

  if (latest.attempts >= config.emailCodeMaxAttempts) {
    throw unauthorized("验证码输入次数过多，请重新获取");
  }

  const expectedHash = hashEmailCode(normalizedEmail, code.trim());
  if (expectedHash !== latest.codeHash) {
    await db
      .update(emailVerificationCodes)
      .set({ attempts: latest.attempts + 1 })
      .where(eq(emailVerificationCodes.id, latest.id));
    throw unauthorized("验证码错误或已过期");
  }

  await db
    .update(emailVerificationCodes)
    .set({ consumedAt: new Date().toISOString() })
    .where(eq(emailVerificationCodes.id, latest.id));

  return normalizedEmail;
}

export async function sendEmailCode(
  email: string,
  purpose: EmailCodePurpose = "register",
) {
  const normalizedEmail = validateEmail(email);
  const now = Date.now();

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .get();

  if (purpose === "register" && existingUser?.isBound) {
    throw conflict("邮箱已注册");
  }
  if (purpose === "reset" && (!existingUser || !existingUser.isBound)) {
    throw notFound("邮箱未注册");
  }

  const latestCode = await db
    .select()
    .from(emailVerificationCodes)
    .where(
      and(
        eq(emailVerificationCodes.email, normalizedEmail),
        eq(emailVerificationCodes.purpose, purpose),
      ),
    )
    .orderBy(desc(emailVerificationCodes.createdAt))
    .get();

  if (latestCode) {
    const delta = now - Date.parse(latestCode.createdAt);
    if (
      Number.isFinite(delta) &&
      delta < config.emailCodeCooldownSeconds * 1000
    ) {
      const waitSeconds = Math.ceil(
        (config.emailCodeCooldownSeconds * 1000 - delta) / 1000,
      );
      throw badRequest(`发送过于频繁，请在 ${waitSeconds} 秒后重试`);
    }
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dailyCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(emailVerificationCodes)
    .where(
      and(
        eq(emailVerificationCodes.email, normalizedEmail),
        gte(emailVerificationCodes.createdAt, startOfDay.toISOString()),
      ),
    )
    .get();

  if ((dailyCount?.count ?? 0) >= config.emailCodeDailyLimit) {
    throw badRequest("今日验证码发送次数已达上限，请明日再试");
  }

  const code = generateEmailCode();
  const expiresAt = new Date(
    now + config.emailCodeTtlSeconds * 1000,
  ).toISOString();

  await db.insert(emailVerificationCodes).values({
    email: normalizedEmail,
    codeHash: hashEmailCode(normalizedEmail, code),
    purpose,
    expiresAt,
  });

  await sendEmail({
    to: normalizedEmail,
    subject: "AIourStory 验证码",
    text: `您的验证码是 ${code}，${Math.floor(config.emailCodeTtlSeconds / 60)} 分钟内有效。请勿泄露给他人。`,
  });

  return {
    success: true,
    cooldownSeconds: config.emailCodeCooldownSeconds,
    ttlSeconds: config.emailCodeTtlSeconds,
  };
}

export async function deviceLogin(deviceId: string) {
  if (!deviceId || deviceId.length < 8) {
    throw badRequest("设备ID无效");
  }

  let user = await db
    .select()
    .from(users)
    .where(eq(users.deviceId, deviceId))
    .get();

  if (user?.isBound) {
    await db
      .update(users)
      .set({
        deviceId: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));
    user = undefined;
  }

  if (!user) {
    user = await db
      .select()
      .from(users)
      .where(and(eq(users.deviceId, deviceId), eq(users.isBound, false)))
      .get();
  }

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

export async function registerWithEmailCode(
  userUuid: string,
  email: string,
  password: string,
  code: string,
  nickname?: string,
) {
  const normalizedEmail = await consumeEmailCodeByPurpose(
    email,
    code,
    "register",
  );
  const finalPassword = validatePassword(password);
  const user = await db
    .select()
    .from(users)
    .where(eq(users.uuid, userUuid))
    .get();
  if (!user) {
    throw notFound("用户不存在");
  }
  if (user.isBound) {
    throw conflict("账号已绑定");
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .get();
  if (existing && existing.id !== user.id) {
    throw conflict("邮箱已被占用");
  }

  const passwordHash = await hashPassword(finalPassword);

  try {
    await db
      .update(users)
      .set({
        email: normalizedEmail,
        username: null,
        passwordHash,
        nickname: nickname || user.nickname,
        deviceId: null,
        isBound: true,
        role: "user",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));
  } catch (error) {
    if (isUsersUniqueConflict(error, "email")) {
      throw conflict("邮箱已被占用");
    }
    throw error;
  }

  const updatedUser = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .get();
  if (!updatedUser) {
    throw notFound("用户不存在");
  }

  const [accessToken, refreshToken] = await createTokenPair(updatedUser);
  await saveRefreshToken(updatedUser.id, refreshToken);

  return { accessToken, refreshToken, user: formatUser(updatedUser) };
}

export async function loginWithEmailPassword(email: string, password: string) {
  const normalizedEmail = validateEmail(email);
  const finalPassword = validatePassword(password);
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .get();

  if (!user || !user.isBound) {
    throw unauthorized("邮箱未注册");
  }

  if (!user.passwordHash) {
    throw unauthorized("该账号尚未设置密码");
  }

  const valid = await verifyPassword(finalPassword, user.passwordHash);
  if (!valid) {
    throw unauthorized("邮箱或密码错误");
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(users.id, user.id));

  const [accessToken, refreshToken] = await createTokenPair(user);
  await saveRefreshToken(user.id, refreshToken);

  return { accessToken, refreshToken, user: formatUser(user) };
}

export async function resetPasswordWithEmailCode(
  email: string,
  code: string,
  newPassword: string,
) {
  const normalizedEmail = await consumeEmailCodeByPurpose(email, code, "reset");
  const finalPassword = validatePassword(newPassword);
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .get();

  if (!user || !user.isBound) {
    throw notFound("邮箱未注册");
  }

  const passwordHash = await hashPassword(finalPassword);
  await db
    .update(users)
    .set({
      passwordHash,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id));

  return { success: true };
}

export async function passwordLogin(username: string, password: string) {
  if (!username || !password) {
    throw badRequest("用户名和密码不能为空");
  }

  const user = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .get();
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

  const user = await db
    .select()
    .from(users)
    .where(eq(users.uuid, payload.sub!))
    .get();
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
  const user = await db
    .select()
    .from(users)
    .where(eq(users.uuid, userUuid))
    .get();
  if (!user) {
    throw notFound("用户不存在");
  }
  return formatUser(user);
}

export async function updateProfile(
  userUuid: string,
  data: { nickname?: string; avatarSeed?: string },
) {
  const user = await db
    .select()
    .from(users)
    .where(eq(users.uuid, userUuid))
    .get();
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
  const updatedUser = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .get();
  if (!updatedUser) {
    throw notFound("用户不存在");
  }
  return formatUser(updatedUser);
}

// Keep this export for compatibility with existing role script/admin bootstrap data.
export async function register(
  userUuid: string,
  username: string,
  password: string,
  nickname?: string,
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

  const user = await db
    .select()
    .from(users)
    .where(eq(users.uuid, userUuid))
    .get();
  if (!user) {
    throw notFound("用户不存在");
  }
  if (user.isBound) {
    throw conflict("账号已绑定");
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (existing) {
    throw conflict("用户名已被占用");
  }

  const passwordHash = await hashPassword(password);

  try {
    await db
      .update(users)
      .set({
        username,
        passwordHash,
        nickname: nickname || username,
        deviceId: null,
        isBound: true,
        role: "user",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));
  } catch (error) {
    if (isUsersUniqueConflict(error, "username")) {
      throw conflict("用户名已被占用");
    }
    throw error;
  }

  const updatedUser = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .get();
  if (!updatedUser) {
    throw notFound("用户不存在");
  }

  const [accessToken, refreshToken] = await createTokenPair(updatedUser);
  await saveRefreshToken(updatedUser.id, refreshToken);

  return { accessToken, refreshToken, user: formatUser(updatedUser) };
}
