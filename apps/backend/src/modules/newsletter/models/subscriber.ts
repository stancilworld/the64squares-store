import { model } from "@medusajs/framework/utils"

const Subscriber = model.define("subscriber", {
  id: model.id({ prefix: "nsub" }).primaryKey(),
  email: model.text().unique().searchable(),
  source: model.text().default("website"),
})

export default Subscriber
