import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261111203138 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seo_redirect" drop constraint if exists "seo_redirect_from_path_unique";`);
    this.addSql(`alter table if exists "seo_not_found" drop constraint if exists "seo_not_found_path_unique";`);
    this.addSql(`alter table if exists "seo_meta" drop constraint if exists "seo_meta_target_type_target_key_unique";`);
    this.addSql(`create table if not exists "seo_meta" ("id" text not null, "target_type" text not null, "target_key" text not null, "title" text null, "description" text null, "image_url" text null, "keyword" text null, "noindex" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seo_meta_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seo_meta_deleted_at" ON "seo_meta" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seo_meta_target_type_target_key_unique" ON "seo_meta" ("target_type", "target_key") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "seo_not_found" ("id" text not null, "path" text not null, "hits" integer not null default 1, "referrer" text null, "last_seen_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seo_not_found_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seo_not_found_path_unique" ON "seo_not_found" ("path") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seo_not_found_deleted_at" ON "seo_not_found" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "seo_redirect" ("id" text not null, "from_path" text not null, "to_path" text not null, "permanent" boolean not null default true, "hits" integer not null default 0, "last_hit_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seo_redirect_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seo_redirect_from_path_unique" ON "seo_redirect" ("from_path") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seo_redirect_deleted_at" ON "seo_redirect" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "seo_meta" cascade;`);

    this.addSql(`drop table if exists "seo_not_found" cascade;`);

    this.addSql(`drop table if exists "seo_redirect" cascade;`);
  }

}
