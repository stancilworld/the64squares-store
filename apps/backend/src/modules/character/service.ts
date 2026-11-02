import { MedusaService } from "@medusajs/framework/utils"
import Character from "./models/character"

class CharacterModuleService extends MedusaService({
  Character,
}) {}

export default CharacterModuleService
