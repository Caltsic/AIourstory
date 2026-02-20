import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",

  databaseUrl: process.env.DATABASE_URL || "file:./data/aistory.db",

  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-production",
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || "30d",

  adminUsernames: (process.env.ADMIN_USERNAMES || "admin")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:8081")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const;
