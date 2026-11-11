import { MedusaService } from "@medusajs/framework/utils"
import NotFound from "./models/not-found"
import Redirect from "./models/redirect"
import SeoMeta from "./models/seo-meta"

class SeoModuleService extends MedusaService({
  SeoMeta,
  Redirect,
  NotFound,
}) {}

export default SeoModuleService
