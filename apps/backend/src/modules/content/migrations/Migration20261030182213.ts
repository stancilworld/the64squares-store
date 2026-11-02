import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261030182213 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "mail_message" ("id" text not null, "folder" text check ("folder" in ('inbox', 'sent')) not null, "uid" integer null, "uidvalidity" text null, "message_id" text null, "in_reply_to" text null, "references" jsonb null, "thread_id" text not null, "from_name" text null, "from_email" text null, "reply_to" text null, "to" jsonb not null, "cc" jsonb null, "subject" text null, "text" text null, "html" text null, "snippet" text null, "date" timestamptz not null, "status" text check ("status" in ('new', 'read', 'done')) not null default 'new', "note" text null, "attachments" jsonb null, "sent_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mail_message_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mail_message_deleted_at" ON "mail_message" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mail_message_folder_uidvalidity_uid" ON "mail_message" ("folder", "uidvalidity", "uid") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mail_message_message_id" ON "mail_message" ("message_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mail_message_thread_id" ON "mail_message" ("thread_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "mail_message" cascade;`);
  }

}
