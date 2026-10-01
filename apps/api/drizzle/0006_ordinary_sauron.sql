CREATE TABLE `contracts` (
	`contract_id` integer PRIMARY KEY NOT NULL,
	`character_id` integer NOT NULL,
	`issuer_id` integer NOT NULL,
	`acceptor_id` integer,
	`assignee_id` integer,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`date_issued` integer NOT NULL,
	`date_completed` integer,
	`price` real,
	`reward` real,
	`collateral` real,
	`start_location_id` integer,
	`end_location_id` integer,
	`items` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contracts_issuer_date_idx` ON `contracts` (`issuer_id`,`date_issued`);