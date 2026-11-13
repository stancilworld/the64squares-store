// Adverts in the website's advert windows (for now the Play screen's main window).
//
// An advert shows a visual (one of the website's 3D designs, or a picture, GIF or video from
// the advert library), optional words over it, an optional countdown and one action: a link
// to any page, a coupon code to copy, or a reward players claim (2x XP for a day, Tournament
// Passes). Live adverts take turns; when none is on, the window shows its default screen.

import type { MedusaContainer } from "@medusajs/framework/types"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"
import { SHOWCASE_MODULE } from "../modules/showcase"
import type ShowcaseModuleService from "../modules/showcase/service"

// The 3D designs the website can draw. Each is built in the storefront
// (components/showcase/scenes.tsx, same key); add a new design there and here and it shows
// up in the admin's library.
export const SCENES = [
  {
    key: "clash",
    name: "Clash of pieces",
    description: "Pieces thrown up by a clash on a graphite board, in smoke and amber sparks. Turns slowly; follows the pointer.",
    poster: "/play-art/clash-poster.webp",
  },
] as const

export const SCENE_KEYS = SCENES.map((s) => s.key) as [string, ...string[]]

export const PLACEMENTS = [{ key: "play_hero", name: "Play screen, main window" }] as const

export type Visual =
  | { kind: "scene"; scene: string }
  | { kind: "asset"; asset_id: string; mobile_asset_id?: string | null; fit?: "cover" | "contain"; focus?: string }

export type Reward = { type: "xp_boost"; factor: number; hours: number } | { type: "passes"; count: number }

export type Action =
  | { kind: "none" }
  | { kind: "link"; label: string; url: string }
  | { kind: "coupon"; code: string; label?: string; url?: string; members_only?: boolean }
  | { kind: "reward"; label: string; reward: Reward }

export const DEFAULT_KEY = "showcase_default"
export const DEFAULT_VISUAL: Visual = { kind: "scene", scene: "clash" }

type Row = Record<string, any>

export type AdState = "draft" | "paused" | "scheduled" | "live" | "ended"

// Where an advert stands right now.
export const stateOf = (ad: Row, now = Date.now()): AdState => {
  if (ad.status === "draft") return "draft"
  if (ad.status === "paused") return "paused"
  if (ad.ends_at && new Date(ad.ends_at).getTime() <= now) return "ended"
  if (ad.starts_at && new Date(ad.starts_at).getTime() > now) return "scheduled"
  return "live"
}

// Links must stay on the website ("/…") or be a full https address.
export const safeUrl = (url: string) => /^\/(?!\/)/.test(url) || /^https:\/\/[^\s]+$/i.test(url)

export const rewardText = (r: Reward) =>
  r.type === "xp_boost" ? `${r.factor}x XP for ${r.hours} hours` : `${r.count} Tournament ${r.count === 1 ? "Pass" : "Passes"}`

const sv = (c: MedusaContainer) => c.resolve<ShowcaseModuleService>(SHOWCASE_MODULE)

// The asset ids a visual uses.
export const assetIds = (v: Visual | null | undefined) => (v?.kind === "asset" ? [v.asset_id, v.mobile_asset_id].filter((x): x is string => !!x) : [])

export const loadDefault = async (c: MedusaContainer): Promise<Visual> => {
  const content = c.resolve<ContentModuleService>(CONTENT_MODULE)
  const v = (await content.getSettingValue(DEFAULT_KEY))?.visual as Visual | undefined
  return v ?? DEFAULT_VISUAL
}

// What the website gets: a visual with its files' addresses filled in.
const publicVisual = (v: Visual, assets: Map<string, Row>) => {
  if (v.kind === "scene") return { kind: "scene" as const, scene: v.scene }
  const a = assets.get(v.asset_id)
  if (!a) return null
  const m = v.mobile_asset_id ? assets.get(v.mobile_asset_id) : null
  return {
    kind: a.kind as "image" | "video",
    url: a.url as string,
    poster_url: (a.poster_url as string | null) ?? null,
    mobile: m ? { kind: m.kind as "image" | "video", url: m.url as string, poster_url: (m.poster_url as string | null) ?? null } : null,
    fit: v.fit ?? "cover",
    focus: v.focus ?? "50% 50%",
  }
}

// The adverts for one window that are live, or start within a week (the website checks the
// times itself, so a scheduled advert appears on time), and the default screen.
export const publicShowcase = async (c: MedusaContainer, placement: string) => {
  const s = sv(c)
  const now = Date.now()
  const ads = ((await s.listShowcaseAds({ placement, status: "live" }, { take: 50, order: { rank: "ASC", created_at: "ASC" } })) as Row[]).filter((a) => {
    const st = stateOf(a, now)
    return st === "live" || (st === "scheduled" && new Date(a.starts_at).getTime() - now < 7 * 86400_000)
  })
  const fallback = await loadDefault(c)
  const ids = [...new Set([...ads.flatMap((a) => assetIds(a.visual)), ...assetIds(fallback)])]
  const assets = new Map(((ids.length ? await s.listShowcaseAssets({ id: ids }) : []) as Row[]).map((a) => [a.id, a]))
  const claims = new Map<string, number>()
  for (const a of ads.filter((a) => a.action?.kind === "reward" && a.max_claims)) {
    claims.set(a.id, await s.listAndCountShowcaseClaims({ ad_id: a.id }, { take: 1 }).then(([, n]) => n))
  }
  return {
    ads: ads.flatMap((a) => {
      const visual = publicVisual(a.visual, assets)
      if (!visual) return []
      const action = a.action as Action
      return [
        {
          id: a.id as string,
          starts_at: a.starts_at as string | null,
          ends_at: a.ends_at as string | null,
          audience: a.audience as string,
          visual,
          tag: a.tag as string | null,
          headline: a.headline as string | null,
          body: a.body as string | null,
          theme: a.theme as string,
          align: a.align as string,
          position: a.position as string,
          scrim: !!a.scrim,
          countdown_to: a.countdown_to as string | null,
          countdown_label: a.countdown_label as string | null,
          action:
            // Members-only codes are given out by the claim endpoint, to signed-in players.
            action.kind === "coupon" && action.members_only
              ? { ...action, code: null }
              : action.kind === "reward"
              ? { kind: "reward" as const, label: action.label, reward: action.reward, text: rewardText(action.reward), sold_out: !!a.max_claims && (claims.get(a.id) ?? 0) >= a.max_claims }
              : action,
        },
      ]
    }),
    fallback: publicVisual(fallback, assets) ?? publicVisual(DEFAULT_VISUAL, assets),
  }
}
