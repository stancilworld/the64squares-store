"use client"

import { useState } from "react"
import type { ProductCard as Card } from "@/lib/types"
import { ChevronDown } from "./icons"
import { ProductCard } from "./product-card"

const PAGE = 8

export function ProductGrid({ products }: { products: Card[] }) {
  const [shown, setShown] = useState(PAGE)
  if (!products.length) {
    return (
      <p className="py-20 text-center text-[20px]">
        No products match these filters yet. Try removing one.
      </p>
    )
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-x-5 gap-y-14 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-[42px] lg:gap-y-[51px]">
        {products.slice(0, shown).map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {shown < products.length && (
        <div className="mt-[100px] flex justify-center lg:mt-[144px]">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="flex items-center gap-[14px] text-[28px] lg:text-[32px]"
          >
            <span className="underline decoration-[3px] underline-offset-[8px]">See More</span>
            <ChevronDown className="mt-2 h-[26px] w-[30px]" />
          </button>
        </div>
      )}
    </>
  )
}
