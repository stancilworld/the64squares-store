import { model } from "@medusajs/framework/utils"

// A picture, animation or video uploaded to the advert library, ready to use in any advert
// or as the window's default screen.
const ShowcaseAsset = model.define("showcase_asset", {
  id: model.id({ prefix: "adart" }).primaryKey(),
  name: model.text(),
  kind: model.enum(["image", "video"]),
  url: model.text(),
  // Videos: a still shown before (or instead of) playing.
  poster_url: model.text().nullable(),
  mime: model.text().nullable(),
  size: model.number().nullable(),
  width: model.number().nullable(),
  height: model.number().nullable(),
})

export default ShowcaseAsset
