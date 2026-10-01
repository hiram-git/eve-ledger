CREATE TABLE `killmails` (
	`killmail_id` integer PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`character_id` integer NOT NULL,
	`killmail_time` integer NOT NULL,
	`solar_system_id` integer NOT NULL,
	`victim_character_id` integer,
	`ship_type_id` integer NOT NULL,
	`items` text NOT NULL,
	`attackers` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `killmails_victim_time_idx` ON `killmails` (`victim_character_id`,`killmail_time`);