CREATE TABLE IF NOT EXISTS `user_profiles` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES auth_users(id),
  `avatar` text,
  `updated_at` integer NOT NULL
);
