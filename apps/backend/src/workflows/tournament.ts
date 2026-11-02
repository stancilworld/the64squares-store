import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { TOURNAMENT_MODULE } from "../modules/tournament"
import TournamentModuleService from "../modules/tournament/service"
import { newTicketCode, registrationState } from "../lib/tournaments"

type Row = Record<string, any>

export type TournamentInput = {
  title?: string
  handle?: string
  summary?: string | null
  description?: string
  format?: "arena" | "swiss" | "round_robin" | "knockout"
  mode?: "online" | "offline"
  time_control?: string
  rounds?: number | null
  starts_at?: string | Date
  ends_at?: string | Date | null
  registration_closes_at?: string | Date | null
  venue?: string | null
  capacity?: number | null
  entry_fee?: number
  rating_min?: number | null
  rating_max?: number | null
  prizes?: string | null
  rules?: string | null
  image_url?: string | null
  status?: "draft" | "published" | "cancelled" | "completed"
}

const service = (container: { resolve: (k: string) => unknown }) =>
  container.resolve(TOURNAMENT_MODULE) as TournamentModuleService

const stripMeta = (row: Row) => {
  const { created_at, updated_at, deleted_at, registrations, ...data } = row
  return data
}

// ---------------------------------------------------------------- tournaments

const createTournamentStep = createStep(
  "create-tournament",
  async (input: TournamentInput, { container }) => {
    const t = await service(container).createTournaments(input as never)
    return new StepResponse(t, t.id)
  },
  async (id, { container }) => {
    if (id) await service(container).deleteTournaments(id)
  }
)

const updateTournamentStep = createStep(
  "update-tournament",
  async (input: { id: string; data: TournamentInput }, { container }) => {
    const s = service(container)
    const previous = await s.retrieveTournament(input.id)
    const t = await s.updateTournaments({ id: input.id, ...input.data } as never)
    return new StepResponse(t, previous)
  },
  async (previous, { container }) => {
    if (previous) await service(container).updateTournaments(stripMeta(previous as Row) as never)
  }
)

const deleteTournamentStep = createStep(
  "delete-tournament",
  async (id: string, { container }) => {
    await service(container).softDeleteTournaments(id)
    return new StepResponse({ id }, id)
  },
  async (id, { container }) => {
    if (id) await service(container).restoreTournaments(id)
  }
)

export const createTournamentWorkflow = createWorkflow("create-tournament", (input: TournamentInput) => {
  return new WorkflowResponse(createTournamentStep(input))
})

export const updateTournamentWorkflow = createWorkflow(
  "update-tournament",
  (input: { id: string; data: TournamentInput }) => {
    return new WorkflowResponse(updateTournamentStep(input))
  }
)

export const deleteTournamentWorkflow = createWorkflow("delete-tournament", (id: string) => {
  return new WorkflowResponse(deleteTournamentStep(id))
})

// ---------------------------------------------------------------- registration

export type RegisterInput = {
  tournament_id: string
  customer_id: string
  email: string
  player_name: string
  phone?: string | null
  fide_id?: string | null
  rating?: number | null
  city?: string | null
}

type Undo = { created?: string; reopened?: Row }

type Registered = { registration: Row; isNew: boolean }

const registerForTournamentStep = createStep(
  "register-for-tournament",
  async (input: RegisterInput, { container }) => {
    const s = service(container)
    const locking = container.resolve(Modules.LOCKING)
    // One registration at a time per tournament, so the last place can't be given twice.
    const out = await locking.execute(`tournament-register:${input.tournament_id}`, async (): Promise<{ result: Registered; undo: Undo }> => {
      const t = (await s.retrieveTournament(input.tournament_id)) as Row
      const [mine] = (await s.listTournamentRegistrations({ tournament_id: t.id, customer_id: input.customer_id })) as Row[]
      if (mine?.status === "confirmed") {
        // Already registered: nothing to do, the same ticket stands.
        return { result: { registration: mine, isNew: false }, undo: {} }
      }
      const confirmed = await s.listTournamentRegistrations({ tournament_id: t.id, status: "confirmed" }, { select: ["id"] })
      const state = registrationState(t, confirmed.length)
      if (!state.open) {
        throw new MedusaError(MedusaError.Types.NOT_ALLOWED, state.reason ?? "Registration is closed.")
      }
      if (t.rating_min != null || t.rating_max != null) {
        if (input.rating == null) {
          throw new MedusaError(MedusaError.Types.INVALID_DATA, "This tournament has a rating limit. Please enter your rating.")
        }
        if (t.rating_min != null && input.rating < t.rating_min) {
          throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `This tournament is for players rated ${t.rating_min} and above.`)
        }
        if (t.rating_max != null && input.rating > t.rating_max) {
          throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `This tournament is for players rated ${t.rating_max} and below.`)
        }
      }
      const details = {
        player_name: input.player_name,
        email: input.email,
        phone: input.phone ?? null,
        fide_id: input.fide_id ?? null,
        rating: input.rating ?? null,
        city: input.city ?? null,
      }
      if (mine) {
        // Registered before and cancelled: the same ticket comes back to life.
        const r = await s.updateTournamentRegistrations({ id: mine.id, ...details, status: "confirmed", checked_in_at: null } as never)
        return { result: { registration: r as Row, isNew: true }, undo: { reopened: stripMeta(mine) } }
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newTicketCode()
        const [taken] = await s.listTournamentRegistrations({ ticket_code: code }, { select: ["id"], withDeleted: true })
        if (taken) continue
        const r = await s.createTournamentRegistrations({
          tournament_id: t.id,
          customer_id: input.customer_id,
          ticket_code: code,
          ...details,
        } as never)
        return { result: { registration: r as Row, isNew: true }, undo: { created: (r as Row).id } }
      }
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Could not make a ticket. Please try again.")
    })
    return new StepResponse(out.result, out.undo)
  },
  async (undo, { container }) => {
    if (!undo) return
    const s = service(container)
    if (undo.created) await s.deleteTournamentRegistrations(undo.created)
    if (undo.reopened) await s.updateTournamentRegistrations(undo.reopened as never)
  }
)

export const registerForTournamentWorkflow = createWorkflow("register-for-tournament", (input: RegisterInput) => {
  return new WorkflowResponse(registerForTournamentStep(input))
})

// A player cancels their own place (before the start), or staff cancel or restore one.
const setRegistrationStatusStep = createStep(
  "set-registration-status",
  async (input: { id: string; status: "confirmed" | "cancelled"; by: "player" | "staff" }, { container }) => {
    const s = service(container)
    const previous = (await s.retrieveTournamentRegistration(input.id, { relations: ["tournament"] })) as Row
    if (input.by === "player" && new Date(previous.tournament.starts_at).getTime() <= Date.now()) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This tournament has already started.")
    }
    const r = await s.updateTournamentRegistrations({ id: input.id, status: input.status } as never)
    return new StepResponse(r as Row, { id: input.id, status: previous.status as string })
  },
  async (previous, { container }) => {
    if (previous) await service(container).updateTournamentRegistrations(previous as never)
  }
)

export const setRegistrationStatusWorkflow = createWorkflow(
  "set-registration-status",
  (input: { id: string; status: "confirmed" | "cancelled"; by: "player" | "staff" }) => {
    return new WorkflowResponse(setRegistrationStatusStep(input))
  }
)

// Staff check a player in at the door (or undo it).
const checkInPlayerStep = createStep(
  "check-in-player",
  async (input: { id: string; undo?: boolean }, { container }) => {
    const s = service(container)
    const previous = (await s.retrieveTournamentRegistration(input.id)) as Row
    if (!input.undo && previous.status !== "confirmed") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This ticket was cancelled.")
    }
    const r = await s.updateTournamentRegistrations({
      id: input.id,
      checked_in_at: input.undo ? null : previous.checked_in_at ?? new Date(),
    } as never)
    return new StepResponse(r as Row, { id: input.id, checked_in_at: previous.checked_in_at ?? null })
  },
  async (previous, { container }) => {
    if (previous) await service(container).updateTournamentRegistrations(previous as never)
  }
)

export const checkInPlayerWorkflow = createWorkflow("check-in-player", (input: { id: string; undo?: boolean }) => {
  return new WorkflowResponse(checkInPlayerStep(input))
})
