import { model } from "@medusajs/framework/utils"
import Registration from "./registration"

// A chess tournament, online or at a venue. Players register from the website and get a
// ticket with a code and a QR code.
const Tournament = model.define("tournament", {
  id: model.id({ prefix: "trn" }).primaryKey(),
  title: model.text().searchable(),
  handle: model.text().unique(),
  summary: model.text().nullable(),
  description: model.text().default(""),
  format: model.enum(["arena", "swiss", "round_robin", "knockout"]).default("swiss"),
  mode: model.enum(["online", "offline"]).default("online"),
  time_control: model.text().default("10+5"),
  rounds: model.number().nullable(),
  starts_at: model.dateTime(),
  ends_at: model.dateTime().nullable(),
  registration_closes_at: model.dateTime().nullable(),
  venue: model.text().nullable(),
  capacity: model.number().nullable(),
  // Rupees. Offline events collect it at the venue; online events stay free.
  entry_fee: model.number().default(0),
  rating_min: model.number().nullable(),
  rating_max: model.number().nullable(),
  prizes: model.text().nullable(),
  rules: model.text().nullable(),
  image_url: model.text().nullable(),
  status: model.enum(["draft", "published", "cancelled", "completed"]).default("draft"),
  registrations: model.hasMany(() => Registration, { mappedBy: "tournament" }),
})

export default Tournament
