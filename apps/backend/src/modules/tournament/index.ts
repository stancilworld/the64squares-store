import { Module } from "@medusajs/framework/utils"
import TournamentModuleService from "./service"

export const TOURNAMENT_MODULE = "tournament"

export default Module(TOURNAMENT_MODULE, {
  service: TournamentModuleService,
})
