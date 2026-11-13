import { model } from "@medusajs/framework/utils"

// One advert in a window of the website (for now the Play screen's main window, "play_hero").
// Live adverts in the same window take turns, in `rank` order, between their start and end.
// The shapes of `visual` and `action` are in lib/showcase.ts.
const ShowcaseAd = model
  .define("showcase_ad", {
    id: model.id({ prefix: "ad" }).primaryKey(),
    // For the admin only.
    name: model.text(),
    status: model.enum(["draft", "live", "paused"]).default("draft"),
    placement: model.text().default("play_hero"),
    rank: model.number().default(0),
    starts_at: model.dateTime().nullable(),
    ends_at: model.dateTime().nullable(),
    audience: model.enum(["everyone", "guests", "members"]).default("everyone"),
    // A 3D design ({ kind: "scene", scene }) or uploaded art ({ kind: "asset", asset_id, … }).
    visual: model.json(),
    // Words over the visual (all optional).
    tag: model.text().nullable(),
    headline: model.text().nullable(),
    body: model.text().nullable(),
    theme: model.enum(["light", "dark"]).default("light"),
    align: model.enum(["left", "center", "right"]).default("left"),
    position: model.enum(["top", "middle", "bottom"]).default("bottom"),
    // A dark wash behind the words so they read on any picture.
    scrim: model.boolean().default(true),
    countdown_to: model.dateTime().nullable(),
    countdown_label: model.text().nullable(),
    // The button: none, a link, a coupon code or a reward to claim.
    action: model.json(),
    // Rewards: how many players can claim it (null: no limit).
    max_claims: model.number().nullable(),
    views: model.number().default(0),
    clicks: model.number().default(0),
  })
  .indexes([{ on: ["placement", "status"] }])

export default ShowcaseAd
