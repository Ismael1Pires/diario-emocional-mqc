CREATE TABLE `billing_checkout_attempts` (
	`account_id` text NOT NULL,
	`mode` text NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`offer_key` text NOT NULL,
	`price_id` text NOT NULL,
	`checkout_mode` text NOT NULL,
	`customer_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`return_origin` text NOT NULL,
	`session_id` text,
	`url` text,
	PRIMARY KEY(`account_id`, `mode`, `request_id`),
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`mode`,`customer_id`) REFERENCES `billing_customers`(`account_id`,`mode`,`customer_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_attempts_mode" CHECK("billing_checkout_attempts"."mode" IN ('test','live')),
	CONSTRAINT "billing_attempts_checkout_mode" CHECK("billing_checkout_attempts"."checkout_mode" IN ('payment','subscription'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_attempts_session` ON `billing_checkout_attempts` (`account_id`,`mode`,`session_id`);--> statement-breakpoint
CREATE INDEX `billing_attempts_user` ON `billing_checkout_attempts` (`user_id`,`account_id`,`mode`);--> statement-breakpoint
CREATE TABLE `billing_customers` (
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`mode` text NOT NULL,
	`customer_id` text,
	`creation_id` text NOT NULL,
	`creation_started_at` integer NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`user_id`, `account_id`, `mode`),
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_customers_mode" CHECK("billing_customers"."mode" IN ('test','live'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_customers_remote` ON `billing_customers` (`account_id`,`mode`,`customer_id`);--> statement-breakpoint
CREATE TABLE `billing_events` (
	`account_id` text NOT NULL,
	`mode` text NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`processed_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `mode`, `event_id`),
	CONSTRAINT "billing_events_mode" CHECK("billing_events"."mode" IN ('test','live'))
);
--> statement-breakpoint
CREATE TABLE `billing_orders` (
	`account_id` text NOT NULL,
	`mode` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`offer_key` text NOT NULL,
	`customer_id` text NOT NULL,
	`status` text NOT NULL,
	`amount` integer,
	`currency` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `mode`, `session_id`),
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`mode`,`session_id`) REFERENCES `billing_checkout_attempts`(`account_id`,`mode`,`session_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_orders_mode" CHECK("billing_orders"."mode" IN ('test','live')),
	CONSTRAINT "billing_orders_status" CHECK("billing_orders"."status" IN ('paid','pending','failed','expired'))
);
--> statement-breakpoint
CREATE INDEX `billing_orders_user` ON `billing_orders` (`user_id`,`account_id`,`mode`,`updated_at`);--> statement-breakpoint
CREATE TABLE `billing_subscriptions` (
	`account_id` text NOT NULL,
	`mode` text NOT NULL,
	`subscription_id` text NOT NULL,
	`user_id` text NOT NULL,
	`offer_key` text NOT NULL,
	`customer_id` text NOT NULL,
	`status` text NOT NULL,
	`cancel_at_period_end` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `mode`, `subscription_id`),
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`mode`,`customer_id`) REFERENCES `billing_customers`(`account_id`,`mode`,`customer_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_subscriptions_mode" CHECK("billing_subscriptions"."mode" IN ('test','live'))
);
--> statement-breakpoint
CREATE INDEX `billing_subscriptions_user` ON `billing_subscriptions` (`user_id`,`account_id`,`mode`,`updated_at`);--> statement-breakpoint
CREATE TABLE `billing_versions` (
	`account_id` text NOT NULL,
	`mode` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`account_id`, `mode`),
	CONSTRAINT "billing_versions_nonnegative" CHECK("billing_versions"."version" >= 0),
	CONSTRAINT "billing_versions_mode" CHECK("billing_versions"."mode" IN ('test','live'))
);
