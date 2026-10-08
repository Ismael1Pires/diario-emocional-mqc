CREATE TABLE `auth_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`code_hash` text NOT NULL,
	`browser_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_challenges_expiry` ON `auth_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_expiry` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_users_email_unique` ON `auth_users` (`email`);--> statement-breakpoint
CREATE TABLE `legacy_migration_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`evidence_reference` text NOT NULL,
	`approved_by` text NOT NULL,
	`approved_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "legacy_migration_kind" CHECK("legacy_migration_audit"."resource_type" IN ('entries','reflections','settings'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legacy_migration_resource` ON `legacy_migration_audit` (`resource_type`,`resource_id`);--> statement-breakpoint
ALTER TABLE `emotional_entries` ADD `user_id` text REFERENCES auth_users(id);--> statement-breakpoint
CREATE INDEX `entries_user_occurred` ON `emotional_entries` (`user_id`,`occurred_at`);--> statement-breakpoint
ALTER TABLE `reflections` ADD `user_id` text REFERENCES auth_users(id);--> statement-breakpoint
CREATE INDEX `reflections_user_created` ON `reflections` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `reminder_settings` ADD `user_id` text REFERENCES auth_users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `settings_user` ON `reminder_settings` (`user_id`);
--> statement-breakpoint
-- Only an authenticated database operator can insert approvals. There is no HTTP claim endpoint.
CREATE TRIGGER legacy_migration_validate BEFORE INSERT ON legacy_migration_audit BEGIN
  SELECT CASE WHEN length(trim(NEW.evidence_reference)) < 8 OR length(trim(NEW.approved_by)) < 3 THEN RAISE(ABORT, 'Independent evidence and approver required') END;
  SELECT CASE WHEN NOT (
    (NEW.resource_type = 'entries' AND EXISTS(SELECT 1 FROM emotional_entries WHERE id = NEW.resource_id AND user_id IS NULL)) OR
    (NEW.resource_type = 'reflections' AND EXISTS(SELECT 1 FROM reflections WHERE id = NEW.resource_id AND user_id IS NULL)) OR
    (NEW.resource_type = 'settings' AND EXISTS(SELECT 1 FROM reminder_settings WHERE id = NEW.resource_id AND user_id IS NULL))
  ) THEN RAISE(ABORT, 'Resource absent or already owned') END;
END;
--> statement-breakpoint
CREATE TRIGGER legacy_migration_assign AFTER INSERT ON legacy_migration_audit BEGIN
  UPDATE emotional_entries SET user_id = NEW.user_id WHERE NEW.resource_type = 'entries' AND id = NEW.resource_id AND user_id IS NULL;
  UPDATE reflections SET user_id = NEW.user_id WHERE NEW.resource_type = 'reflections' AND id = NEW.resource_id AND user_id IS NULL;
  UPDATE reminder_settings SET user_id = NEW.user_id WHERE NEW.resource_type = 'settings' AND id = NEW.resource_id AND user_id IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER legacy_migration_no_update BEFORE UPDATE ON legacy_migration_audit BEGIN SELECT RAISE(ABORT, 'Audit is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER legacy_migration_no_delete BEFORE DELETE ON legacy_migration_audit BEGIN SELECT RAISE(ABORT, 'Audit is immutable'); END;
