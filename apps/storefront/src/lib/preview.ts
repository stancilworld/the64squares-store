import { draftMode } from "next/headers"

// Website preview (opened from the admin): Next.js draft mode is on, so cached data is
// skipped, and content requests carry the shared secret so the backend includes drafts,
// hidden items and scheduled posts. Safe to call inside "use cache" functions.
export async function previewHeaders(): Promise<Record<string, string>> {
  const { isEnabled } = await draftMode()
  const secret = process.env.T64_PREVIEW_SECRET
  return isEnabled && secret ? { "x-t64-preview": secret } : {}
}
