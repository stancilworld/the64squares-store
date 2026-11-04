import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261105090000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "review" ("id" text not null, "product_id" text not null, "rating" integer not null, "title" text null, "body" text not null, "name" text not null, "city" text null, "customer_id" text null, "verified" boolean not null default false, "status" text check ("status" in ('pending', 'approved', 'hidden')) not null default 'pending', "source" text check ("source" in ('website', 'admin', 'etsy')) not null default 'website', "reply" text null, "reviewed_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "review_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_review_deleted_at" ON "review" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_review_product_id_status" ON "review" ("product_id", "status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_review_customer_id_product_id" ON "review" ("customer_id", "product_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "review" cascade;`);
  }

}
