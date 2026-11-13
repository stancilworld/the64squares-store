import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { clipHash, DAILY_CHARS, indiaDay, synthesize, type VoiceKeys } from "../lib/coach-voice"
import { COACH_MODULE } from "../modules/coach"
import type CoachModuleService from "../modules/coach/service"

// The coach saying a sentence: the kept clip if there is one, otherwise a new one from
// ElevenLabs (within the player's daily allowance), kept for next time.

// limit: characters a day for this customer (the coach's default, or live commentary's).
type Input = { customer_id: string; text: string; voice: VoiceKeys; limit?: number }
type Row = Record<string, any>

const cs = (c: { resolve: (k: string) => unknown }) => c.resolve(COACH_MODULE) as CoachModuleService

const speakCoachStep = createStep(
  "speak-coach",
  async (input: Input, { container }) => {
    const s = cs(container)
    const hash = clipHash(input.voice, input.text)
    const [kept] = (await s.listCoachClips({ hash })) as Row[]
    if (kept) {
      await s.updateCoachClips({ id: kept.id, plays: (kept.plays ?? 0) + 1 } as never)
      return new StepResponse({ url: kept.url as string, made: false }, null)
    }
    const day = indiaDay()
    const [use] = (await s.listCoachUsages({ customer_id: input.customer_id, day })) as Row[]
    if ((use?.chars ?? 0) + input.text.length > (input.limit ?? DAILY_CHARS)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The coach's voice is resting for today. You'll hear your browser's voice until tomorrow.")
    }
    const audio = await synthesize(input.voice, input.text)
    const { result } = await uploadFilesWorkflow(container).run({
      input: { files: [{ filename: `coach-${hash.slice(0, 16)}.mp3`, mimeType: "audio/mpeg", content: audio.toString("base64"), access: "public" }] },
    })
    const url = result[0].url
    let clip: Row
    try {
      clip = (await s.createCoachClips({ hash, voice_id: input.voice.voiceId, text: input.text, url, chars: input.text.length, plays: 1 } as never)) as Row
    } catch {
      // Made at the same moment by another player: use theirs.
      const [other] = (await s.listCoachClips({ hash })) as Row[]
      return new StepResponse({ url: other.url as string, made: false }, null)
    }
    if (use) await s.updateCoachUsages({ id: use.id, chars: use.chars + input.text.length } as never)
    else await s.createCoachUsages({ customer_id: input.customer_id, day, chars: input.text.length } as never)
    return new StepResponse({ url, made: true }, clip.id as string)
  }
)

export const speakCoachWorkflow = createWorkflow("speak-coach", (input: Input) => new WorkflowResponse(speakCoachStep(input)))
