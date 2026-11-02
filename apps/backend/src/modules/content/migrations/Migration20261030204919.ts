import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261030204919 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "mail_message" add column if not exists "starred" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "mail_message" drop column if exists "starred";`);
  }

}
