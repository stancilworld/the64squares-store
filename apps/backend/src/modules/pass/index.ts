import { Module } from "@medusajs/framework/utils"
import PassModuleService from "./service"

export const PASS_MODULE = "pass"

export default Module(PASS_MODULE, { service: PassModuleService })
