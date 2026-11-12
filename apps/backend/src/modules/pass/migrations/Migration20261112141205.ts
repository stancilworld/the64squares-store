import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261112141205 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "pass_entry" drop constraint if exists "pass_entry_customer_id_ref_unique";`);
    this.addSql(`create table if not exists "pass_entry" ("id" text not null, "customer_id" text not null, "delta" integer not null, "reason" text check ("reason" in ('welcome', 'games', 'puzzles', 'referral', 'completed', 'admin', 'join', 'refund', 'removed')) not null, "note" text null, "ref" text null, "created_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pass_entry_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pass_entry_deleted_at" ON "pass_entry" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pass_entry_customer_id" ON "pass_entry" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pass_entry_customer_id_ref_unique" ON "pass_entry" ("customer_id", "ref") WHERE deleted_at IS NULL AND ref IS NOT NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "pass_entry" cascade;`);
  }

}
