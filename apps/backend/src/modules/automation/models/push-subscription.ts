import { model } from "@medusajs/framework/utils"

// A browser that allowed notifications from the website (Marketing → Notifications).
const PushSubscription = model.define("push_subscription", {
  id: model.id({ prefix: "push" }).primaryKey(),
  endpoint: model.text().unique(),
  p256dh: model.text(),
  auth: model.text(),
})

export default PushSubscription
