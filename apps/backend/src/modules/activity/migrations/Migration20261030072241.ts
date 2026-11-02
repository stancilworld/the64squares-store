import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261030072241 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "activity_entry" ("id" text not null, "actor_id" text null, "actor_name" text null, "action" text not null, "area" text not null, "target_type" text null, "target_id" text null, "method" text not null, "path" text not null, "status" integer not null, "ip" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "activity_entry_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_activity_entry_deleted_at" ON "activity_entry" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_activity_entry_created_at" ON "activity_entry" ("created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_activity_entry_actor_id" ON "activity_entry" ("actor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_activity_entry_area" ON "activity_entry" ("area") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "activity_entry" cascade;`);
  }

}
