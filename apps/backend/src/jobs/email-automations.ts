import type { MedusaContainer } from "@medusajs/framework/types"
import { runAutomations } from "../lib/automations-run"

// Every 15 minutes: welcome, cart reminder, review request, win-back and back-in-stock emails
// (Marketing → Automatic emails). Each is sent once.
export default async function emailAutomations(container: MedusaContainer) {
  await runAutomations(container)
}

export const config = { name: "email-automations", schedule: "*/15 * * * *" }
