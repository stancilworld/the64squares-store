import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261109221610 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "marketing_context" add column if not exists "click_ids" jsonb null;`);

    this.addSql(`alter table if exists "marketing_delivery" add column if not exists "external_id" text null, add column if not exists "external_status" text null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_delivery_external_id" ON "marketing_delivery" ("external_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "marketing_context" drop column if exists "click_ids";`);

    this.addSql(`drop index if exists "IDX_marketing_delivery_external_id";`);
    this.addSql(`alter table if exists "marketing_delivery" drop column if exists "external_id", drop column if exists "external_status";`);
  }

}
