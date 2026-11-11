import { Module } from "@medusajs/framework/utils"
import AutomationModuleService from "./service"

export const AUTOMATION_MODULE = "automation"

export default Module(AUTOMATION_MODULE, {
  service: AutomationModuleService,
})
