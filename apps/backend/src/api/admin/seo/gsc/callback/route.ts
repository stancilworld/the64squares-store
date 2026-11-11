import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { checkState, exchangeCode, GSC_SETTING } from "../../../../../lib/search-console"
import { saveSettingWorkflow } from "../../../../../workflows/setting"

// GET /admin/seo/gsc/callback: Google sends the admin back here after they allow access.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const back = (q: string) => res.redirect(`/app/seo?gsc=${q}`)
  const { code, state, error } = req.query as Record<string, string | undefined>
  if (error || !code || !state) return back("cancelled")
  if (!checkState(state, req.auth_context.actor_id)) return back("expired")
  try {
    const { sites: _sites, ...stored } = await exchangeCode(req.scope, code)
    await saveSettingWorkflow(req.scope).run({ input: { key: GSC_SETTING, value: stored } })
    return back("connected")
  } catch (e) {
    return back(`error&message=${encodeURIComponent((e as Error).message.slice(0, 200))}`)
  }
}
