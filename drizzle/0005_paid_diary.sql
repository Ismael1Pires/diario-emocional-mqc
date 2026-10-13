CREATE TABLE `billing_diary_grants` (
  `account_id` text NOT NULL,
  `mode` text NOT NULL,
  `session_id` text NOT NULL,
  `user_id` text NOT NULL,
  `offer_key` text NOT NULL,
  `price_id` text NOT NULL,
  `customer_id` text NOT NULL,
  `payment_intent_id` text,
  `charge_id` text,
  `status` text NOT NULL,
  `checked_at` integer NOT NULL,
  PRIMARY KEY(`account_id`, `mode`, `session_id`),
  FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`account_id`,`mode`,`session_id`) REFERENCES `billing_orders`(`account_id`,`mode`,`session_id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT "billing_diary_grants_mode" CHECK("billing_diary_grants"."mode" IN ('test','live')),
  CONSTRAINT "billing_diary_grants_status" CHECK("billing_diary_grants"."status" IN ('active','unpaid','refunded','disputed'))
);
--> statement-breakpoint
CREATE INDEX `billing_diary_grants_user` ON `billing_diary_grants` (`user_id`,`account_id`,`mode`,`offer_key`,`price_id`);
--> statement-breakpoint
CREATE INDEX `billing_diary_grants_charge` ON `billing_diary_grants` (`account_id`,`mode`,`charge_id`);
--> statement-breakpoint
CREATE INDEX `billing_diary_grants_intent` ON `billing_diary_grants` (`account_id`,`mode`,`payment_intent_id`);
