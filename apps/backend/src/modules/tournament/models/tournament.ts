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

  // ---- Online tournaments (the Tournament Pass model) ----
  // How players enter: a Tournament Pass (online), free, or a fee paid at the venue.
  entry: model.enum(["pass", "free", "fee"]).default("pass"),
  pass_cost: model.number().default(1),
  // Check-in opens this many minutes before the start and closes at the start. 0: no
  // check-in (arenas: joining is enough).
  check_in_minutes: model.number().default(30),
  // Fewer checked-in players than this at the start: cancelled and passes returned.
  min_players: model.number().default(4),
  // Swiss and knockout: the pause between rounds.
  round_break_seconds: model.number().default(60),
  // Knockout: games per match, and a sudden-death decider (draw = Black goes through) if tied.
  knockout_games: model.number().default(1),
  armageddon: model.boolean().default(true),
  // Age group (years on the start day), null: any age.
  age_min: model.number().nullable(),
  age_max: model.number().nullable(),
  // [{ place, title, detail?, image_url?, product_handle? }]
  prize_list: model.json().nullable(),
  // [{ category: "u12" | "u16" | "women" | "new", title }]
  category_prizes: model.json().nullable(),
  tagline: model.text().nullable(),
  accent: model.text().nullable(),
  featured: model.boolean().default(false),
  // A live commentary stream (YouTube), shown on the tournament page.
  stream_url: model.text().nullable(),
  // Pairing stops while paused (games in progress carry on).
  paused: model.boolean().default(false),
  cancel_reason: model.text().nullable(),
  // Results are provisional until staff finish the fair-play review.
  results_final_at: model.dateTime().nullable(),
  // When the final placings were written (the 48-hour review runs from here).
  results_at: model.dateTime().nullable(),
  // A store discount code sent to every participant afterwards.
  coupon_code: model.text().nullable(),
  certificates: model.boolean().default(true),
  reminders: model.boolean().default(true),
  registrations: model.hasMany(() => Registration, { mappedBy: "tournament" }),
})

export default Tournament
