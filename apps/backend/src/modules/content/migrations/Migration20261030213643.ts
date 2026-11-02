import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261030213643 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "chat_session" ("id" text not null, "session_key" text not null, "messages" jsonb not null, "page" text null, "ip" text null, "ai_count" integer not null default 0, "handed_over" boolean not null default false, "last_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "chat_session_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_chat_session_deleted_at" ON "chat_session" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_chat_session_session_key" ON "chat_session" ("session_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_chat_session_last_at" ON "chat_session" ("last_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "chat_session" cascade;`);
  }

}
