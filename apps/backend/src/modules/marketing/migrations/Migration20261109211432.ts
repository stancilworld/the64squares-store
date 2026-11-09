import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261109211432 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "marketing_event" drop constraint if exists "marketing_event_event_id_unique";`);
    this.addSql(`alter table if exists "marketing_delivery" drop constraint if exists "marketing_delivery_event_id_platform_unique";`);
    this.addSql(`alter table if exists "marketing_context" drop constraint if exists "marketing_context_cart_id_unique";`);
    this.addSql(`create table if not exists "marketing_context" ("id" text not null, "cart_id" text not null, "fbp" text null, "fbc" text null, "ga_client_id" text null, "ip" text null, "user_agent" text null, "page" text null, "consent" jsonb null, "utm" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "marketing_context_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_context_deleted_at" ON "marketing_context" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_marketing_context_cart_id_unique" ON "marketing_context" ("cart_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_context_created_at" ON "marketing_context" ("created_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "marketing_delivery" ("id" text not null, "event_id" text not null, "event_name" text not null, "platform" text not null, "channel" text not null, "status" text not null, "attempts" integer not null default 0, "next_attempt_at" timestamptz null, "last_attempt_at" timestamptz null, "delivered_at" timestamptz null, "response_code" integer null, "last_error" text null, "payload" jsonb null, "order_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "marketing_delivery_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_delivery_deleted_at" ON "marketing_delivery" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_marketing_delivery_event_id_platform_unique" ON "marketing_delivery" ("event_id", "platform") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_delivery_status_next_attempt_at" ON "marketing_delivery" ("status", "next_attempt_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_delivery_created_at" ON "marketing_delivery" ("created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_delivery_platform" ON "marketing_delivery" ("platform") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "marketing_event" ("id" text not null, "event_id" text not null, "name" text not null, "source" text not null, "page" text null, "order_id" text null, "customer_hash" text null, "value" real null, "currency" text null, "data" jsonb null, "consent" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "marketing_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_event_deleted_at" ON "marketing_event" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_marketing_event_event_id_unique" ON "marketing_event" ("event_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_event_created_at" ON "marketing_event" ("created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_event_name" ON "marketing_event" ("name") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_event_order_id" ON "marketing_event" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_event_customer_hash" ON "marketing_event" ("customer_hash") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "marketing_context" cascade;`);

    this.addSql(`drop table if exists "marketing_delivery" cascade;`);

    this.addSql(`drop table if exists "marketing_event" cascade;`);
  }

}
