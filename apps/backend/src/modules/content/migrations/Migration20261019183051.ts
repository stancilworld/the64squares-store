import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261019183051 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "team_member" ("id" text not null, "name" text not null, "role" text null, "image_url" text null, "color_image_url" text null, "canvas_width" integer null, "canvas_height" integer null, "box" jsonb null, "mask" text null, "rank" integer not null default 0, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "team_member_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_team_member_deleted_at" ON "team_member" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "team_member" cascade;`);
  }

}
