import { model } from "@medusajs/framework/utils"

// One event going to one platform (Meta, Google Analytics...).
//   channel "browser": the visitor's browser sent it with the platform's tag; the store
//     only knows it was handed over (status "browser").
//   channel "server": the store sends it itself and records the answer
//     (pending → success, or failed after the last retry).
const MarketingDelivery = model
  .define("marketing_delivery", {
    id: model.id({ prefix: "mdl" }).primaryKey(),
    event_id: model.text(),
    event_name: model.text(),
    platform: model.text(),
    channel: model.text(),
    status: model.text(),
    attempts: model.number().default(0),
    next_attempt_at: model.dateTime().nullable(),
    last_attempt_at: model.dateTime().nullable(),
    delivered_at: model.dateTime().nullable(),
    response_code: model.number().nullable(),
    last_error: model.text().nullable(),
    // What is sent to the platform (server channel only). Customer details in it are
    // hashed, and removed once it has been delivered.
    payload: model.json().nullable(),
    order_id: model.text().nullable(),
  })
  .indexes([
    { on: ["event_id", "platform"], unique: true },
    { on: ["status", "next_attempt_at"] },
    { on: ["created_at"] },
    { on: ["platform"] },
  ])

export default MarketingDelivery
