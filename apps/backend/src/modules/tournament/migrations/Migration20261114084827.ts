import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261114084827 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tournament" add column if not exists "lobby" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tournament" drop column if exists "lobby";`);
  }

}
