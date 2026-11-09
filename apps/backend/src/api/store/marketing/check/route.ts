import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { secretsOf } from "../../../../lib/marketing/engine"
import { fromStore } from "../../../../lib/marketing/limit"
import { MARKETING_SETTINGS_KEY, type Integration, type MarketingSettings, fingerprintOf, loadMarketingSettings } from "../../../../lib/marketing/settings"
import { saveSettingWorkflow } from "../../../../workflows/setting"
import type { TagCheckBodyType } from "../../../admin/validators"

const PASS: Record<string, string> = {
  meta_pixel: "The Pixel loaded on your website. Open Meta Events Manager → Test events to watch events arrive.",
  ga4: "Google Analytics loaded on your website. Open Reports → Realtime in Google Analytics to watch visits arrive.",
  google_ads: "The Google Ads tag loaded on your website. Conversions show in Google Ads after the first order.",
  gtm: "Your Google Tag Manager container loaded on your website.",
  clarity: "Microsoft Clarity loaded on your website. Recordings show in Clarity within about two hours.",
  pinterest: "The Pinterest Tag loaded on your website. Check Ads → Conversions → Event history in Pinterest.",
  snapchat: "The Snap Pixel loaded on your website. Check Events Manager → your Pixel → Event activity in Snapchat.",
  microsoft_ads: "The UET tag loaded on your website. Microsoft Advertising shows the tag as active within a day.",
  linkedin: "The LinkedIn Insight Tag loaded on your website. Campaign Manager shows it as active within a day.",
}

// POST /store/marketing/check: the website reports whether each tag under test loaded.
// Only accepted with the one-time code of a test started in the admin.
export const POST = async (req: MedusaRequest<TagCheckBodyType>, res: MedusaResponse) => {
  if (!fromStore(req.headers.origin)) return res.status(403).json({ message: "Not allowed." })
  const { nonce, results } = req.validatedBody
  const s = await loadMarketingSettings(req.scope)
  const secrets = await secretsOf(req.scope)
  const next: MarketingSettings = { ...s, checks: { ...s.checks }, pending_checks: { ...s.pending_checks } }
  let matched = 0
  for (const [i, r] of Object.entries(results) as [Integration, { ok: boolean; detail?: string }][]) {
    const p = s.pending_checks[i]
    if (!p || p.nonce !== nonce || Date.now() - new Date(p.at).getTime() > 10 * 60_000) continue
    matched++
    next.checks[i] = {
      ok: r.ok,
      at: new Date().toISOString(),
      // The server half of the same test (when it has one) is reported too.
      message: r.ok ? `${p.note ? `${p.note.trim()} ` : ""}${PASS[i]}` : `The tag did not load on your website${r.detail ? ` (${r.detail})` : ""}. Check the ID, and that an ad blocker isn't on in the browser you tested with.`,
      fingerprint: fingerprintOf(s, i, secrets),
    }
    delete next.pending_checks[i]
  }
  if (!matched) return res.status(404).json({ message: "This test has ended. Start it again in the admin." })
  await saveSettingWorkflow(req.scope).run({ input: { key: MARKETING_SETTINGS_KEY, value: next as unknown as Record<string, unknown> } })
  res.json({ ok: true })
}
