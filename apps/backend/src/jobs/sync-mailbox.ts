import type { MedusaContainer } from "@medusajs/framework/types"
import { syncMailbox } from "../lib/mailbox"

// Copies new emails from the shop's mailbox into the admin (Messages → Email).
export default async function syncMailboxJob(container: MedusaContainer) {
  try {
    await syncMailbox(container)
  } catch {
    // Another copy is running, or the mailbox isn't set up: try again next minute.
  }
}

export const config = {
  name: "sync-mailbox",
  schedule: "* * * * *",
}
