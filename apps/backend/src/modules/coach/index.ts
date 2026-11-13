import { Module } from "@medusajs/framework/utils"
import CoachModuleService from "./service"

export const COACH_MODULE = "coach"

export default Module(COACH_MODULE, { service: CoachModuleService })
