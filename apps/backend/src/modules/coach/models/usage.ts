import { model } from "@medusajs/framework/utils"

// New characters made for a player on a day (India time), for the daily limit.
const CoachUsage = model
  .define("coach_usage", {
    id: model.id({ prefix: "cuse" }).primaryKey(),
    customer_id: model.text(),
    day: model.text(),
    chars: model.number().default(0),
  })
  .indexes([{ on: ["customer_id", "day"], unique: true, where: "deleted_at IS NULL" }])

export default CoachUsage
