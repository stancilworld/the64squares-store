import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getServiceKeys } from "../../../../lib/service-keys"
import { speakCoachWorkflow } from "../../../../workflows/coach"

// POST /store/coach/voice { text }: the game review coach saying a sentence, for a signed-in
// player. Answers { url } (an MP3), or { url: null } when there's no voice to use (none set up,
// today's allowance used, ElevenLabs unreachable): the website then uses the browser's voice.
export const POST = async (req: AuthenticatedMedusaRequest<{ text: string }>, res: MedusaResponse) => {
  const { voice } = await getServiceKeys(req.scope)
  if (!voice) return res.json({ url: null })
  try {
    const { result } = await speakCoachWorkflow(req.scope).run({ input: { customer_id: req.auth_context.actor_id, text: req.validatedBody.text, voice } })
    res.json({ url: result.url })
  } catch (e) {
    const message = (e as Error).message
    if (!/resting for today/.test(message)) req.scope.resolve(ContainerRegistrationKeys.LOGGER).warn(`Coach voice: ${message}`)
    res.json({ url: null, note: /resting for today/.test(message) ? message : undefined })
  }
}
