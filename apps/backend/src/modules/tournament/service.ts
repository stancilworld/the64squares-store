import { MedusaService } from "@medusajs/framework/utils"
import Registration from "./models/registration"
import Tournament from "./models/tournament"

class TournamentModuleService extends MedusaService({
  Tournament,
  TournamentRegistration: Registration,
}) {}

export default TournamentModuleService
