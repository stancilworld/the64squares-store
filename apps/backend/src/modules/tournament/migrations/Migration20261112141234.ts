import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261112141234 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tournament_registration" alter column "score" type real using ("score"::real);`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tournament_registration" alter column "score" type integer using ("score"::integer);`);
  }

}
