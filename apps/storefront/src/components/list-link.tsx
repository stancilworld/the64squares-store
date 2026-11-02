"use client"

import Link from "next/link"
import { useList } from "@/lib/list"
import { HeartIcon } from "./icons"

export function ListLink() {
  const { items, ready } = useList()
  const count = ready ? items.length : 0
  return (
    <Link href="/list" aria-label={count ? `Wishlist, ${count} saved` : "Wishlist"} className="relative">
      <HeartIcon className="h-[19px] w-[21px] sm:h-[26px] sm:w-[29px] lg:h-[36px] lg:w-[40px]" />
      {count > 0 && (
        <span className="absolute -right-2 -top-2 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-love px-1 text-[10px] leading-none text-white lg:-right-2.5 lg:-top-2 lg:h-[20px] lg:min-w-[20px] lg:text-[12px]">
          {count}
        </span>
      )}
    </Link>
  )
}
