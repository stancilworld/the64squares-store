"use client"

import Image from "next/image"
import Link from "next/link"
import { useSwatch } from "./colours-provider"
import { BADGE_CLASSES } from "@/lib/badges"
import { formatPrice } from "@/lib/format"
import type { ProductCard as Card } from "@/lib/types"

// size "lg" = homepage row (3 across), "md" = shop grid (4 across), as in the designs.
export function ProductCard({ product, size = "md" }: { product: Card; size?: "lg" | "md" }) {
  const swatch = useSwatch()
  const lg = size === "lg"
  const href = `/products/${product.handle}`
  return (
    <article className="flex flex-col items-center text-center">
      <Link
        href={href}
        className={`relative block w-full overflow-hidden bg-placeholder ${
          lg ? "aspect-[324/294] rounded-[40px]" : "aspect-[232/211] rounded-[40px]"
        }`}
      >
        {product.thumbnail && (
          <Image
            src={product.thumbnail}
            alt={product.title}
            fill
            sizes={lg ? "(min-width: 1024px) 324px, 90vw" : "(min-width: 1024px) 232px, 45vw"}
            className="object-cover"
          />
        )}
        {(product.badge || !product.inStock) && (
          <span className="absolute left-4 top-4 flex flex-col items-start gap-1.5">
            {product.badge && (
              <span data-badge className={`rounded-full px-3 py-1 text-[13px] font-medium ${BADGE_CLASSES[product.badge.colour]}`}>
                {product.badge.text}
              </span>
            )}
            {!product.inStock && <span className="rounded-full bg-white px-3 py-1 text-[13px]">Sold out</span>}
          </span>
        )}
      </Link>
      <h3 className={lg ? "mt-[24px] text-[28px] font-medium leading-tight lg:text-[36px]" : "mt-[20px] text-[20px] font-medium leading-tight lg:text-[24px]"}>
        <Link href={href}>{product.title}</Link>
      </h3>
      <p className={lg ? "mt-[10px] text-[20px] text-muted lg:text-[24px]" : "mt-[4px] text-[20px] text-muted lg:text-[24px]"}>
        {formatPrice(product.price)}
      </p>
      {product.colours.length > 0 && (
        <ul
          aria-label="Colours"
          className={`flex flex-wrap justify-center ${lg ? "mt-[17px] gap-[16px]" : "mt-[12px] gap-[12px]"}`}
        >
          {product.colours.slice(0, 4).map((c) => (
            <li key={c} title={c}>
              <span className="sr-only">{c}</span>
              <span
                aria-hidden="true"
                className={`block border border-black/10 ${lg ? "h-[38px] w-[40px] rounded-[8px]" : "h-[24px] w-[26px] rounded-[8px]"}`}
                style={{ backgroundColor: swatch(c) }}
              />
            </li>
          ))}
        </ul>
      )}
      <Link
        href={href}
        className={`inline-flex h-[42px] w-[140px] items-center justify-center rounded-full border-[1.5px] border-black text-[16px] transition-colors hover:bg-black hover:text-white ${lg ? "mt-[26px]" : "mt-[17px]"}`}
      >
        Buy Now
      </Link>
    </article>
  )
}
