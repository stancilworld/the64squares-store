"use client"

import { useEffect, useState } from "react"
import { HeartIcon } from "@/components/icons"
import { useList } from "@/lib/list"
import { VARIANT_SELECTED } from "@/lib/product-events"

// Heart in the corner of the product photo: saves the product, with the option the
// shopper has chosen, to their wishlist.
export function WishlistHeart({ productId, initialVariantId }: { productId: string; initialVariantId: string | null }) {
  const list = useList()
  const [variantId, setVariantId] = useState(initialVariantId)
  useEffect(() => {
    const on = (e: Event) => setVariantId((e as CustomEvent<string>).detail)
    window.addEventListener(VARIANT_SELECTED, on)
    return () => window.removeEventListener(VARIANT_SELECTED, on)
  }, [])
  const saved = list.has(productId, variantId)
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
      title={saved ? "In your wishlist" : "Add to wishlist"}
      onClick={(e) => {
        e.stopPropagation()
        if (saved) list.remove(productId, variantId)
        else list.add(productId, variantId)
      }}
      className="absolute right-3 top-3 z-20 flex h-[48px] w-[48px] items-center justify-center rounded-full bg-white/95 shadow-[0_2px_10px_rgba(0,0,0,0.15)] transition-transform hover:scale-105 active:scale-95 lg:right-4 lg:top-4"
    >
      <HeartIcon filled={saved} className={`h-[20px] w-[22px] ${saved ? "text-love" : ""}`} />
    </button>
  )
}
