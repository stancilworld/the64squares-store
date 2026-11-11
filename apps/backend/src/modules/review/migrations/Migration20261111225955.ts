import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261111225955 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "review" add column if not exists "photos" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "review" drop column if exists "photos";`);
  }

}
