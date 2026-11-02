import { Module } from "@medusajs/framework/utils"
import CharacterModuleService from "./service"

export const CHARACTER_MODULE = "character"

export default Module(CHARACTER_MODULE, {
  service: CharacterModuleService,
})
