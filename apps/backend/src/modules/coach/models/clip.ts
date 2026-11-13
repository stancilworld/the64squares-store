import { model } from "@medusajs/framework/utils"

// A sentence the coach has said, in one voice: made once with ElevenLabs, then reused.
const CoachClip = model
  .define("coach_clip", {
    id: model.id({ prefix: "cclip" }).primaryKey(),
    // sha256 of voice, model and text.
    hash: model.text(),
    voice_id: model.text(),
    text: model.text(),
    url: model.text(),
    chars: model.number(),
    plays: model.number().default(0),
  })
  .indexes([{ on: ["hash"], unique: true, where: "deleted_at IS NULL" }])

export default CoachClip
