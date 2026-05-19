CREATE TABLE `sync_cursors` (
	`tenant_id` text NOT NULL,
	`device_id` text NOT NULL,
	`entity_type` text NOT NULL CHECK(`entity_type` IN ('members', 'cards', 'transactions')),
	`last_cursor` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`tenant_id`, `device_id`, `entity_type`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`tenant_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`device_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `cards` ADD COLUMN `updated_at` integer DEFAULT (unixepoch()) NOT NULL;
