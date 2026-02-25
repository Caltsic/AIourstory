ALTER TABLE `users` ADD `email` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `email_verification_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`purpose` text DEFAULT 'auth' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_email_codes_email` ON `email_verification_codes` (`email`);
--> statement-breakpoint
CREATE INDEX `idx_email_codes_expires` ON `email_verification_codes` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `idx_email_codes_created` ON `email_verification_codes` (`created_at`);
