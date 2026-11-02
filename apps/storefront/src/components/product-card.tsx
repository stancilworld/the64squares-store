"use client"

import Image from "next/image"
import Link from "next/link"
import { useSwatch } from "./colours-provider"
import { BADGE_CLASSES } from "@/lib/badges"
import { formatPrice } from "@/lib/format"
import type { ProductCard as Card } from "@/lib/types"

// A product in a grid: photo, name, price and its finishes. The whole card opens the product.
// "lg" is kept for older callers and looks the same.
export function ProductCard({ product }: { product: Card; size?: "lg" | "md" }) {
  const swatch = useSwatch()
  const href = `/products/${product.handle}`
  const from = product.maxPrice != null && product.price != null && product.maxPrice > product.price
  return (
    <article className="group">
      <Link href={href} className="block">
        <div className="relative aspect-square w-full overflow-hidden rounded-md bg-linen">
          {product.thumbnail ? (
            <Image
              src={product.thumbnail}
              alt={product.title}
              fill
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
            />
          ) : (
            <span aria-hidden="true" className="absolute inset-0 bg-[conic-gradient(var(--color-maple)_25%,var(--color-maple-soft)_0_50%,var(--color-maple)_0_75%,var(--color-maple-soft)_0)] bg-[length:25%_25%] opacity-60" />
          )}
          {(product.badge || !product.inStock) && (
            <span className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
              {product.badge && (
                <span data-badge className={`rounded px-2 py-0.5 text-[12px] font-medium ${BADGE_CLASSES[product.badge.colour]}`}>
                  {product.badge.text}
                </span>
              )}
              {!product.inStock && <span className="rounded bg-white px-2 py-0.5 text-[12px]">Sold out</span>}
            </span>
          )}
        </div>
        <h3 className="mt-3 text-[15px] font-medium leading-snug group-hover:underline group-hover:underline-offset-4 lg:text-[16px]">
          {product.title}
        </h3>
      </Link>
      <p className="mt-1 text-[15px] text-muted">
        {from && "From "}
        {formatPrice(product.price)}
      </p>
      {product.colours.length > 1 && (
        <ul aria-label="Finishes" className="mt-2.5 flex flex-wrap gap-1.5">
          {product.colours.slice(0, 5).map((c) => (
            <li key={c} title={c}>
              <span className="sr-only">{c}</span>
              <span aria-hidden="true" className="block h-[14px] w-[14px] rounded-full border border-black/15" style={{ backgroundColor: swatch(c) }} />
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
