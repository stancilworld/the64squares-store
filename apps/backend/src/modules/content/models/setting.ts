import { model } from "@medusajs/framework/utils"

// A store-wide setting edited in the admin, e.g. "upload_limits". The value is JSON so
// new settings can be added without a database change.
const Setting = model.define("setting", {
  id: model.id({ prefix: "set" }).primaryKey(),
  key: model.text().unique(),
  value: model.json(),
})

export default Setting
