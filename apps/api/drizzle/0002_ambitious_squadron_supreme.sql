CREATE TABLE `assets` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`character_id` integer NOT NULL,
	`type_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`location_id` integer NOT NULL,
	`location_flag` text NOT NULL,
	`location_type` text NOT NULL,
	`root_location_id` integer NOT NULL,
	`is_singleton` integer NOT NULL,
	`is_blueprint_copy` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assets_char_idx` ON `assets` (`character_id`);--> statement-breakpoint
CREATE INDEX `assets_type_idx` ON `assets` (`type_id`);--> statement-breakpoint
CREATE INDEX `assets_root_idx` ON `assets` (`root_location_id`);--> statement-breakpoint
CREATE TABLE `market_prices` (
	`type_id` integer PRIMARY KEY NOT NULL,
	`average_price` real,
	`adjusted_price` real,
	`updated_at` integer NOT NULL
);
