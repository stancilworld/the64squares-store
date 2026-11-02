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
        <form action="/shop" method="get" role="search" className="border-b border-rule px-4 py-2.5 sm:px-6 lg:hidden">
          <label htmlFor="mobile-search" className="sr-only">
            Search
          </label>
          <input
            id="mobile-search"
            name="q"
            type="search"
            placeholder="Search sets, boards, clocks"
            className="h-[40px] w-full rounded-md border border-rule bg-white px-3 text-[16px] outline-none placeholder:text-[14px] placeholder:text-muted focus:border-black"
          />
        </form>
  )
}
