CREATE TABLE `content_reports` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `uuid` text NOT NULL,
  `reporter_id` integer NOT NULL,
  `target_type` text NOT NULL,
  `target_uuid` text NOT NULL,
  `reason_type` text DEFAULT 'other' NOT NULL,
  `reason_text` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `handled_by` integer,
  `handled_note` text,
  `handled_at` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`handled_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_reports_uuid_unique` ON `content_reports` (`uuid`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_content_reports_unique_user_target` ON `content_reports` (`reporter_id`,`target_type`,`target_uuid`);
--> statement-breakpoint
CREATE INDEX `idx_content_reports_status` ON `content_reports` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_content_reports_target` ON `content_reports` (`target_type`,`target_uuid`);
--> statement-breakpoint
CREATE INDEX `idx_content_reports_reporter` ON `content_reports` (`reporter_id`);
--> statement-breakpoint
CREATE INDEX `idx_content_reports_created` ON `content_reports` (`created_at`);
