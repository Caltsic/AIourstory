import "dotenv/config";

function toInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBool(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET || "dev-secret-change-in-production";

if (isProduction && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}

export const config = {
  port: toInt(process.env.PORT, 3000),
  host: process.env.HOST || "0.0.0.0",
  trustProxy: toBool(process.env.TRUST_PROXY, false),

  databaseUrl: process.env.DATABASE_URL || "file:./data/aistory.db",

  jwtSecret,
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || "30d",

  smtpHost: process.env.SMTP_HOST || "smtpdm.aliyun.com",
  smtpPort: toInt(process.env.SMTP_PORT, 465),
  smtpSecure: toBool(process.env.SMTP_SECURE, true),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  mailFrom: process.env.MAIL_FROM || "",

  emailCodeTtlSeconds: toInt(process.env.EMAIL_CODE_TTL_SECONDS, 300),
  emailCodeCooldownSeconds: toInt(process.env.EMAIL_CODE_COOLDOWN_SECONDS, 60),
  emailCodeDailyLimit: toInt(process.env.EMAIL_CODE_DAILY_LIMIT, 20),
  emailCodeMaxAttempts: toInt(process.env.EMAIL_CODE_MAX_ATTEMPTS, 5),
  emailCodeSecret: process.env.EMAIL_CODE_SECRET || jwtSecret,

  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:8081")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  rateLimitGlobalMax: toInt(process.env.RATE_LIMIT_GLOBAL_MAX, 100),
  rateLimitGlobalWindow: process.env.RATE_LIMIT_GLOBAL_WINDOW || "1 minute",
  rateLimitAuthMax: toInt(process.env.RATE_LIMIT_AUTH_MAX, 20),
  rateLimitAuthWindow: process.env.RATE_LIMIT_AUTH_WINDOW || "1 minute",
  rateLimitAdminMax: toInt(process.env.RATE_LIMIT_ADMIN_MAX, 30),
  rateLimitAdminWindow: process.env.RATE_LIMIT_ADMIN_WINDOW || "1 minute",
} as const;
