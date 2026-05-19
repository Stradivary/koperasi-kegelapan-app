CREATE TABLE `devices` (
	`device_id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`account_id` text NOT NULL,
	`fingerprint_hash` text NOT NULL,
	`user_agent` text NOT NULL,
	`platform` text NOT NULL,
	`last_seen_at` integer NOT NULL,
	`blocked_until` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`tenant_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`account_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_devices_tenant_account` ON `devices` (`tenant_id`, `account_id`);
