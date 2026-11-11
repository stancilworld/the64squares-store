import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { IDEAS_KEY, type Idea, newIdeaId } from "../../../../lib/content-hub"
import { saveSettingWorkflow } from "../../../../workflows/setting"
import type { ContentIdeasBodyType } from "../../validators"

// POST /admin/content-hub/ideas { ideas }: the whole list of ideas, as edited.
export const POST = async (req: AuthenticatedMedusaRequest<ContentIdeasBodyType>, res: MedusaResponse) => {
  const now = new Date().toISOString()
  const ideas: Idea[] = req.validatedBody.ideas.map((i) => ({
    id: i.id && /^idea_[a-f0-9]{12}$/.test(i.id) ? i.id : newIdeaId(),
    title: i.title,
    notes: i.notes ?? "",
    date: i.date ?? null,
    kind: i.kind,
    status: i.status,
    source: i.source ?? null,
    created_at: i.created_at ?? now,
  }))
  await saveSettingWorkflow(req.scope).run({ input: { key: IDEAS_KEY, value: { ideas } } })
  res.json({ ideas })
}
