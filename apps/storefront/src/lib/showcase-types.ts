// Adverts in the website's advert windows (backend lib/showcase.ts).

export type MediaVisual = {
  kind: "image" | "video"
  url: string
  poster_url: string | null
  // A separate picture or video for phones.
  mobile: { kind: "image" | "video"; url: string; poster_url: string | null } | null
  fit: "cover" | "contain"
  // object-position, e.g. "50% 30%"
  focus: string
}
export type Visual = { kind: "scene"; scene: string } | MediaVisual

export type Reward = { type: "xp_boost"; factor: number; hours: number } | { type: "passes"; count: number }

export type AdAction =
  | { kind: "none" }
  | { kind: "link"; label: string; url: string }
  // code is null when only signed-in players can see it.
  | { kind: "coupon"; code: string | null; label?: string; url?: string; members_only?: boolean }
  | { kind: "reward"; label: string; reward: Reward; text: string; sold_out: boolean }

export type Ad = {
  id: string
  starts_at: string | null
  ends_at: string | null
  audience: "everyone" | "guests" | "members"
  visual: Visual
  tag: string | null
  headline: string | null
  body: string | null
  theme: "light" | "dark"
  align: "left" | "center" | "right"
  position: "top" | "middle" | "bottom"
  scrim: boolean
  countdown_to: string | null
  countdown_label: string | null
  action: AdAction
}

export type Showcase = { ads: Ad[]; fallback: Visual | null }

export type Given = { kind: "coupon"; code: string } | { kind: "xp_boost"; factor: number; until: string } | { kind: "passes"; count: number }
