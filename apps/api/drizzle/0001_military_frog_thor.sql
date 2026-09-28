CREATE TABLE `names` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sync_log` ADD `kind` text DEFAULT 'journal' NOT NULL;--> statement-breakpoint
ALTER TABLE `wallet_transactions` ADD `client_id` integer;--> statement-breakpoint
ALTER TABLE `wallet_transactions` ADD `journal_ref_id` integer;--> statement-breakpoint
CREATE INDEX `tx_char_date_idx` ON `wallet_transactions` (`character_id`,`date`);--> statement-breakpoint
CREATE INDEX `tx_type_idx` ON `wallet_transactions` (`type_id`);