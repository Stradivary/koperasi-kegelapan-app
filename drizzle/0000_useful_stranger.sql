CREATE TYPE "public"."admin_role" AS ENUM('super_admin', 'tenant_admin', 'operator');--> statement-breakpoint
CREATE TYPE "public"."admin_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('unissued', 'active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."encryption_key_status" AS ENUM('active', 'rotating', 'retired');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'suspended', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."terminal_status" AS ENUM('active', 'inactive', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."terminal_type" AS ENUM('gate', 'terminal', 'station', 'scout');--> statement-breakpoint
CREATE TYPE "public"."top_up_source" AS ENUM('cash', 'bank_transfer', 'e_wallet', 'other');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('CHECKIN', 'EXIT', 'TOPUP');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "admin_role" NOT NULL,
	"status" "admin_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "daily_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"total_check_ins" integer DEFAULT 0 NOT NULL,
	"total_check_outs" integer DEFAULT 0 NOT NULL,
	"total_top_ups" integer DEFAULT 0 NOT NULL,
	"total_revenue" integer DEFAULT 0 NOT NULL,
	"total_top_up_amount" integer DEFAULT 0 NOT NULL,
	"unique_members" integer DEFAULT 0 NOT NULL,
	"avg_duration_hours" real DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encryption_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key_material" text NOT NULL,
	"version" integer NOT NULL,
	"status" "encryption_key_status" DEFAULT 'active' NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"migration_deadline" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "member_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"identity_number" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address" text NOT NULL,
	"status" "application_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"application_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"identity_number" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"card_uid" text,
	"card_status" "card_status" DEFAULT 'unissued' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"encryption_key_id" text,
	"tariff_rate_per_hour" integer DEFAULT 2000 NOT NULL,
	"max_balance" integer DEFAULT 10000000 NOT NULL,
	"min_balance_for_entry" integer DEFAULT 2000 NOT NULL,
	"branding" jsonb,
	"status" "tenant_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "terminal_type" NOT NULL,
	"location" text,
	"status" "terminal_status" DEFAULT 'active' NOT NULL,
	"last_heartbeat" timestamp with time zone,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"registered_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"terminal_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" integer NOT NULL,
	"balance_before" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"top_up_source" "top_up_source",
	"entry_time" timestamp with time zone,
	"exit_time" timestamp with time zone,
	"duration_hours" real,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"terminal_type" "terminal_type" NOT NULL,
	"is_simulated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "encryption_keys" ADD CONSTRAINT "encryption_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_idx" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_aggregates_tenant_date_idx" ON "daily_aggregates" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "member_applications_tenant_identity_idx" ON "member_applications" USING btree ("tenant_id","identity_number");--> statement-breakpoint
CREATE UNIQUE INDEX "members_card_uid_idx" ON "members" USING btree ("card_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "members_tenant_identity_idx" ON "members" USING btree ("tenant_id","identity_number");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_idx" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "transactions_tenant_occurred_idx" ON "transactions" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "transactions_tenant_member_idx" ON "transactions" USING btree ("tenant_id","member_id");