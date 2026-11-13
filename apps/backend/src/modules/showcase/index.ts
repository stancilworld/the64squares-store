import { Module } from "@medusajs/framework/utils"
import ShowcaseModuleService from "./service"

export const SHOWCASE_MODULE = "showcase"

export default Module(SHOWCASE_MODULE, { service: ShowcaseModuleService })
