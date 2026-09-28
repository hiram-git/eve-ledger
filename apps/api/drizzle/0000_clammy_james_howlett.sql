CREATE TABLE `characters` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_hash` text NOT NULL,
	`scopes` text NOT NULL,
	`refresh_token` text NOT NULL,
	`access_token` text,
	`token_expires_at` integer,
	`last_sync_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`character_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`rows_inserted` integer DEFAULT 0,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `wallet_journal` (
	`journal_id` integer PRIMARY KEY NOT NULL,
	`character_id` integer NOT NULL,
	`date` integer NOT NULL,
	`ref_type` text NOT NULL,
	`amount` real NOT NULL,
	`balance` real,
	`description` text,
	`first_party_id` integer,
	`second_party_id` integer,
	`context_id` integer,
	`context_id_type` text,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `journal_char_date_idx` ON `wallet_journal` (`character_id`,`date`);--> statement-breakpoint
CREATE INDEX `journal_ref_type_idx` ON `wallet_journal` (`ref_type`);--> statement-breakpoint
CREATE TABLE `wallet_transactions` (
	`transaction_id` integer PRIMARY KEY NOT NULL,
	`character_id` integer NOT NULL,
	`date` integer NOT NULL,
	`type_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` real NOT NULL,
	`is_buy` integer NOT NULL,
	`location_id` integer NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action
);
