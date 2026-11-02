import { createHmac, timingSafeEqual } from "node:crypto"
import type { MedusaRequest } from "@medusajs/framework/http"
import { storeUrl } from "./emails"

// Website preview: staff open the website in "preview" to see drafts, hidden items and
// scheduled posts before shoppers do.
//
// STANCIL_PREVIEW_SECRET is shared by the backend and the storefront (deploy/build.sh makes
// it once and gives it to both). The admin asks for a short-lived link signed with it; the
// storefront checks the signature, switches on Next.js draft mode, and from then on sends
// the secret in the x-stancil-preview header when it reads website content.

export const previewSecret = () => (process.env.STANCIL_PREVIEW_SECRET || "").trim()

const same = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// True when the request comes from the storefront in preview mode.
export const isPreview = (req: MedusaRequest) => {
  const secret = previewSecret()
  const sent = String(req.headers["x-stancil-preview"] ?? "")
  return secret.length >= 32 && !!sent && same(sent, secret)
}

const LINK_MINUTES = 10

const sign = (secret: string, exp: number) => createHmac("sha256", secret).update(`preview:${exp}`).digest("hex")

// A link that opens the website in preview at `path` (valid for 10 minutes; the preview
// itself then lasts for the browser session).
export const previewLink = (path: string) => {
  const secret = previewSecret()
  if (secret.length < 32) return null
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/"
  const exp = Date.now() + LINK_MINUTES * 60_000
  const token = `${exp}.${sign(secret, exp)}`
  return `${storeUrl()}/api/preview?token=${encodeURIComponent(token)}&path=${encodeURIComponent(safe)}`
}
