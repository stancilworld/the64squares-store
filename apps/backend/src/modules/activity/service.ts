import { MedusaService } from "@medusajs/framework/utils"
import ActivityEntry from "./models/activity-entry"

class ActivityModuleService extends MedusaService({
  ActivityEntry,
}) {}

export default ActivityModuleService
