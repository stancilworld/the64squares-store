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
    status: model.enum(["confirmed", "cancelled", "withdrawn"]).default("confirmed"),
    checked_in_at: model.dateTime().nullable(),
    // The Tournament Pass spent on this place (returned if cancelled in time).
    pass_entry_id: model.text().nullable(),
    // Results (written when the tournament ends).
    final_rank: model.number().nullable(),
    score: model.float().nullable(),
    // Fair-play review of the top finishers before prizes are confirmed.
    review: model.enum(["pending", "cleared", "disqualified"]).nullable(),
    review_note: model.text().nullable(),
    // A prize won, and its delivery.
    prize_title: model.text().nullable(),
    prize_status: model.enum(["due", "address", "shipped", "delivered"]).nullable(),
    prize_address: model.json().nullable(),
    prize_tracking: model.text().nullable(),
    certificate_no: model.text().unique().nullable(),
    // Where the player came from (utm_source or the referring site), for the funnel report.
    source: model.text().nullable(),
  })
  .indexes([{ on: ["tournament_id", "customer_id"], unique: true, where: "deleted_at IS NULL" }])

export default Registration
