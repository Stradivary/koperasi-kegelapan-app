CREATE TABLE `transaction_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`card_id` text NOT NULL,
	`user_id` integer,
	`counter` integer NOT NULL,
	`type` text NOT NULL CHECK (`type` IN ('debit', 'credit', 'checkin', 'checkout', 'topup', 'admin')),
	`amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`hash` text NOT NULL,
	`terminal_id` integer,
	`device_id` text,
	`idempotency_key` text NOT NULL UNIQUE,
	`flagged` integer NOT NULL DEFAULT 0,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`tenant_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`device_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_log_tenant_card_counter_unique` ON `transaction_log` (`tenant_id`, `card_id`, `counter`);--> statement-breakpoint
CREATE INDEX `transaction_log_tenant_card_idx` ON `transaction_log` (`tenant_id`, `card_id`);--> statement-breakpoint
CREATE INDEX `transaction_log_tenant_created_at_idx` ON `transaction_log` (`tenant_id`, `created_at`);
