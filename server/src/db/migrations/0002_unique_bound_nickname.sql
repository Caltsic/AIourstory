UPDATE `users`
SET `nickname` = ('玩家' || `id`)
WHERE `is_bound` = 1
  AND (`nickname` IS NULL OR trim(`nickname`) = '');
--> statement-breakpoint
WITH ranked AS (
  SELECT
    `id`,
    `nickname`,
    row_number() OVER (PARTITION BY `nickname` ORDER BY `id`) AS `rn`
  FROM `users`
  WHERE `is_bound` = 1
)
UPDATE `users`
SET `nickname` = (`nickname` || '#' || `id`)
WHERE `id` IN (SELECT `id` FROM ranked WHERE `rn` > 1);
--> statement-breakpoint
CREATE INDEX `idx_users_nickname` ON `users` (`nickname`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_bound_nickname_unique`
ON `users` (`nickname`)
WHERE `is_bound` = 1;
