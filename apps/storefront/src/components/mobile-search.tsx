"use client"

import { usePathname } from "next/navigation"

// The checkout pages (as in the designs) have no search bar.
const HIDDEN = ["/cart", "/checkout"]

export function MobileSearch() {
  return <MobileSearchView path={usePathname()} />
}

// Phones and tablets: search sits under the header bar and scrolls away with the page.
export function MobileSearchView({ path }: { path: string }) {
  if (HIDDEN.some((p) => path.startsWith(p))) {
    return null
  }
  return (
        <form action="/shop" method="get" role="search" className="px-6 pt-[13px] lg:hidden">
          <label htmlFor="mobile-search" className="sr-only">
            Search
          </label>
          <input
            id="mobile-search"
            name="q"
            type="search"
            placeholder="Search Here..."
            className="h-[28px] w-full rounded-full border-[1.5px] border-[#bbbbbb] bg-white pl-[30px] pr-4 text-[16px] outline-none placeholder:text-[11px] placeholder:italic placeholder:text-[#9a9a9a] focus:border-ink sm:h-[40px] sm:placeholder:text-[15px]"
          />
        </form>
  )
}
