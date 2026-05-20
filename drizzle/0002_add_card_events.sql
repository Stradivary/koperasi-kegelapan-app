CREATE TABLE `card_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`card_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`source_device_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`tenant_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_card_events_tenant_created` ON `card_events` (`tenant_id`, `created_at`);
