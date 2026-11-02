import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261030080257 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "content_block" add column if not exists "draft" jsonb null, add column if not exists "publish_at" timestamptz null, add column if not exists "show_from" timestamptz null, add column if not exists "show_until" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "content_block" drop column if exists "draft", drop column if exists "publish_at", drop column if exists "show_from", drop column if exists "show_until";`);
  }

}
