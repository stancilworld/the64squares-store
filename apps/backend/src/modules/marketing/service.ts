import { MedusaService } from "@medusajs/framework/utils"
import MarketingContext from "./models/marketing-context"
import MarketingDelivery from "./models/marketing-delivery"
import MarketingEvent from "./models/marketing-event"

class MarketingModuleService extends MedusaService({
  MarketingEvent,
  MarketingDelivery,
  MarketingContext,
}) {}

export default MarketingModuleService
