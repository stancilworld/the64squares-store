"use client"

import Link from "next/link"
import { useList } from "@/lib/list"
import { HeartIcon } from "./icons"

export function ListLink() {
  const { items, ready } = useList()
  const count = ready ? items.length : 0
  return (
    <Link href="/list" aria-label={count ? `Wishlist, ${count} saved` : "Wishlist"} className="relative">
      <HeartIcon className="h-[21px] w-[23px]" />
      {count > 0 && (
        <span className="absolute -right-2 -top-1.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-velvet px-1 text-[10px] leading-none text-white">
          {count}
        </span>
      )}
    </Link>
  )
}
