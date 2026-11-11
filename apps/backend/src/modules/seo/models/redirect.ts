import { model } from "@medusajs/framework/utils"

// An old address that should send visitors (and Google) to a new one.
const Redirect = model.define("seo_redirect", {
  id: model.id({ prefix: "redir" }).primaryKey(),
  from_path: model.text().unique(),
  to_path: model.text(),
  permanent: model.boolean().default(true),
  hits: model.number().default(0),
  last_hit_at: model.dateTime().nullable(),
})

export default Redirect
