import { storeUrl } from "./emails"

// Tells the website to drop cached data after a change in the admin (storefront
// app/api/revalidate). Best effort: if the website can't be reached, the change still shows
// once its cache runs out (a few minutes).
export const refreshWebsite = async (tags: string[]) => {
  const secret = process.env.T64_PREVIEW_SECRET
  if (!secret) return
  try {
    await fetch(`${storeUrl()}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-t64-secret": secret },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(4000),
    })
  } catch {
    // The website is down or restarting.
  }
}
