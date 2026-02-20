CREATE TABLE `downloads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_downloads_unique` ON `downloads` (`user_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_downloads_target` ON `downloads` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `likes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_likes_unique` ON `likes` (`user_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_likes_target` ON `likes` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_likes_user` ON `likes` (`user_id`);--> statement-breakpoint
CREATE TABLE `prompt_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`author_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`prompts_json` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reject_reason` text,
	`reviewed_by` integer,
	`reviewed_at` text,
	`download_count` integer DEFAULT 0 NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_presets_uuid_unique` ON `prompt_presets` (`uuid`);--> statement-breakpoint
CREATE INDEX `idx_prompt_presets_status` ON `prompt_presets` (`status`);--> statement-breakpoint
CREATE INDEX `idx_prompt_presets_author` ON `prompt_presets` (`author_id`);--> statement-breakpoint
CREATE INDEX `idx_prompt_presets_created` ON `prompt_presets` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_prompt_presets_likes` ON `prompt_presets` (`like_count`);--> statement-breakpoint
CREATE INDEX `idx_prompt_presets_downloads` ON `prompt_presets` (`download_count`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_token_hash_unique` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_user` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_expires` ON `refresh_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `story_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`author_id` integer NOT NULL,
	`title` text NOT NULL,
	`premise` text NOT NULL,
	`genre` text NOT NULL,
	`protagonist_name` text NOT NULL,
	`protagonist_description` text DEFAULT '' NOT NULL,
	`protagonist_appearance` text DEFAULT '' NOT NULL,
	`difficulty` text DEFAULT '普通' NOT NULL,
	`initial_pacing` text DEFAULT '轻松' NOT NULL,
	`extra_description` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reject_reason` text,
	`reviewed_by` integer,
	`reviewed_at` text,
	`download_count` integer DEFAULT 0 NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `story_settings_uuid_unique` ON `story_settings` (`uuid`);--> statement-breakpoint
CREATE INDEX `idx_story_settings_status` ON `story_settings` (`status`);--> statement-breakpoint
CREATE INDEX `idx_story_settings_author` ON `story_settings` (`author_id`);--> statement-breakpoint
CREATE INDEX `idx_story_settings_genre` ON `story_settings` (`genre`);--> statement-breakpoint
CREATE INDEX `idx_story_settings_created` ON `story_settings` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_story_settings_likes` ON `story_settings` (`like_count`);--> statement-breakpoint
CREATE INDEX `idx_story_settings_downloads` ON `story_settings` (`download_count`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`device_id` text,
	`username` text,
	`password_hash` text,
	`nickname` text DEFAULT '匿名玩家' NOT NULL,
	`avatar_seed` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`is_bound` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_uuid_unique` ON `users` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_users_device_id` ON `users` (`device_id`);--> statement-breakpoint
CREATE INDEX `idx_users_username` ON `users` (`username`);