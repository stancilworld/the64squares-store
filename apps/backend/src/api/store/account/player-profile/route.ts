import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INDIAN_STATES, loadPlayer } from "../../../../lib/player-profile"
import { subscribeWorkflow } from "../../../../workflows/subscribe"
import { savePlayerProfileWorkflow } from "../../../../workflows/player-profile"
import type { PlayerProfileBodyType } from "../../../admin/validators"

const view = (x: Awaited<ReturnType<typeof loadPlayer>>) => ({
  first_name: x.customer.first_name ?? "",
  last_name: x.customer.last_name ?? "",
  dob: x.player.dob,
  city: x.player.city,
  state: x.player.state,
  guardian_name: x.player.guardian?.name ?? null,
  guardian_phone: x.player.guardian?.phone ?? null,
  guardian_consent: !!x.player.guardian?.consent_at,
  terms: !!x.player.terms_at,
  age: x.age,
  missing: x.missing,
  complete: !x.missing.length,
  states: INDIAN_STATES,
})

// GET /store/account/player-profile: what the player has told us for tournaments.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ profile: view(await loadPlayer(req.scope, req.auth_context.actor_id)) })
}

// POST /store/account/player-profile: "Almost done" (name, birthday, place, consents).
export const POST = async (req: AuthenticatedMedusaRequest<PlayerProfileBodyType>, res: MedusaResponse) => {
  const b = req.validatedBody
  await savePlayerProfileWorkflow(req.scope).run({
    input: {
      customer_id: req.auth_context.actor_id,
      first_name: b.first_name,
      last_name: b.last_name,
      dob: b.dob,
      city: b.city,
      state: b.state,
      guardian_name: b.guardian_name ?? null,
      guardian_phone: b.guardian_phone || null,
      guardian_consent: b.guardian_consent,
      terms: b.terms,
    },
  })
  const x = await loadPlayer(req.scope, req.auth_context.actor_id)
  if (b.marketing && x.customer.email) {
    await subscribeWorkflow(req.scope).run({ input: { email: x.customer.email, source: "tournament" } }).catch(() => {})
  }
  res.json({ profile: view(x) })
}
