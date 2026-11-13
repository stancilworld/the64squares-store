import { MedusaService } from "@medusajs/framework/utils"
import ShowcaseAd from "./models/ad"
import ShowcaseAsset from "./models/asset"
import ShowcaseClaim from "./models/claim"

// The Play screen's advert window: the adverts, the library of uploaded art they can show,
// and the rewards players have claimed from them. See lib/showcase.ts.
class ShowcaseModuleService extends MedusaService({ ShowcaseAd, ShowcaseAsset, ShowcaseClaim }) {}

export default ShowcaseModuleService
