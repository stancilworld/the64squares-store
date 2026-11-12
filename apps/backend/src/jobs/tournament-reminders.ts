import type { MedusaContainer } from "@medusajs/framework/types"
import { sendTournamentReminders } from "../lib/tournament-notify"

// Every 5 minutes: reminders 24 hours, 1 hour and 10 minutes before online tournaments.
export default async function tournamentReminders(container: MedusaContainer) {
  await sendTournamentReminders(container)
}

export const config = { name: "tournament-reminders", schedule: "*/5 * * * *" }
