import { createHmac, timingSafeEqual } from "node:crypto"
import { draftMode } from "next/headers"
import { redirect } from "next/navigation"

// GET /api/preview?token=…&path=/about: opened from the admin's Preview button. Checks the
// signed, short-lived token, switches preview on for this browser, then shows the page.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get("token") ?? ""
  const raw = url.searchParams.get("path") ?? "/"
  const path = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/"
  const secret = process.env.T64_PREVIEW_SECRET ?? ""
  const [exp, sig] = token.split(".")
  const expected = secret ? createHmac("sha256", secret).update(`preview:${exp}`).digest("hex") : ""
  const ok =
    secret.length >= 32 &&
    !!sig &&
    Number(exp) > Date.now() &&
    sig.length === expected.length &&
    timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  if (!ok) {
    return new Response("This preview link has expired. Press Preview in the admin again.", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    })
  }
  ;(await draftMode()).enable()
  redirect(path)
}
