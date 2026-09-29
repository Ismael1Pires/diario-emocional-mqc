CREATE TABLE `emotional_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`emotion` text NOT NULL,
	`intensity` integer NOT NULL,
	`trigger` text DEFAULT '' NOT NULL,
	`event` text DEFAULT '' NOT NULL,
	`thought` text DEFAULT '' NOT NULL,
	`body_sensation` text DEFAULT '' NOT NULL,
	`reaction` text DEFAULT '' NOT NULL,
	`pattern` text DEFAULT '' NOT NULL,
	`need` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_emotional_entries_occurred_at` ON `emotional_entries` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `reminder_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`times` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA optimize;
