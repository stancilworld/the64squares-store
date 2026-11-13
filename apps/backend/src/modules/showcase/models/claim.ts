import { model } from "@medusajs/framework/utils"

// A player claiming an advert's reward (once each).
const ShowcaseClaim = model
  .define("showcase_claim", {
    id: model.id({ prefix: "adclm" }).primaryKey(),
    ad_id: model.text(),
    customer_id: model.text(),
    // What was given, e.g. { type: "xp_boost", factor: 2, until: "…" } or { type: "passes", count: 1 }.
    reward: model.json(),
  })
  .indexes([{ on: ["ad_id", "customer_id"], unique: true, where: "deleted_at IS NULL" }])

export default ShowcaseClaim
