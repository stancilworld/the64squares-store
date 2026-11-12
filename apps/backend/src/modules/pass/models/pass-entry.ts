import { model } from "@medusajs/framework/utils"

// One change to a player's Tournament Pass wallet: +1 earned or given, -1 used or removed.
// The balance is the sum. `ref` makes each award happen once (e.g. "games:2026-11-12").
const PassEntry = model
  .define("pass_entry", {
    id: model.id({ prefix: "pass" }).primaryKey(),
    customer_id: model.text(),
    delta: model.number(),
    reason: model.enum(["welcome", "games", "puzzles", "referral", "completed", "admin", "join", "refund", "removed"]),
    note: model.text().nullable(),
    ref: model.text().nullable(),
    created_by: model.text().nullable(),
  })
  .indexes([{ on: ["customer_id"] }, { on: ["customer_id", "ref"], unique: true, where: "deleted_at IS NULL AND ref IS NOT NULL" }])

export default PassEntry
