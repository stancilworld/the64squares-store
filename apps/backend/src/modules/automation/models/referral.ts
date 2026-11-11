import { model } from "@medusajs/framework/utils"

// A customer's "invite a friend" code, and what it has earned.
const Referral = model
  .define("referral", {
    id: model.id({ prefix: "ref" }).primaryKey(),
    customer_id: model.text().unique(),
    code: model.text().unique(),
    // The friend discount (a promotion made for this code).
    promotion_id: model.text().nullable(),
    uses: model.number().default(0),
    rewards: model.number().default(0),
  })

export default Referral
