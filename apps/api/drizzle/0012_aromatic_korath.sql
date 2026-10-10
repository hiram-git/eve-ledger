CREATE TABLE `character_attributes` (
	`character_id` integer PRIMARY KEY NOT NULL,
	`charisma` integer NOT NULL,
	`intelligence` integer NOT NULL,
	`memory` integer NOT NULL,
	`perception` integer NOT NULL,
	`willpower` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `character_skills` (
	`character_id` integer NOT NULL,
	`skill_id` integer NOT NULL,
	`trained_level` integer NOT NULL,
	`active_level` integer NOT NULL,
	`sp` integer NOT NULL,
	PRIMARY KEY(`character_id`, `skill_id`)
);
--> statement-breakpoint
CREATE TABLE `doctrines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fit_plans` (
	`fit_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`skills` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`fit_id`) REFERENCES `fits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doctrine_id` integer NOT NULL,
	`name` text NOT NULL,
	`ship_type_id` integer NOT NULL,
	`eft` text NOT NULL,
	`items` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`doctrine_id`) REFERENCES `doctrines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `type_dogma` (
	`type_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`group_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`rank` real,
	`primary_attr` integer,
	`secondary_attr` integer,
	`required` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `characters` ADD `clone` text DEFAULT 'omega' NOT NULL;--> statement-breakpoint
ALTER TABLE `characters` ADD `total_sp` integer;--> statement-breakpoint
ALTER TABLE `characters` ADD `unallocated_sp` integer;--> statement-breakpoint
ALTER TABLE `characters` ADD `skills_at` integer;