ALTER TABLE "people" ADD COLUMN "primary_circle_tag_id" uuid;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "geo_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_primary_circle_tag_id_tags_id_fk" FOREIGN KEY ("primary_circle_tag_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;