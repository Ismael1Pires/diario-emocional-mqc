CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`name` text NOT NULL,
	`whatsapp` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`consent` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'meu-diario-emocional' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_leads_created_at` ON `leads` (`created_at`);--> statement-breakpoint
ALTER TABLE `emotional_entries` ADD `visitor_id` text DEFAULT 'legacy-owner' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_emotional_entries_visitor_occurred_at` ON `emotional_entries` (`visitor_id`,`occurred_at`);