PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_wallet_journal` (
	`journal_id` integer NOT NULL,
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
	PRIMARY KEY(`journal_id`, `character_id`),
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_wallet_journal`("journal_id", "character_id", "date", "ref_type", "amount", "balance", "description", "first_party_id", "second_party_id", "context_id", "context_id_type") SELECT "journal_id", "character_id", "date", "ref_type", "amount", "balance", "description", "first_party_id", "second_party_id", "context_id", "context_id_type" FROM `wallet_journal`;--> statement-breakpoint
DROP TABLE `wallet_journal`;--> statement-breakpoint
ALTER TABLE `__new_wallet_journal` RENAME TO `wallet_journal`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `journal_char_date_idx` ON `wallet_journal` (`character_id`,`date`);--> statement-breakpoint
CREATE INDEX `journal_ref_type_idx` ON `wallet_journal` (`ref_type`);--> statement-breakpoint
CREATE TABLE `__new_wallet_transactions` (
	`transaction_id` integer NOT NULL,
	`character_id` integer NOT NULL,
	`date` integer NOT NULL,
	`type_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` real NOT NULL,
	`is_buy` integer NOT NULL,
	`location_id` integer NOT NULL,
	`client_id` integer,
	`journal_ref_id` integer,
	PRIMARY KEY(`transaction_id`, `character_id`),
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_wallet_transactions`("transaction_id", "character_id", "date", "type_id", "quantity", "unit_price", "is_buy", "location_id", "client_id", "journal_ref_id") SELECT "transaction_id", "character_id", "date", "type_id", "quantity", "unit_price", "is_buy", "location_id", "client_id", "journal_ref_id" FROM `wallet_transactions`;--> statement-breakpoint
DROP TABLE `wallet_transactions`;--> statement-breakpoint
ALTER TABLE `__new_wallet_transactions` RENAME TO `wallet_transactions`;--> statement-breakpoint
CREATE INDEX `tx_char_date_idx` ON `wallet_transactions` (`character_id`,`date`);--> statement-breakpoint
CREATE INDEX `tx_type_idx` ON `wallet_transactions` (`type_id`);