CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"av_verified" boolean DEFAULT false NOT NULL,
	"av_verified_at" timestamp with time zone,
	"av_provider" text,
	"av_provider_ref" text,
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_av_consistent" CHECK (("users"."av_verified" = false) or ("users"."av_verified_at" is not null and "users"."av_provider" is not null and "users"."av_provider_ref" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");