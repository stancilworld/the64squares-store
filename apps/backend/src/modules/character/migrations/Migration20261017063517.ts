import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261017063517 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "character" drop constraint if exists "character_handle_unique";`);
    this.addSql(`create table if not exists "character" ("id" text not null, "name" text not null, "handle" text not null, "greeting" text not null default 'Hi! I am', "tagline" text null, "story" text null, "image_url" text null, "banner_url" text null, "collection_title" text null, "status" text check ("status" in ('live', 'coming_soon')) not null default 'coming_soon', "coming_soon_text" text not null default 'You will find me soon...', "rank" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "character_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_character_handle_unique" ON "character" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_character_deleted_at" ON "character" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "character" cascade;`);
  }

}
