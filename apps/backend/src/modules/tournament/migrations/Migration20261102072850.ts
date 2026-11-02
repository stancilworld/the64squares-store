import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261102072850 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tournament_registration" drop constraint if exists "tournament_registration_tournament_id_customer_id_unique";`);
    this.addSql(`alter table if exists "tournament_registration" drop constraint if exists "tournament_registration_ticket_code_unique";`);
    this.addSql(`alter table if exists "tournament" drop constraint if exists "tournament_handle_unique";`);
    this.addSql(`create table if not exists "tournament" ("id" text not null, "title" text not null, "handle" text not null, "summary" text null, "description" text not null default '', "format" text check ("format" in ('arena', 'swiss', 'round_robin', 'knockout')) not null default 'swiss', "mode" text check ("mode" in ('online', 'offline')) not null default 'online', "time_control" text not null default '10+5', "rounds" integer null, "starts_at" timestamptz not null, "ends_at" timestamptz null, "registration_closes_at" timestamptz null, "venue" text null, "capacity" integer null, "entry_fee" integer not null default 0, "rating_min" integer null, "rating_max" integer null, "prizes" text null, "rules" text null, "image_url" text null, "status" text check ("status" in ('draft', 'published', 'cancelled', 'completed')) not null default 'draft', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tournament_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tournament_handle_unique" ON "tournament" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tournament_deleted_at" ON "tournament" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "tournament_registration" ("id" text not null, "tournament_id" text not null, "customer_id" text not null, "ticket_code" text not null, "player_name" text not null, "email" text not null, "phone" text null, "fide_id" text null, "rating" integer null, "city" text null, "status" text check ("status" in ('confirmed', 'cancelled')) not null default 'confirmed', "checked_in_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tournament_registration_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tournament_registration_tournament_id" ON "tournament_registration" ("tournament_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tournament_registration_ticket_code_unique" ON "tournament_registration" ("ticket_code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tournament_registration_deleted_at" ON "tournament_registration" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tournament_registration_tournament_id_customer_id_unique" ON "tournament_registration" ("tournament_id", "customer_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "tournament_registration" add constraint "tournament_registration_tournament_id_foreign" foreign key ("tournament_id") references "tournament" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tournament_registration" drop constraint if exists "tournament_registration_tournament_id_foreign";`);

    this.addSql(`drop table if exists "tournament" cascade;`);

    this.addSql(`drop table if exists "tournament_registration" cascade;`);
  }

}
