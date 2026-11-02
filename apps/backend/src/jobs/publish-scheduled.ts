import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { publishDueDrafts } from "../lib/content-drafts"

// Publishes website drafts whose "Publish on" time has come.
export default async function publishScheduled(container: MedusaContainer) {
  const n = await publishDueDrafts(container)
  if (n) {
    container.resolve(ContainerRegistrationKeys.LOGGER).info(`Published ${n} scheduled website change(s)`)
  }
}

export const config = {
  name: "publish-scheduled-website-changes",
  schedule: "* * * * *",
}
