import { model } from "@medusajs/framework/utils"

// "Email me when it's back": one per email and product option, until the email is sent.
const StockAlert = model
  .define("stock_alert", {
    id: model.id({ prefix: "salert" }).primaryKey(),
    email: model.text(),
    variant_id: model.text(),
    product_id: model.text(),
    notified_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["email", "variant_id"], unique: true, where: "deleted_at IS NULL" }, { on: ["notified_at"] }])

export default StockAlert
