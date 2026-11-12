import { MedusaService } from "@medusajs/framework/utils"
import Registration from "./models/registration"
import Tournament from "./models/tournament"
import TournamentVisit from "./models/visit"

class TournamentModuleService extends MedusaService({
  Tournament,
  TournamentRegistration: Registration,
  TournamentVisit,
}) {}

export default TournamentModuleService
