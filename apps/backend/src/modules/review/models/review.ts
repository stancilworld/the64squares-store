import { model } from "@medusajs/framework/utils"

// A product review. Shoppers' reviews wait for approval; reviews added in the admin (for
// example ones received on Etsy or WhatsApp) can go live straight away.
const Review = model
  .define("review", {
    id: model.id({ prefix: "rev" }).primaryKey(),
    product_id: model.text(),
    rating: model.number(),
    title: model.text().nullable(),
    body: model.text().searchable(),
    name: model.text().searchable(),
    city: model.text().nullable(),
    customer_id: model.text().nullable(),
    // Bought the product on this website (checked when the review is written).
    verified: model.boolean().default(false),
    status: model.enum(["pending", "approved", "hidden"]).default("pending"),
    // Where it came from: written on the website, or added in the admin.
    source: model.enum(["website", "admin", "etsy"]).default("website"),
    // The shop's public answer, shown under the review.
    reply: model.text().nullable(),
    // When the review was written (may be earlier than created_at for imported reviews).
    reviewed_at: model.dateTime(),
    // Up to 3 photo addresses added by the shopper (Website → Site features → Review photos).
    photos: model.json().nullable(),
  })
  .indexes([{ on: ["product_id", "status"] }, { on: ["customer_id", "product_id"] }])

export default Review
