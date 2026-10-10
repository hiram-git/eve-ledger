CREATE TABLE `jita_prices` (
	`type_id` integer PRIMARY KEY NOT NULL,
	`sell_min` real,
	`sell_orders` integer NOT NULL,
	`updated_at` integer NOT NULL
);
