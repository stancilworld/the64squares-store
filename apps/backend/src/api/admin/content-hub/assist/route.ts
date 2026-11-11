import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { write } from "../../../../lib/ai-writer"
import type { ContentAssistBodyType } from "../../validators"

// POST /admin/content-hub/assist { task, topic, keyword?, text? }: a draft from the AI helper.
export const POST = async (req: AuthenticatedMedusaRequest<ContentAssistBodyType>, res: MedusaResponse) => {
  const b = req.validatedBody
  const r = await write(req.scope, b.task, b.topic, b.keyword ?? "", b.text ?? "")
  if (!r.ok) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      r.reason === "no-keys" ? "No AI key yet. Add a free Groq or Google Gemini key in Settings → Payments & delivery → Keys." : "The AI didn't answer (its free allowance may be used up). Try again in a few minutes."
    )
  }
  res.json({ text: r.text, provider: r.provider })
}
