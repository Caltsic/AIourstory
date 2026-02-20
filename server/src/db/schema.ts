import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    deviceId: text("device_id"),
    username: text("username").unique(),
    passwordHash: text("password_hash"),
    nickname: text("nickname").notNull().default("匿名玩家"),
    avatarSeed: text("avatar_seed").notNull().default(""),
    role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
    isBound: integer("is_bound", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
    lastLoginAt: text("last_login_at"),
  },
  (table) => [
    index("idx_users_device_id").on(table.deviceId),
    index("idx_users_username").on(table.username),
  ]
);

export const promptPresets = sqliteTable(
  "prompt_presets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    authorId: integer("author_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    promptsJson: text("prompts_json").notNull(),
    tags: text("tags").notNull().default("[]"),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    rejectReason: text("reject_reason"),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: text("reviewed_at"),
    downloadCount: integer("download_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_prompt_presets_status").on(table.status),
    index("idx_prompt_presets_author").on(table.authorId),
    index("idx_prompt_presets_created").on(table.createdAt),
    index("idx_prompt_presets_likes").on(table.likeCount),
    index("idx_prompt_presets_downloads").on(table.downloadCount),
  ]
);

export const storySettings = sqliteTable(
  "story_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    authorId: integer("author_id").notNull().references(() => users.id),
    title: text("title").notNull(),
    premise: text("premise").notNull(),
    genre: text("genre").notNull(),
    protagonistName: text("protagonist_name").notNull(),
    protagonistDescription: text("protagonist_description").notNull().default(""),
    protagonistAppearance: text("protagonist_appearance").notNull().default(""),
    difficulty: text("difficulty").notNull().default("普通"),
    initialPacing: text("initial_pacing").notNull().default("轻松"),
    extraDescription: text("extra_description").notNull().default(""),
    tags: text("tags").notNull().default("[]"),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    rejectReason: text("reject_reason"),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: text("reviewed_at"),
    downloadCount: integer("download_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_story_settings_status").on(table.status),
    index("idx_story_settings_author").on(table.authorId),
    index("idx_story_settings_genre").on(table.genre),
    index("idx_story_settings_created").on(table.createdAt),
    index("idx_story_settings_likes").on(table.likeCount),
    index("idx_story_settings_downloads").on(table.downloadCount),
  ]
);

export const likes = sqliteTable(
  "likes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    targetType: text("target_type", { enum: ["prompt", "story"] }).notNull(),
    targetId: integer("target_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("idx_likes_unique").on(table.userId, table.targetType, table.targetId),
    index("idx_likes_target").on(table.targetType, table.targetId),
    index("idx_likes_user").on(table.userId),
  ]
);

export const downloads = sqliteTable(
  "downloads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    targetType: text("target_type", { enum: ["prompt", "story"] }).notNull(),
    targetId: integer("target_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("idx_downloads_unique").on(table.userId, table.targetType, table.targetId),
    index("idx_downloads_target").on(table.targetType, table.targetId),
  ]
);

export const refreshTokens = sqliteTable(
  "refresh_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_refresh_tokens_user").on(table.userId),
    index("idx_refresh_tokens_expires").on(table.expiresAt),
  ]
);
