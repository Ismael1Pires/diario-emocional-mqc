CREATE TABLE `reflections` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`content` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reflections_visitor_created` ON `reflections` (`visitor_id`,`created_at`);