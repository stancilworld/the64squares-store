import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import OtpAuthService from "./service"

export default ModuleProvider(Modules.AUTH, {
  services: [OtpAuthService],
})
