import type { MedusaContainer } from "@medusajs/framework/types"
import { ACTIVITY_MODULE } from "../modules/activity"
import type ActivityModuleService from "../modules/activity/service"

// Keeps the activity log to the last 12 months.
export default async function pruneActivity(container: MedusaContainer) {
  const activity: ActivityModuleService = container.resolve(ACTIVITY_MODULE)
  const cutoff = new Date(Date.now() - 365 * 86_400_000)
  const old = await activity.listActivityEntries({ created_at: { $lt: cutoff } } as never, { select: ["id"], take: 5000 })
  if (old.length) {
    await activity.deleteActivityEntries(old.map((e) => e.id))
  }
}

export const config = {
  name: "prune-activity-log",
  schedule: "30 3 * * *",
}
