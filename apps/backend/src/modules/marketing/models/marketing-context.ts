import { model } from "@medusajs/framework/utils"

// What the browser knew when checkout started, kept so the purchase (sent by the store
// itself once the order is confirmed) can be matched to the same visitor: the ad
// platforms' browser ids, the visitor's IP address and browser, consent and campaign tags.
// Never shown in the admin; deleted once the purchase is sent, and after a few days anyway.
const MarketingContext = model
  .define("marketing_context", {
    id: model.id({ prefix: "mctx" }).primaryKey(),
    cart_id: model.text(),
    fbp: model.text().nullable(),
    fbc: model.text().nullable(),
    ga_client_id: model.text().nullable(),
    ip: model.text().nullable(),
    user_agent: model.text().nullable(),
    page: model.text().nullable(),
    consent: model.json().nullable(),
    utm: model.json().nullable(),
  })
  .indexes([{ on: ["cart_id"], unique: true }, { on: ["created_at"] }])

export default MarketingContext
