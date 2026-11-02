import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261030130811 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "contact_message" ("id" text not null, "name" text null, "email" text null, "phone" text null, "topic" text null, "answers" jsonb not null, "status" text check ("status" in ('new', 'read', 'done')) not null default 'new', "note" text null, "ip" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "contact_message_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_contact_message_deleted_at" ON "contact_message" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "contact_message" cascade;`);
  }

}
