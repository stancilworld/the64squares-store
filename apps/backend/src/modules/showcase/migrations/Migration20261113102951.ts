import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261113102951 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "showcase_claim" drop constraint if exists "showcase_claim_ad_id_customer_id_unique";`);
    this.addSql(`create table if not exists "showcase_ad" ("id" text not null, "name" text not null, "status" text check ("status" in ('draft', 'live', 'paused')) not null default 'draft', "placement" text not null default 'play_hero', "rank" integer not null default 0, "starts_at" timestamptz null, "ends_at" timestamptz null, "audience" text check ("audience" in ('everyone', 'guests', 'members')) not null default 'everyone', "visual" jsonb not null, "tag" text null, "headline" text null, "body" text null, "theme" text check ("theme" in ('light', 'dark')) not null default 'light', "align" text check ("align" in ('left', 'center', 'right')) not null default 'left', "position" text check ("position" in ('top', 'middle', 'bottom')) not null default 'bottom', "scrim" boolean not null default true, "countdown_to" timestamptz null, "countdown_label" text null, "action" jsonb not null, "max_claims" integer null, "views" integer not null default 0, "clicks" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "showcase_ad_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_showcase_ad_deleted_at" ON "showcase_ad" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_showcase_ad_placement_status" ON "showcase_ad" ("placement", "status") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "showcase_asset" ("id" text not null, "name" text not null, "kind" text check ("kind" in ('image', 'video')) not null, "url" text not null, "poster_url" text null, "mime" text null, "size" integer null, "width" integer null, "height" integer null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "showcase_asset_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_showcase_asset_deleted_at" ON "showcase_asset" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "showcase_claim" ("id" text not null, "ad_id" text not null, "customer_id" text not null, "reward" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "showcase_claim_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_showcase_claim_deleted_at" ON "showcase_claim" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_showcase_claim_ad_id_customer_id_unique" ON "showcase_claim" ("ad_id", "customer_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "showcase_ad" cascade;`);

    this.addSql(`drop table if exists "showcase_asset" cascade;`);

    this.addSql(`drop table if exists "showcase_claim" cascade;`);
  }

}
