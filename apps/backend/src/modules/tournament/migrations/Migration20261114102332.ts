import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261114102332 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tournament" add column if not exists "start_mode" text check ("start_mode" in ('checkin', 'scheduled')) not null default 'checkin', add column if not exists "round_times" jsonb null, add column if not exists "join_minutes" integer not null default 5, add column if not exists "arena_pairing" text check ("arena_pairing" in ('auto', 'challenge')) not null default 'auto', add column if not exists "min_games" integer not null default 2;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tournament" drop column if exists "start_mode", drop column if exists "round_times", drop column if exists "join_minutes", drop column if exists "arena_pairing", drop column if exists "min_games";`);
  }

}
