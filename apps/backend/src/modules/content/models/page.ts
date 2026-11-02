import { model } from "@medusajs/framework/utils"

// A simple text page such as Delivery & assembly, Returns, FAQs, Privacy or Terms.
// The body uses light formatting: blank lines split paragraphs, "## " starts a heading,
// "- " starts a list item, **bold**, *italic* and [link text](https://...) work inline.
const Page = model.define("page", {
  id: model.id({ prefix: "cpage" }).primaryKey(),
  handle: model.text().unique(),
  title: model.text(),
  body: model.text().default(""),
  is_published: model.boolean().default(true),
  rank: model.number().default(0),
})

export default Page
