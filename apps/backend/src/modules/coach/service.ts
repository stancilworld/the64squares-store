import { MedusaService } from "@medusajs/framework/utils"
import CoachClip from "./models/clip"
import CoachUsage from "./models/usage"

// The game review coach's voice: each spoken sentence, made once and kept, and how many
// characters each player used a day (lib/coach-voice.ts).
class CoachModuleService extends MedusaService({ CoachClip, CoachUsage }) {}

export default CoachModuleService
