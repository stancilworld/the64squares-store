import { model } from "@medusajs/framework/utils"

// A visitor opening a tournament page (once per visitor per tournament), for the funnel
// report: visits → registrations → joined → played, by where people came from.
const TournamentVisit = model
  .define("tournament_visit", {
    id: model.id({ prefix: "tvis" }).primaryKey(),
    tournament_id: model.text(),
    visitor: model.text(),
    source: model.text(),
  })
  .indexes([{ on: ["tournament_id", "visitor"], unique: true }, { on: ["tournament_id", "source"] }])

export default TournamentVisit
