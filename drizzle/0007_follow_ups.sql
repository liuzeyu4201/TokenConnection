CREATE TYPE "public"."follow_up_status" AS ENUM('pending', 'done', 'skipped');--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"offset_days" integer NOT NULL,
	"due_on" date NOT NULL,
	"suggestion" text NOT NULL,
	"status" "follow_up_status" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_ups_person_offset_unique" UNIQUE("person_id","offset_days")
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "follow_up_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_ups_owner_status_due_idx" ON "follow_ups" USING btree ("owner_id","status","due_on");