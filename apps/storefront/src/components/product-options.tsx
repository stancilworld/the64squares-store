"use client"

import type { HttpTypes } from "@medusajs/types"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { HeartIcon } from "@/components/icons"
import { addToCart } from "@/lib/cart"
import { notifyCartChanged } from "@/lib/cart-events"
import { notifyVariantSelected } from "@/lib/product-events"
import { useList } from "@/lib/list"
import { useSwatch } from "./colours-provider"
import { formatPrice } from "@/lib/format"

type Variant = HttpTypes.StoreProductVariant

const valueOf = (v: Variant, title: string) =>
  v.options?.find((o) => o.option?.title === title)?.value

const inStock = (v?: Variant) =>
  !!v && (!v.manage_inventory || !!v.allow_backorder || (v.inventory_quantity ?? 0) > 0)

export function ProductOptions({ product }: { product: HttpTypes.StoreProduct }) {
  const swatch = useSwatch()
  const variants = useMemo(() => product.variants ?? [], [product.variants])
  const optionTitles = useMemo(
    () => (product.options ?? []).map((o) => o.title),
    [product.options]
  )
  const [choice, setChoice] = useState<Record<string, string>>(() => {
    const first = variants.find(inStock) ?? variants[0]
    return Object.fromEntries(optionTitles.map((t) => [t, (first && valueOf(first, t)) ?? ""]))
  })
  const [pending, start] = useTransition()
  const [added, setAdded] = useState(false)
  const [error, setError] = useState("")

  const selected = useMemo(
    () => variants.find((v) => optionTitles.every((t) => valueOf(v, t) === choice[t])),
    [variants, optionTitles, choice]
  )

  const valuesFor = (title: string) =>
    [...new Set(variants.map((v) => valueOf(v, title)).filter((x): x is string => !!x))]

  // Photos linked to this variant in the admin are shown when it is chosen.
  useEffect(() => {
    if (selected?.id) {
      notifyVariantSelected(selected.id)
    }
  }, [selected?.id])

  const router = useRouter()
  const list = useList()
  const saved = list.has(product.id, selected?.id ?? null)

  // "Add to cart" adds to the cart; "Buy now" adds and opens the cart.
  const add = (thenOpenBackpack: boolean) => {
    if (!selected) {
      return
    }
    setError("")
    start(async () => {
      try {
        await addToCart(selected.id, 1)
        notifyCartChanged()
        if (thenOpenBackpack) {
          router.push("/cart")
        } else {
          setAdded(true)
        }
      } catch {
        setError("Could not add it to your cart. Please try again.")
      }
    })
  }

  const toggleList = () => {
    const variantId = selected?.id ?? null
    if (saved) {
      list.remove(product.id, variantId)
    } else {
      list.add(product.id, variantId)
    }
  }

  return (
    <div>
      <p className="mt-4 text-[22px]">
        {formatPrice(selected?.calculated_price?.calculated_amount ?? null)}
      </p>
      <p className="text-[13px] text-muted">Inclusive of all taxes</p>

      {optionTitles.map((title) => (
        <fieldset key={title} className="mt-7">
          <legend className="text-[14px] font-medium">
            {title}: <span className="font-normal text-muted">{choice[title]}</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-3">
            {valuesFor(title).map((value) => {
              const active = choice[title] === value
              return title === "Colour" ? (
                <button
                  key={value}
                  type="button"
                  aria-label={value}
                  aria-pressed={active}
                  onClick={() => {
                    setChoice((c) => ({ ...c, [title]: value }))
                    setAdded(false)
                  }}
                  className={`h-[34px] w-[34px] rounded-full border ${active ? "outline outline-2 outline-offset-2 outline-black" : "border-black/15"}`}
                  style={{ backgroundColor: swatch(value) }}
                />
              ) : (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setChoice((c) => ({ ...c, [title]: value }))
                    setAdded(false)
                  }}
                  className={`h-[40px] rounded-md border px-4 text-[14px] ${active ? "border-black bg-black text-white" : "border-rule hover:border-black"}`}
                >
                  {value}
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => add(false)}
          disabled={!selected || !inStock(selected) || pending}
          className="btn btn-solid h-[52px] min-w-[180px] flex-1 disabled:opacity-50 sm:flex-none"
        >
          {!selected ? "Choose options" : !inStock(selected) ? "Sold out" : pending ? "Adding..." : "Add to cart"}
        </button>
        <button
          type="button"
          onClick={() => add(true)}
          disabled={!selected || !inStock(selected) || pending}
          className="btn btn-outline h-[52px] min-w-[180px] flex-1 disabled:opacity-50 sm:flex-none"
        >
          Buy now
        </button>
        <button
          type="button"
          onClick={toggleList}
          aria-pressed={saved}
          className="inline-flex h-[52px] items-center gap-2 rounded-md px-3 text-[15px] hover:bg-linen"
        >
          <HeartIcon filled={saved} className={`h-[20px] w-[22px] ${saved ? "text-love" : ""}`} />
          {saved ? "In your wishlist" : "Add to wishlist"}
        </button>
      </div>
      {added && (
        <p className="mt-4 text-[15px]">
          Added to cart!{" "}
          <Link href="/cart" className="underline underline-offset-4">
            View cart
          </Link>
        </p>
      )}
      {error && <p className="mt-3 text-[15px] text-red-700">{error}</p>}
    </div>
  )
}
