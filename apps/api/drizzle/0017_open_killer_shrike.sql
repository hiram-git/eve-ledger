CREATE TABLE `esi_checks` (
	`name` text PRIMARY KEY NOT NULL,
	`first_at` integer NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `incursion_systems` (
	`system_id` integer NOT NULL,
	`constellation_id` integer NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`system_id`, `first_seen`)
);
--> statement-breakpoint
ALTER TABLE `wallet_journal` ADD `tax` real;--> statement-breakpoint
ALTER TABLE `wallet_journal` ADD `tax_receiver_id` integer;