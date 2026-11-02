import { getServiceKeys } from "./service-keys"

// Pincode check for the address form: can we deliver there, and which city/state is it?
// With a Delhivery API token (DELHIVERY_TOKEN) the answer comes from Delhivery. Without it,
// every valid pincode is accepted and the city/state come from India Post's public lookup.

export type PincodeResult = {
  pincode: string
  valid: boolean
  deliverable: boolean
  cod: boolean
  city: string | null
  state: string | null
  source: "delhivery" | "indiapost" | "none"
}

const cache = new Map<string, { at: number; result: PincodeResult }>()
// Called when the Delhivery token changes, so answers come from the new source.
export const clearPincodeCache = () => cache.clear()
const DAY = 86_400_000

const withTimeout = async (url: string, init: RequestInit = {}, ms = 4000) => {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

const title = (s: string | null | undefined) =>
  s ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim() : null

const indiaPost = async (pin: string) => {
  try {
    const res = await withTimeout(`https://api.postalpincode.in/pincode/${pin}`)
    const json = (await res.json()) as { Status?: string; PostOffice?: { District?: string; State?: string }[] }[]
    const po = json?.[0]?.Status === "Success" ? json[0].PostOffice?.[0] : undefined
    return po ? { city: title(po.District), state: title(po.State), found: true } : { city: null, state: null, found: json?.[0]?.Status === "Error" ? false : null }
  } catch {
    return { city: null, state: null, found: null }
  }
}

export const checkPincode = async (pin: string): Promise<PincodeResult> => {
  if (!/^[1-9][0-9]{5}$/.test(pin)) {
    return { pincode: pin, valid: false, deliverable: false, cod: false, city: null, state: null, source: "none" }
  }
  const hit = cache.get(pin)
  if (hit && Date.now() - hit.at < DAY) {
    return hit.result
  }

  let result: PincodeResult
  const token = (await getServiceKeys()).delhiveryToken
  if (token) {
    try {
      const base = (process.env.DELHIVERY_API_BASE || "https://track.delhivery.com").replace(/\/$/, "")
      const res = await withTimeout(`${base}/c/api/pin-codes/json/?filter_codes=${pin}`, {
        headers: { Authorization: `Token ${token}`, Accept: "application/json" },
      })
      const json = (await res.json()) as { delivery_codes?: { postal_code?: Record<string, string> }[] }
      const pc = json.delivery_codes?.[0]?.postal_code
      result = {
        pincode: pin,
        valid: true,
        deliverable: !!pc && (pc.pre_paid === "Y" || pc.cod === "Y"),
        cod: pc?.cod === "Y",
        city: title(pc?.city || pc?.district),
        // Delhivery only gives a short state code (e.g. "MH"); the full name comes from India Post.
        state: null,
        source: "delhivery",
      }
      if (result.deliverable) {
        const post = await indiaPost(pin)
        result.city = result.city || post.city
        result.state = post.state || result.state
      }
    } catch {
      // Delhivery didn't answer: don't block the order, fall back to the public lookup.
      const post = await indiaPost(pin)
      result = { pincode: pin, valid: post.found !== false, deliverable: post.found !== false, cod: true, city: post.city, state: post.state, source: "indiapost" }
    }
  } else {
    const post = await indiaPost(pin)
    result = {
      pincode: pin,
      valid: post.found !== false,
      deliverable: post.found !== false,
      cod: true,
      city: post.city,
      state: post.state,
      source: post.found === null ? "none" : "indiapost",
    }
  }
  cache.set(pin, { at: Date.now(), result })
  return result
}
