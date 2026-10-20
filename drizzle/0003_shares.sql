CREATE TYPE "public"."share_kind" AS ENUM('person', 'circle');--> statement-breakpoint
CREATE TYPE "public"."share_recipient_status" AS ENUM('pending', 'accepted', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."share_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."share_via" AS ENUM('direct', 'link');--> statement-breakpoint
CREATE TABLE "share_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"person_id" uuid,
	"snapshot" jsonb,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"passcode_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"max_views" integer,
	"view_count" integer DEFAULT 0 NOT NULL,
	"passcode_failures" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "share_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"via" "share_via" DEFAULT 'direct' NOT NULL,
	"status" "share_recipient_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "share_recipients_share_user_unique" UNIQUE("share_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "share_kind" NOT NULL,
	"person_id" uuid,
	"circle_tag_id" uuid,
	"fields" jsonb NOT NULL,
	"message" text,
	"status" "share_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refreshed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "share_recipient_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "share_item_id" uuid;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "source_share_item_id" uuid;--> statement-breakpoint
ALTER TABLE "share_items" ADD CONSTRAINT "share_items_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_items" ADD CONSTRAINT "share_items_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_recipients" ADD CONSTRAINT "share_recipients_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_recipients" ADD CONSTRAINT "share_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_circle_tag_id_tags_id_fk" FOREIGN KEY ("circle_tag_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_items_share_idx" ON "share_items" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "share_recipients_user_idx" ON "share_recipients" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "shares_owner_idx" ON "shares" USING btree ("owner_id","created_at");--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_share_recipient_id_share_recipients_id_fk" FOREIGN KEY ("share_recipient_id") REFERENCES "public"."share_recipients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_share_item_id_share_items_id_fk" FOREIGN KEY ("share_item_id") REFERENCES "public"."share_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_source_share_item_id_share_items_id_fk" FOREIGN KEY ("source_share_item_id") REFERENCES "public"."share_items"("id") ON DELETE set null ON UPDATE no action;