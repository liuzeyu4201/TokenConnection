CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('met', 'helped_me', 'i_helped', 'hangout', 'note');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."inbox_intent" AS ENUM('add', 'update', 'query', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."inbox_status" AS ENUM('pending', 'applied', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."tag_kind" AS ENUM('skill', 'circle', 'other');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('best_bros', 'close_friends', 'friends', 'interacted', 'known_of');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "event_kind" DEFAULT 'note' NOT NULL,
	"content" text NOT NULL,
	"happened_at" date DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_text" text NOT NULL,
	"source" text NOT NULL,
	"status" "inbox_status" DEFAULT 'pending' NOT NULL,
	"intent" "inbox_intent",
	"parsed" jsonb,
	"applied_to" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"gender" "gender" DEFAULT 'unknown' NOT NULL,
	"location" text,
	"tier" "tier" DEFAULT 'known_of' NOT NULL,
	"summary" text,
	"impression" text,
	"contacts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"how_met" text,
	"met_at" date,
	"last_contact_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people_embeddings" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"source_text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people_tags" (
	"person_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "people_tags_person_id_tag_id_pk" PRIMARY KEY("person_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "tag_kind" DEFAULT 'other' NOT NULL,
	CONSTRAINT "tags_name_kind_unique" UNIQUE("name","kind")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_applied_to_people_id_fk" FOREIGN KEY ("applied_to") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_embeddings" ADD CONSTRAINT "people_embeddings_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_tags" ADD CONSTRAINT "people_tags_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_tags" ADD CONSTRAINT "people_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_person_id_idx" ON "events" USING btree ("person_id","happened_at");--> statement-breakpoint
CREATE INDEX "people_embeddings_embedding_idx" ON "people_embeddings" USING hnsw ("embedding" vector_cosine_ops);