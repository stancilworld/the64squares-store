import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { PASS_MODULE } from "../modules/pass"
import type PassModuleService from "../modules/pass/service"

// Tournament Pass wallet changes. Each award with a `ref` happens once per player.

const svc = (c: { resolve: (k: string) => unknown }) => c.resolve(PASS_MODULE) as PassModuleService

export type PassChange = {
  customer_id: string
  delta: number
  reason: "welcome" | "games" | "puzzles" | "referral" | "completed" | "admin" | "join" | "refund" | "removed"
  ref?: string | null
  note?: string | null
  created_by?: string | null
}

export const changePassesStep = createStep(
  "change-passes",
  async (input: PassChange, { container }) => {
    const s = svc(container)
    if (input.ref) {
      const [done] = await s.listPassEntries({ customer_id: input.customer_id, ref: input.ref }, { take: 1 })
      if (done) return new StepResponse({ entry: done, created: false }, null)
    }
    if (input.delta < 0 && (await s.balanceOf(input.customer_id)) + input.delta < 0) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, input.reason === "join" ? "You don't have a Tournament Pass. Play rated games or solve daily puzzles to earn one." : "The player doesn't have that many passes.")
    }
    const entry = await s.createPassEntries({
      customer_id: input.customer_id,
      delta: input.delta,
      reason: input.reason,
      ref: input.ref ?? null,
      note: input.note ?? null,
      created_by: input.created_by ?? null,
    })
    return new StepResponse({ entry, created: true }, entry.id)
  },
  async (id, { container }) => {
    if (id) await svc(container).deletePassEntries(id)
  }
)

export const changePassesWorkflow = createWorkflow("change-passes", (input: PassChange) => {
  return new WorkflowResponse(changePassesStep(input))
})
