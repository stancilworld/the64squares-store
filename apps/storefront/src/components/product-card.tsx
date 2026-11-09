"use client"

import Image from "next/image"
import Link from "next/link"
import { useSwatch } from "./colours-provider"
import { Stars } from "./stars"
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
        <div className="relative aspect-square w-full overflow-hidden bg-chalk">
          {product.thumbnail ? (
            <Image
              src={product.thumbnail}
              alt={product.title}
              fill
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
            />
          ) : (
            // No photo yet: a pawn on a plain square.
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/pieces/classic/bP.svg" alt="" aria-hidden="true" className="absolute inset-0 m-auto h-[46%] w-[46%] opacity-[0.13]" />
          )}
          {(product.badge || !product.inStock) && (
            <span className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
              {product.badge && (
                <span data-badge className={`px-2 py-1 text-[12px] font-bold leading-none ${BADGE_CLASSES[product.badge.colour]}`}>
                  {product.badge.text}
                </span>
              )}
              {!product.inStock && <span className="bg-white px-2 py-1 text-[12px] font-bold leading-none">Sold out</span>}
            </span>
          )}
        </div>
        <h3 className="mt-3 text-[15px] font-bold leading-snug tracking-tight group-hover:underline group-hover:decoration-amber group-hover:decoration-2 group-hover:underline-offset-4 lg:text-[17px]">
          {product.title}
        </h3>
      </Link>
      <p className="mt-1 font-mono text-[15px] font-medium text-black/80">
        {from && "From "}
        {formatPrice(product.price)}
      </p>
      {product.rating && product.rating.count > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
          <Stars value={product.rating.average} size={13} />
          <span>
            {product.rating.average.toFixed(1)} ({product.rating.count})
          </span>
        </p>
      )}
      {product.colours.length > 1 && (
        <ul aria-label="Finishes" className="mt-2.5 flex flex-wrap gap-1.5">
          {product.colours.slice(0, 5).map((c) => (
            <li key={c} title={c}>
              <span className="sr-only">{c}</span>
              <span aria-hidden="true" className="block h-[14px] w-[14px] border border-black/20" style={{ backgroundColor: swatch(c) }} />
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
