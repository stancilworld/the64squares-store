import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261112144229 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tournament_visit" drop constraint if exists "tournament_visit_tournament_id_visitor_unique";`);
    this.addSql(`create table if not exists "tournament_visit" ("id" text not null, "tournament_id" text not null, "visitor" text not null, "source" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tournament_visit_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tournament_visit_deleted_at" ON "tournament_visit" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tournament_visit_tournament_id_visitor_unique" ON "tournament_visit" ("tournament_id", "visitor") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tournament_visit_tournament_id_source" ON "tournament_visit" ("tournament_id", "source") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "tournament" add column if not exists "results_at" timestamptz null;`);

    this.addSql(`alter table if exists "tournament_registration" add column if not exists "source" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tournament_visit" cascade;`);

    this.addSql(`alter table if exists "tournament" drop column if exists "results_at";`);

    this.addSql(`alter table if exists "tournament_registration" drop column if exists "source";`);
  }

}
