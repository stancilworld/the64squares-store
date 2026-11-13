import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { SHOWCASE_MODULE } from "../modules/showcase"
import type ShowcaseModuleService from "../modules/showcase/service"
import { type Action, assetIds, loadDefault, rewardText, stateOf, type Visual } from "../lib/showcase"
import { grantPassesStep } from "./tournament-results"

// Adverts for the website's advert windows: saving, ordering and removing them, the library
// of uploaded art, counting views and clicks, and players claiming rewards.

type Row = Record<string, any>
type C = { resolve: (k: string) => unknown }
type Pg = { raw: (q: string, b?: unknown[]) => Promise<{ rows: Row[] }> }

const sv = (c: C) => c.resolve(SHOWCASE_MODULE) as ShowcaseModuleService
const pg = (c: C) => c.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Pg

const AD_FIELDS = [
  "name", "status", "placement", "rank", "starts_at", "ends_at", "audience", "visual", "tag", "headline", "body",
  "theme", "align", "position", "scrim", "countdown_to", "countdown_label", "action", "max_claims",
] as const

export type AdInput = Partial<Record<(typeof AD_FIELDS)[number], unknown>>

// Every asset an advert points to must be in the library.
const checkAssets = async (c: C, visual: unknown) => {
  const ids = assetIds(visual as Visual)
  if (!ids.length) return
  const found = await sv(c).listShowcaseAssets({ id: ids })
  if (found.length !== new Set(ids).size) throw new MedusaError(MedusaError.Types.INVALID_DATA, "That picture or video isn't in the library any more. Choose another.")
}

// ---------------------------------------------------------------- adverts

const createShowcaseAdStep = createStep(
  "create-showcase-ad",
  async (input: AdInput, { container }) => {
    await checkAssets(container, input.visual)
    const s = sv(container)
    // New adverts go last.
    const [last] = (await s.listShowcaseAds({ placement: (input.placement as string) ?? "play_hero" }, { take: 1, order: { rank: "DESC" } })) as Row[]
    const ad = await s.createShowcaseAds({ ...(input as Row), action: input.action ?? { kind: "none" }, rank: (last?.rank ?? -1) + 1 } as never)
    return new StepResponse(ad as Row, (ad as Row).id as string)
  },
  async (id, { container }) => {
    if (id) await sv(container).deleteShowcaseAds(id)
  }
)
export const createShowcaseAdWorkflow = createWorkflow("create-showcase-ad", (input: AdInput) => new WorkflowResponse(createShowcaseAdStep(input)))

const updateShowcaseAdStep = createStep(
  "update-showcase-ad",
  async (input: { id: string } & AdInput, { container }) => {
    const s = sv(container)
    const before = (await s.retrieveShowcaseAd(input.id)) as Row
    if (input.visual !== undefined) await checkAssets(container, input.visual)
    const ad = await s.updateShowcaseAds(input as never)
    return new StepResponse(ad as Row, Object.fromEntries([["id", before.id], ...AD_FIELDS.map((k) => [k, before[k]])]))
  },
  async (before, { container }) => {
    if (before) await sv(container).updateShowcaseAds(before as never)
  }
)
export const updateShowcaseAdWorkflow = createWorkflow("update-showcase-ad", (input: { id: string } & AdInput) => new WorkflowResponse(updateShowcaseAdStep(input)))

const deleteShowcaseAdStep = createStep(
  "delete-showcase-ad",
  async (id: string, { container }) => {
    await sv(container).softDeleteShowcaseAds(id)
    return new StepResponse(id, id)
  },
  async (id, { container }) => {
    if (id) await sv(container).restoreShowcaseAds(id)
  }
)
export const deleteShowcaseAdWorkflow = createWorkflow("delete-showcase-ad", (id: string) => new WorkflowResponse(deleteShowcaseAdStep(id)))

// The order adverts take turns in: ids first to last.
const orderShowcaseAdsStep = createStep(
  "order-showcase-ads",
  async (ids: string[], { container }) => {
    const s = sv(container)
    const before = ((await s.listShowcaseAds({ id: ids })) as Row[]).map((a) => ({ id: a.id as string, rank: a.rank as number }))
    await s.updateShowcaseAds(ids.map((id, rank) => ({ id, rank })) as never)
    return new StepResponse(ids.length, before)
  },
  async (before, { container }) => {
    if (before?.length) await sv(container).updateShowcaseAds(before as never)
  }
)
export const orderShowcaseAdsWorkflow = createWorkflow("order-showcase-ads", (ids: string[]) => new WorkflowResponse(orderShowcaseAdsStep(ids)))

// ---------------------------------------------------------------- library

export type AssetInput = { name: string; kind: "image" | "video"; url: string; poster_url?: string | null; mime?: string | null; size?: number | null; width?: number | null; height?: number | null }

const createShowcaseAssetStep = createStep(
  "create-showcase-asset",
  async (input: AssetInput, { container }) => {
    const a = (await sv(container).createShowcaseAssets(input as never)) as Row
    return new StepResponse(a, a.id as string)
  },
  async (id, { container }) => {
    if (id) await sv(container).deleteShowcaseAssets(id)
  }
)
export const createShowcaseAssetWorkflow = createWorkflow("create-showcase-asset", (input: AssetInput) => new WorkflowResponse(createShowcaseAssetStep(input)))

const updateShowcaseAssetStep = createStep(
  "update-showcase-asset",
  async (input: { id: string; name?: string; poster_url?: string | null }, { container }) => {
    const s = sv(container)
    const before = (await s.retrieveShowcaseAsset(input.id)) as Row
    const a = await s.updateShowcaseAssets(input as never)
    return new StepResponse(a as Row, { id: before.id, name: before.name, poster_url: before.poster_url })
  },
  async (before, { container }) => {
    if (before) await sv(container).updateShowcaseAssets(before as never)
  }
)
export const updateShowcaseAssetWorkflow = createWorkflow("update-showcase-asset", (input: { id: string; name?: string; poster_url?: string | null }) => new WorkflowResponse(updateShowcaseAssetStep(input)))

// Art still used by an advert (that hasn't been deleted) or by the default screen stays.
const deleteShowcaseAssetStep = createStep(
  "delete-showcase-asset",
  async (id: string, { container }) => {
    const s = sv(container)
    const ads = (await s.listShowcaseAds({}, { take: 1000 })) as Row[]
    const user = ads.find((a) => assetIds(a.visual).includes(id))
    if (user) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `"${user.name}" uses this. Change or delete that advert first.`)
    if (assetIds(await loadDefault(container as never)).includes(id)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This is the default screen. Choose another default first.")
    await s.softDeleteShowcaseAssets(id)
    return new StepResponse(id, id)
  },
  async (id, { container }) => {
    if (id) await sv(container).restoreShowcaseAssets(id)
  }
)
export const deleteShowcaseAssetWorkflow = createWorkflow("delete-showcase-asset", (id: string) => new WorkflowResponse(deleteShowcaseAssetStep(id)))

// ---------------------------------------------------------------- views and clicks

const countShowcaseStep = createStep("count-showcase", async (input: { id: string; what: "views" | "clicks" }, { container }) => {
  const col = input.what === "views" ? "views" : "clicks"
  await pg(container).raw(`update showcase_ad set ${col} = ${col} + 1 where id = ? and deleted_at is null`, [input.id])
  return new StepResponse(true)
})
export const countShowcaseWorkflow = createWorkflow("count-showcase", (input: { id: string; what: "views" | "clicks" }) => new WorkflowResponse(countShowcaseStep(input)))

// ---------------------------------------------------------------- claiming

export type ClaimInput = { ad_id: string; customer_id: string }
type Given = { kind: "coupon"; code: string } | { kind: "xp_boost"; factor: number; until: string } | { kind: "passes"; count: number }

// Checks the advert can be claimed now by this player and records the claim. Claiming again
// gives the same answer (a coupon's code, the boost's end) without giving anything twice.
const recordShowcaseClaimStep = createStep(
  "record-showcase-claim",
  async (input: ClaimInput, { container }) => {
    const s = sv(container)
    const [ad] = (await s.listShowcaseAds({ id: input.ad_id })) as Row[]
    if (!ad || stateOf(ad) !== "live") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This offer has ended.")
    if (ad.audience === "guests") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This offer is for new players.")
    const action = ad.action as Action
    if (action.kind !== "reward" && action.kind !== "coupon") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "There's nothing to claim here.")
    const [had] = (await s.listShowcaseClaims({ ad_id: ad.id, customer_id: input.customer_id })) as Row[]
    if (had) return new StepResponse({ given: had.reward as Given, again: true, ad }, null)
    if (action.kind === "reward" && ad.max_claims) {
      const [, n] = await s.listAndCountShowcaseClaims({ ad_id: ad.id }, { take: 1 })
      if (n >= ad.max_claims) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "All of these have been claimed.")
    }
    const given: Given =
      action.kind === "coupon"
        ? { kind: "coupon", code: action.code }
        : action.reward.type === "xp_boost"
          ? { kind: "xp_boost", factor: action.reward.factor, until: new Date(Date.now() + action.reward.hours * 3600_000).toISOString() }
          : { kind: "passes", count: action.reward.count }
    let claim: Row
    try {
      claim = (await s.createShowcaseClaims({ ad_id: ad.id, customer_id: input.customer_id, reward: given } as never)) as Row
    } catch {
      // Claimed at the same moment from another tab.
      const [c] = (await s.listShowcaseClaims({ ad_id: ad.id, customer_id: input.customer_id })) as Row[]
      return new StepResponse({ given: c.reward as Given, again: true, ad }, null)
    }
    return new StepResponse({ given, again: false, ad }, claim.id as string)
  },
  async (id, { container }) => {
    if (id) await sv(container).deleteShowcaseClaims(id)
  }
)

// 2x XP and the like: the game server multiplies XP while a boost is on (play.xp_boost).
const grantXpBoostStep = createStep(
  "grant-xp-boost",
  async (input: { customer_id: string; ad_id: string; given: Given; again: boolean }, { container }) => {
    if (input.again || input.given.kind !== "xp_boost") return new StepResponse(false, null)
    const db = pg(container)
    const { rows } = await db.raw("select to_regclass('play.xp_boost') as t")
    if (!rows[0]?.t) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "XP boosts aren't ready yet. Try again in a minute.")
    await db.raw("insert into play.xp_boost (player_id, factor, ends_at, source) values (?, ?, ?, ?)", [input.customer_id, input.given.factor, input.given.until, `ad:${input.ad_id}`])
    return new StepResponse(true, { customer_id: input.customer_id, source: `ad:${input.ad_id}` })
  },
  async (undo, { container }) => {
    if (undo) await pg(container).raw("delete from play.xp_boost where player_id = ? and source = ?", [undo.customer_id, undo.source])
  }
)

export const claimShowcaseWorkflow = createWorkflow("claim-showcase", (input: ClaimInput) => {
  const claim = recordShowcaseClaimStep(input)
  grantXpBoostStep(transform({ input, claim }, ({ input, claim }) => ({ customer_id: input.customer_id, ad_id: input.ad_id, given: claim.given, again: claim.again })))
  grantPassesStep(
    transform({ input, claim }, ({ input, claim }) =>
      claim.given.kind === "passes" && !claim.again
        ? [{ customer_id: input.customer_id, delta: claim.given.count, reason: "admin" as const, ref: `ad:${input.ad_id}`, note: `Offer: ${claim.ad.headline || claim.ad.name}` }]
        : []
    )
  )
  return new WorkflowResponse(
    transform({ claim }, ({ claim }) => {
      const g = claim.given
      return {
        given: g,
        again: claim.again,
        message:
          g.kind === "coupon"
            ? `Your code: ${g.code}`
            : g.kind === "passes"
              ? `${rewardText({ type: "passes", count: g.count })} added to your account.`
              : `${g.factor}x XP is on until ${new Date(g.until).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}.`,
      }
    })
  )
})
