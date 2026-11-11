import { model } from "@medusajs/framework/utils"

// A notification sent to everyone who allowed them, and how many it reached.
const PushSend = model.define("push_send", {
  id: model.id({ prefix: "pushsend" }).primaryKey(),
  title: model.text(),
  body: model.text(),
  url: model.text(),
  image_url: model.text().nullable(),
  sent: model.number().default(0),
  failed: model.number().default(0),
})

export default PushSend
