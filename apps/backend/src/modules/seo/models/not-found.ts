import { model } from "@medusajs/framework/utils"

// An address someone tried that doesn't exist (one row per path, counted).
const NotFound = model.define("seo_not_found", {
  id: model.id({ prefix: "nf" }).primaryKey(),
  path: model.text().unique(),
  hits: model.number().default(1),
  referrer: model.text().nullable(),
  last_seen_at: model.dateTime(),
})

export default NotFound
