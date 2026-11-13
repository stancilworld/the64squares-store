import { cacheLife, cacheTag } from "next/cache"
import { sdk } from "./medusa"
import type { Showcase } from "./showcase-types"

// A window's adverts and default screen. Cached for minutes; the window itself checks start
// and end times, so scheduled adverts appear and end on time.
export async function getShowcase(placement = "play_hero"): Promise<Showcase> {
  "use cache"
  cacheLife("minutes")
  cacheTag("showcase")
  try {
    return await sdk.client.fetch<Showcase>("/store/showcase", { query: { placement } })
  } catch {
    return { ads: [], fallback: { kind: "scene", scene: "clash" } }
  }
}
