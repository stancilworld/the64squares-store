"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { getCartCount } from "@/lib/cart"
import { CART_CHANGED } from "@/lib/cart-events"
import { CartIcon } from "./icons"

// Cart icon with the number of items, updated straight away when something is added,
// changed or removed, and when the shopper comes back to the tab.
export function CartLink() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () =>
      getCartCount()
        .then((n) => alive && setCount(n))
        .catch(() => {})
    load()
    window.addEventListener(CART_CHANGED, load)
    window.addEventListener("focus", load)
    return () => {
      alive = false
      window.removeEventListener(CART_CHANGED, load)
      window.removeEventListener("focus", load)
    }
  }, [])

  return (
    <Link href="/cart" aria-label={count ? `Cart, ${count} items` : "Cart"} className="relative">
      <CartIcon className="h-[22px] w-[23px]" />
      {count > 0 && (
        <span className="absolute -right-2 -top-1.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-velvet px-1 text-[10px] leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  )
}
