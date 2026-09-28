CREATE TABLE `station_systems` (
	`station_id` integer PRIMARY KEY NOT NULL,
	`system_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `systems` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`security` real NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`z` real NOT NULL
);
