import { model } from "@medusajs/framework/utils"

// A News article: written in the admin's word-processor style editor, stored as cleaned HTML.
const NewsArticle = model.define("news_article", {
  id: model.id({ prefix: "news" }).primaryKey(),
  title: model.text().searchable(),
  handle: model.text().unique(),
  excerpt: model.text().nullable(),
  body_html: model.text().default(""),
  cover_url: model.text().nullable(),
  topic: model.text().default("News"),
  author: model.text().default("The 64 Squares"),
  featured: model.boolean().default(false),
  status: model.enum(["draft", "published"]).default("draft"),
  published_at: model.dateTime().nullable(),
})

export default NewsArticle
