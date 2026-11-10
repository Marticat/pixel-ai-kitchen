CREATE TABLE `kitchen_keys` (
	`owner` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kitchen_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`paused` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`lease` text,
	`lease_until` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `kitchen_owner_date` ON `kitchen_runs` (`owner`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `kitchen_one_active` ON `kitchen_runs` (`owner`) WHERE "kitchen_runs"."status" in ('ready','running');