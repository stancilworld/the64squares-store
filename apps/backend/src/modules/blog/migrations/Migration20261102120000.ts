import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261102120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "post" alter column "author" set default 'The64Squares';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "post" alter column "author" set default 'Stancil';`);
  }

}
