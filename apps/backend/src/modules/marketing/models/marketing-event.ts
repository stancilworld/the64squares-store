import { model } from "@medusajs/framework/utils"

// One shop event (a product view, an add to cart, a purchase...), as the Event Manager
// shows it. Holds no personal details: only product ids, amounts, the page path, the
// order id and a one-way hash of the customer's email (so their data can be deleted).
const MarketingEvent = model
  .define("marketing_event", {
    id: model.id({ prefix: "mev" }).primaryKey(),
    // Shared by the browser tag and the server copy of the same event, so ad platforms
    // count it once.
    event_id: model.text(),
    name: model.text(),
    // "browser": reported by the visitor's browser; "server": made by the store itself
    // (purchases, refunds, registrations).
    source: model.text(),
    page: model.text().nullable(),
    order_id: model.text().nullable(),
    customer_hash: model.text().nullable(),
    value: model.float().nullable(),
    currency: model.text().nullable(),
    // Products, search words, campaign (UTM) tags. Never names, emails, phones or addresses.
    data: model.json().nullable(),
    // What the visitor allowed: { analytics: boolean, marketing: boolean }.
    consent: model.json().nullable(),
  })
  .indexes([
    { on: ["event_id"], unique: true },
    { on: ["created_at"] },
    { on: ["name"] },
    { on: ["order_id"] },
    { on: ["customer_hash"] },
  ])

export default MarketingEvent
