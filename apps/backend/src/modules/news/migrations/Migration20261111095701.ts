import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261111095701 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "news_article" drop constraint if exists "news_article_handle_unique";`);
    this.addSql(`create table if not exists "news_article" ("id" text not null, "title" text not null, "handle" text not null, "excerpt" text null, "body_html" text not null default '', "cover_url" text null, "topic" text not null default 'News', "author" text not null default 'The 64 Squares', "featured" boolean not null default false, "status" text check ("status" in ('draft', 'published')) not null default 'draft', "published_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "news_article_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_news_article_handle_unique" ON "news_article" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_news_article_deleted_at" ON "news_article" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "news_article" cascade;`);
  }

}
