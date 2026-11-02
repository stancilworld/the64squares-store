import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import DynamicGoogleAuthService from "./service"

export default ModuleProvider(Modules.AUTH, {
  services: [DynamicGoogleAuthService as never],
})
