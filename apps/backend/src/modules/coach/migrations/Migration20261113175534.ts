import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261113175534 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "coach_usage" drop constraint if exists "coach_usage_customer_id_day_unique";`);
    this.addSql(`alter table if exists "coach_clip" drop constraint if exists "coach_clip_hash_unique";`);
    this.addSql(`create table if not exists "coach_clip" ("id" text not null, "hash" text not null, "voice_id" text not null, "text" text not null, "url" text not null, "chars" integer not null, "plays" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "coach_clip_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_coach_clip_deleted_at" ON "coach_clip" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_coach_clip_hash_unique" ON "coach_clip" ("hash") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "coach_usage" ("id" text not null, "customer_id" text not null, "day" text not null, "chars" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "coach_usage_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_coach_usage_deleted_at" ON "coach_usage" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_coach_usage_customer_id_day_unique" ON "coach_usage" ("customer_id", "day") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "coach_clip" cascade;`);

    this.addSql(`drop table if exists "coach_usage" cascade;`);
  }

}
