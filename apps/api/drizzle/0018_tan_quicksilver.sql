CREATE TABLE `loyalty_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`character_id` integer NOT NULL,
	`corporation_id` integer NOT NULL,
	`at` integer NOT NULL,
	`points` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `loyalty_log_idx` ON `loyalty_log` (`character_id`,`corporation_id`,`at`);--> statement-breakpoint
CREATE TABLE `loyalty_offers` (
	`corporation_id` integer NOT NULL,
	`offer_id` integer NOT NULL,
	`type_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`lp_cost` integer NOT NULL,
	`isk_cost` real NOT NULL,
	`required_items` text NOT NULL,
	PRIMARY KEY(`corporation_id`, `offer_id`)
);
--> statement-breakpoint
CREATE TABLE `loyalty_points` (
	`character_id` integer NOT NULL,
	`corporation_id` integer NOT NULL,
	`points` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`character_id`, `corporation_id`)
);
--> statement-breakpoint
CREATE TABLE `loyalty_stores` (
	`corporation_id` integer PRIMARY KEY NOT NULL,
	`offers` integer NOT NULL,
	`status` text NOT NULL,
	`checked_at` integer NOT NULL
);
