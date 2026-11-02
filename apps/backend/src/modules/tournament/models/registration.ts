import { model } from "@medusajs/framework/utils"
import Tournament from "./tournament"

// One player's place in a tournament, tied to their website account.
const Registration = model
  .define("tournament_registration", {
    id: model.id({ prefix: "treg" }).primaryKey(),
    tournament: model.belongsTo(() => Tournament, { mappedBy: "registrations" }),
    customer_id: model.text(),
    ticket_code: model.text().unique(),
    player_name: model.text(),
    email: model.text(),
    phone: model.text().nullable(),
    fide_id: model.text().nullable(),
    rating: model.number().nullable(),
    city: model.text().nullable(),
    status: model.enum(["confirmed", "cancelled"]).default("confirmed"),
    checked_in_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["tournament_id", "customer_id"], unique: true, where: "deleted_at IS NULL" }])

export default Registration
