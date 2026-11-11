import { MedusaService } from "@medusajs/framework/utils"
import EmailLog from "./models/email-log"
import PushSend from "./models/push-send"
import PushSubscription from "./models/push-subscription"
import Referral from "./models/referral"
import StockAlert from "./models/stock-alert"

class AutomationModuleService extends MedusaService({ StockAlert, EmailLog, Referral, PushSubscription, PushSend }) {}

export default AutomationModuleService
