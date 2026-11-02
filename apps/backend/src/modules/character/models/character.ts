import { model } from "@medusajs/framework/utils"

const Character = model.define("character", {
  id: model.id({ prefix: "char" }).primaryKey(),
  name: model.text().searchable(),
  handle: model.text().unique(),
  greeting: model.text().default("Hi! I am"),
  tagline: model.text().nullable(),
  story: model.text().nullable(),
  image_url: model.text().nullable(),
  banner_url: model.text().nullable(),
  collection_title: model.text().nullable(),
  status: model.enum(["live", "coming_soon"]).default("coming_soon"),
  coming_soon_text: model.text().default("You will find me soon..."),
  rank: model.number().default(0),
})

export default Character
