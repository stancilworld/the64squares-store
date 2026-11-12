import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261112141204 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tournament_registration" drop constraint if exists "tournament_registration_certificate_no_unique";`);
    this.addSql(`alter table if exists "tournament_registration" drop constraint if exists "tournament_registration_status_check";`);

    this.addSql(`alter table if exists "tournament" add column if not exists "entry" text check ("entry" in ('pass', 'free', 'fee')) not null default 'pass', add column if not exists "pass_cost" integer not null default 1, add column if not exists "check_in_minutes" integer not null default 30, add column if not exists "min_players" integer not null default 4, add column if not exists "round_break_seconds" integer not null default 60, add column if not exists "knockout_games" integer not null default 1, add column if not exists "armageddon" boolean not null default true, add column if not exists "age_min" integer null, add column if not exists "age_max" integer null, add column if not exists "prize_list" jsonb null, add column if not exists "category_prizes" jsonb null, add column if not exists "tagline" text null, add column if not exists "accent" text null, add column if not exists "featured" boolean not null default false, add column if not exists "stream_url" text null, add column if not exists "paused" boolean not null default false, add column if not exists "cancel_reason" text null, add column if not exists "results_final_at" timestamptz null, add column if not exists "coupon_code" text null, add column if not exists "certificates" boolean not null default true, add column if not exists "reminders" boolean not null default true;`);

    this.addSql(`alter table if exists "tournament_registration" add column if not exists "pass_entry_id" text null, add column if not exists "final_rank" integer null, add column if not exists "score" integer null, add column if not exists "review" text check ("review" in ('pending', 'cleared', 'disqualified')) null, add column if not exists "review_note" text null, add column if not exists "prize_title" text null, add column if not exists "prize_status" text check ("prize_status" in ('due', 'address', 'shipped', 'delivered')) null, add column if not exists "prize_address" jsonb null, add column if not exists "prize_tracking" text null, add column if not exists "certificate_no" text null;`);
    this.addSql(`alter table if exists "tournament_registration" add constraint "tournament_registration_status_check" check("status" in ('confirmed', 'cancelled', 'withdrawn'));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tournament_registration_certificate_no_unique" ON "tournament_registration" ("certificate_no") WHERE deleted_at IS NULL;`);
    // Existing events: arenas need no check-in; venue events keep their fee (or are free).
    this.addSql(`update "tournament" set "check_in_minutes" = 0 where "format" = 'arena';`);
    this.addSql(`update "tournament" set "entry" = case when "entry_fee" > 0 then 'fee' else 'free' end where "mode" = 'offline';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tournament_registration" drop constraint if exists "tournament_registration_status_check";`);

    this.addSql(`alter table if exists "tournament" drop column if exists "entry", drop column if exists "pass_cost", drop column if exists "check_in_minutes", drop column if exists "min_players", drop column if exists "round_break_seconds", drop column if exists "knockout_games", drop column if exists "armageddon", drop column if exists "age_min", drop column if exists "age_max", drop column if exists "prize_list", drop column if exists "category_prizes", drop column if exists "tagline", drop column if exists "accent", drop column if exists "featured", drop column if exists "stream_url", drop column if exists "paused", drop column if exists "cancel_reason", drop column if exists "results_final_at", drop column if exists "coupon_code", drop column if exists "certificates", drop column if exists "reminders";`);

    this.addSql(`drop index if exists "IDX_tournament_registration_certificate_no_unique";`);
    this.addSql(`alter table if exists "tournament_registration" drop column if exists "pass_entry_id", drop column if exists "final_rank", drop column if exists "score", drop column if exists "review", drop column if exists "review_note", drop column if exists "prize_title", drop column if exists "prize_status", drop column if exists "prize_address", drop column if exists "prize_tracking", drop column if exists "certificate_no";`);

    this.addSql(`alter table if exists "tournament_registration" add constraint "tournament_registration_status_check" check("status" in ('confirmed', 'cancelled'));`);
  }

}
