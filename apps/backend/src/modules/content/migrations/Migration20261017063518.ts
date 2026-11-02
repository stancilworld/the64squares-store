import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261017063518 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "content_block" ("id" text not null, "page" text not null default 'home', "section" text check ("section" in ('hero_slide', 'why_point', 'featured_collection', 'product_row', 'newsletter', 'announcement')) not null, "eyebrow" text null, "title" text null, "body" text null, "image_url" text null, "link_label" text null, "link_url" text null, "rank" integer not null default 0, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "content_block_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_content_block_deleted_at" ON "content_block" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "content_block" cascade;`);
  }

}
