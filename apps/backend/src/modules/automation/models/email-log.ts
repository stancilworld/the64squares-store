import { model } from "@medusajs/framework/utils"

// Automatic emails already sent (one per kind and subject: an order, a cart, a customer…),
// and the addresses that asked for no more offers (kind "opt_out", key = the address).
const EmailLog = model
  .define("email_log", {
    id: model.id({ prefix: "elog" }).primaryKey(),
    kind: model.text(),
    key: model.text(),
    email: model.text(),
  })
  .indexes([{ on: ["kind", "key"], unique: true, where: "deleted_at IS NULL" }, { on: ["email"] }])

export default EmailLog
