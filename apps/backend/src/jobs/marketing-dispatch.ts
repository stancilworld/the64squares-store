import type { MedusaContainer } from "@medusajs/framework/types"
import { dispatchDue } from "../lib/marketing/engine"

// Sends marketing events waiting for a retry (Settings → Marketing & integrations).
export default async function marketingDispatch(container: MedusaContainer) {
  await dispatchDue(container, { limit: 100 })
}

export const config = {
  name: "marketing-dispatch",
  schedule: "* * * * *",
}
