import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261111225114 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "stock_alert" drop constraint if exists "stock_alert_email_variant_id_unique";`);
    this.addSql(`alter table if exists "referral" drop constraint if exists "referral_code_unique";`);
    this.addSql(`alter table if exists "referral" drop constraint if exists "referral_customer_id_unique";`);
    this.addSql(`alter table if exists "email_log" drop constraint if exists "email_log_kind_key_unique";`);
    this.addSql(`create table if not exists "email_log" ("id" text not null, "kind" text not null, "key" text not null, "email" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "email_log_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_email_log_deleted_at" ON "email_log" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_log_kind_key_unique" ON "email_log" ("kind", "key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_email_log_email" ON "email_log" ("email") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "referral" ("id" text not null, "customer_id" text not null, "code" text not null, "promotion_id" text null, "uses" integer not null default 0, "rewards" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "referral_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_referral_customer_id_unique" ON "referral" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_referral_code_unique" ON "referral" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_referral_deleted_at" ON "referral" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "stock_alert" ("id" text not null, "email" text not null, "variant_id" text not null, "product_id" text not null, "notified_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "stock_alert_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_alert_deleted_at" ON "stock_alert" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_stock_alert_email_variant_id_unique" ON "stock_alert" ("email", "variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_alert_notified_at" ON "stock_alert" ("notified_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "email_log" cascade;`);

    this.addSql(`drop table if exists "referral" cascade;`);

    this.addSql(`drop table if exists "stock_alert" cascade;`);
  }

}
