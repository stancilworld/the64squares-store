import { draftMode } from "next/headers"
import { PreviewExit } from "./preview-exit"

// A strip shown only in preview (opened from the admin), so it's clear the page includes
// unpublished changes.
export async function PreviewBar() {
  "use cache"
  const { isEnabled } = await draftMode()
  if (!isEnabled) return null
  return (
    <div data-preview-bar className="sticky top-0 z-[60] flex items-center justify-center gap-3 bg-[#2d6cdf] px-4 py-2 text-center text-[13px] text-white">
      <span>Preview: you&apos;re seeing unpublished changes. Shoppers don&apos;t see this.</span>
      <PreviewExit />
    </div>
  )
}
