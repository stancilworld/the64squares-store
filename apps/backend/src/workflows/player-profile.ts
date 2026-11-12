import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { ageOn, type PlayerProfile, playerOf } from "../lib/player-profile"

// "Almost done": the player's name and details for tournaments, kept on their account.

export type PlayerProfileInput = {
  customer_id: string
  first_name: string
  last_name: string
  dob: string
  city: string
  state: string
  guardian_name?: string | null
  guardian_phone?: string | null
  guardian_consent?: boolean
  terms: boolean
}

const savePlayerProfileStep = createStep(
  "save-player-profile",
  async (input: PlayerProfileInput, { container }) => {
    const customers = container.resolve(Modules.CUSTOMER)
    const me = await customers.retrieveCustomer(input.customer_id)
    const age = ageOn(input.dob)
    if (age == null || age < 5 || age > 110) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Please check your date of birth.")
    if (!input.terms) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Please accept the tournament rules, fair-play policy and privacy policy.")
    const prev = playerOf(me.metadata as Record<string, unknown> | null)
    let guardian: PlayerProfile["guardian"] = null
    if (age < 18) {
      if (!input.guardian_name?.trim() || !input.guardian_phone?.trim() || !input.guardian_consent) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Players under 18 need a parent or guardian's name, phone number and consent.")
      }
      guardian = {
        name: input.guardian_name.trim(),
        phone: input.guardian_phone.trim(),
        consent_at: prev.guardian?.consent_at && prev.guardian.name === input.guardian_name.trim() ? prev.guardian.consent_at : new Date().toISOString(),
      }
    }
    const player: PlayerProfile = {
      dob: input.dob,
      city: input.city.trim(),
      state: input.state.trim(),
      guardian,
      terms_at: prev.terms_at ?? new Date().toISOString(),
    }
    const before = { first_name: me.first_name, last_name: me.last_name, metadata: me.metadata }
    const updated = await customers.updateCustomers(me.id, {
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      metadata: { ...(me.metadata ?? {}), t64_player: player },
    })
    return new StepResponse(updated, { id: me.id, before })
  },
  async (undo, { container }) => {
    if (undo) await container.resolve(Modules.CUSTOMER).updateCustomers(undo.id, undo.before as never)
  }
)

export const savePlayerProfileWorkflow = createWorkflow("save-player-profile", (input: PlayerProfileInput) => {
  return new WorkflowResponse(savePlayerProfileStep(input))
})

// A new player came from a friend's invite link: remember who invited them, so the friend
// earns a Tournament Pass once they play (lib/pass-earning.ts). Only for new accounts, once.
const setReferredByStep = createStep(
  "set-referred-by",
  async (input: { customer_id: string; inviter_id: string }, { container }) => {
    const customers = container.resolve(Modules.CUSTOMER)
    const me = await customers.retrieveCustomer(input.customer_id)
    const meta = (me.metadata ?? {}) as Record<string, unknown>
    if (meta.t64_referred_by || input.inviter_id === me.id) return new StepResponse({ saved: false }, null)
    if (Date.now() - new Date(me.created_at).getTime() > 3 * 86_400_000) return new StepResponse({ saved: false }, null)
    await customers.updateCustomers(me.id, { metadata: { ...meta, t64_referred_by: input.inviter_id } })
    return new StepResponse({ saved: true }, { id: me.id, metadata: meta })
  },
  async (undo, { container }) => {
    if (undo) await container.resolve(Modules.CUSTOMER).updateCustomers(undo.id, { metadata: undo.metadata })
  }
)

export const setReferredByWorkflow = createWorkflow("set-referred-by", (input: { customer_id: string; inviter_id: string }) => {
  return new WorkflowResponse(setReferredByStep(input))
})
