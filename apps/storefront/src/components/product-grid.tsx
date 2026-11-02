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
      <p className="py-20 text-center text-[16px] text-muted">
        No products match these filters yet. Try removing one.
      </p>
    )
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:gap-x-6">
        {products.slice(0, shown).map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {shown < products.length && (
        <div className="mt-14 flex justify-center">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="btn btn-outline"
          >
            Show more
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      )}
    </>
  )
}
