import { model } from "@medusajs/framework/utils"

// Search and sharing settings for one page: a News article, Journal post, tournament, help page
// or one of the fixed pages (keyed by its path). Products keep theirs on the product itself.
const SeoMeta = model
  .define("seo_meta", {
    id: model.id({ prefix: "seo" }).primaryKey(),
    // news | post | tournament | page | static
    target_type: model.text(),
    // The item's id, or the path for fixed pages ("/", "/shop", …).
    target_key: model.text(),
    title: model.text().nullable(),
    description: model.text().nullable(),
    image_url: model.text().nullable(),
    keyword: model.text().nullable(),
    noindex: model.boolean().default(false),
  })
  .indexes([{ on: ["target_type", "target_key"], unique: true }])

export default SeoMeta
