import { model } from "@medusajs/framework/utils"

// A "The 64 Squares Journal" blog post. The body uses the same light formatting as pages.
const Post = model.define("post", {
  id: model.id({ prefix: "post" }).primaryKey(),
  title: model.text().searchable(),
  handle: model.text().unique(),
  excerpt: model.text().nullable(),
  body: model.text().default(""),
  cover_url: model.text().nullable(),
  thumbnail_url: model.text().nullable(),
  author: model.text().default("The 64 Squares"),
  status: model.enum(["draft", "published"]).default("draft"),
  published_at: model.dateTime().nullable(),
})

export default Post
