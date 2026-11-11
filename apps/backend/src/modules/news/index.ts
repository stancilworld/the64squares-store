import { Module } from "@medusajs/framework/utils"
import NewsModuleService from "./service"

export const NEWS_MODULE = "news"

export default Module(NEWS_MODULE, {
  service: NewsModuleService,
})
