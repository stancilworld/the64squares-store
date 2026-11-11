"use client"

import type { HttpTypes } from "@medusajs/types"
import { NotifyMe } from "./notify-me"
import { SaleCountdown } from "./sale-countdown"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react"
import { addToCart } from "@/lib/cart"
import { notifyCartChanged } from "@/lib/cart-events"
import { notifyVariantSelected } from "@/lib/product-events"
import { arrivalDate, formatArrival, indiaToday } from "@/lib/delivery-date"
import { useSwatch } from "./colours-provider"
import { formatPrice } from "@/lib/format"
import { track } from "@/lib/tracking/engine"

type Variant = HttpTypes.StoreProductVariant

const valueOf = (v: Variant, title: string) =>
  v.options?.find((o) => o.option?.title === title)?.value

const inStock = (v?: Variant) =>
  !!v && (!v.manage_inventory || !!v.allow_backorder || (v.inventory_quantity ?? 0) > 0)

type Engraving = { enabled: boolean; label: string; max: number; required: boolean; fee: number }
const engravingOf = (meta: Record<string, unknown> | null | undefined): Engraving | null => {
  const e = meta?.engraving as Partial<Engraving> | null | undefined
  if (!e?.enabled) return null
  return {
    enabled: true,
    label: e.label || "Engraving text",
    max: Math.min(200, Math.max(1, Number(e.max) || 30)),
    required: !!e.required,
    fee: Math.max(0, Math.round(Number(e.fee) || 0)),
  }
}

// Most of one item a shopper can pick at once (fewer when stock is lower).
const MAX_QTY = 10
const qtyLimit = (v?: Variant) =>
  !v || !v.manage_inventory || v.allow_backorder ? MAX_QTY : Math.max(1, Math.min(MAX_QTY, v.inventory_quantity ?? 1))

// Today's date in India, read on the device (the page itself is cached).
const noSubscribe = () => () => {}
const useToday = () => useSyncExternalStore(noSubscribe, () => indiaToday(Date.now()), () => null)

export type ProductPageInfo = {
  // Days to pack (stock items) or the product's days to make, plus days in transit.
  dispatch_days: number
  transit_days: number
  dispatch_from: string
  returns_text: string
  in_carts: number | null
  sale_ends_at: string | null
  // "Email me when it's back" under sold-out options (Website → Site features).
  back_in_stock?: boolean
}

const Tick = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-[2px] shrink-0 text-[#2f6fd6]">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)
const Pin = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="mt-[2px] shrink-0 text-[#2f6fd6]">
    <path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
  </svg>
)

export function ProductOptions({ product, info }: { product: HttpTypes.StoreProduct; info: ProductPageInfo }) {
  const engraving = engravingOf(product.metadata)
  const leadTime = typeof product.metadata?.lead_time === "string" ? product.metadata.lead_time : ""
  const makeDays = typeof product.metadata?.make_days === "number" ? product.metadata.make_days : null
  const [text, setText] = useState("")
  // Optional personalisation is chosen from a list first; required personalisation is always on.
  const [personalise, setPersonalise] = useState(false)
  const [qty, setQty] = useState(1)
  const today = useToday()
  const swatch = useSwatch()
  const variants = useMemo(() => product.variants ?? [], [product.variants])
  // Only options some variant actually has a value for. A product can carry an option its
  // variants were never linked to (e.g. Medusa's "Default option"); counting it would leave
  // nothing selectable and the buy buttons greyed out.
  const optionTitles = useMemo(
    () => (product.options ?? []).map((o) => o.title).filter((t) => variants.some((v) => valueOf(v, t))),
    [product.options, variants]
  )
  const [choice, setChoice] = useState<Record<string, string>>(() => {
    const first = variants.find(inStock) ?? variants[0]
    return Object.fromEntries(optionTitles.map((t) => [t, (first && valueOf(first, t)) ?? ""]))
  })
  // A link to one option (?variant=…, e.g. from Google Shopping) opens with it chosen.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("variant")
    const v = id ? variants.find((x) => x.id === id) : undefined
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the address
    if (v) setChoice(Object.fromEntries(optionTitles.map((t) => [t, valueOf(v, t) ?? ""])))
  }, [variants, optionTitles])
  const [pending, start] = useTransition()
  const [added, setAdded] = useState(false)
  const [error, setError] = useState("")

  // One variant: it's always the one. Otherwise the variant matching every chosen option.
  const selected = useMemo(
    () => (variants.length === 1 ? variants[0] : variants.find((v) => optionTitles.every((t) => valueOf(v, t) === choice[t]))),
    [variants, optionTitles, choice]
  )

  const valuesFor = (title: string) =>
    [...new Set(variants.map((v) => valueOf(v, title)).filter((x): x is string => !!x))]

  // Photos linked to this variant in the admin are shown when it is chosen.
  // One product view per product (not again for each option the shopper clicks).
  useEffect(() => {
    const v = product.variants?.find((x) => x.id === selected?.id) ?? product.variants?.[0]
    const price = v?.calculated_price?.calculated_amount ?? null
    track("ViewContent", {
      value: price,
      currency: v?.calculated_price?.currency_code ?? "INR",
      items: [{ product_id: product.id, variant_id: v?.id ?? null, sku: v?.sku ?? null, name: product.title, variant: v?.title ?? null, category: product.categories?.[0]?.name ?? null, price, quantity: 1 }],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per product
  }, [product.id])

  useEffect(() => {
    if (selected?.id) {
      notifyVariantSelected(selected.id)
    }
  }, [selected?.id])

  const router = useRouter()
  const engravingOn = !!engraving && (engraving.required || personalise)
  const limit = qtyLimit(selected)
  const quantity = Math.min(qty, limit)

  // "Add to cart" adds to the cart; "Buy now" adds and opens the cart.
  const add = (thenOpenBackpack: boolean) => {
    if (!selected) {
      return
    }
    if (engraving && engravingOn && !text.trim()) {
      setError(`Please fill in “${engraving.label}”${engraving.required ? "" : ", or choose No personalisation"}.`)
      document.getElementById("engraving-text")?.focus()
      return
    }
    setError("")
    start(async () => {
      try {
        await addToCart(selected.id, quantity, engravingOn ? text : null, engravingOn && (engraving?.fee ?? 0) > 0)
        notifyCartChanged()
        const unit = (selected.calculated_price?.calculated_amount ?? 0) + (engravingOn ? (engraving?.fee ?? 0) : 0)
        track("AddToCart", {
          value: unit * quantity,
          currency: selected.calculated_price?.currency_code ?? "INR",
          items: [{ product_id: product.id, variant_id: selected.id, sku: selected.sku ?? null, name: product.title, variant: selected.title ?? null, category: product.categories?.[0]?.name ?? null, price: unit, quantity }],
        })
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

  const price = selected?.calculated_price?.calculated_amount ?? null
  const was = selected?.calculated_price?.original_amount ?? null
  const onSale = typeof price === "number" && typeof was === "number" && price < was
  const percentOff = onSale ? Math.round(((was - price) / was) * 100) : 0
  const fee = engravingOn ? (engraving?.fee ?? 0) : 0
  const days = (makeDays ?? info.dispatch_days) + info.transit_days
  const returns = engravingOn ? "Personalised items can't be returned" : info.returns_text

  return (
    <div>
      {info.in_carts && (
        <p className="mt-4 text-[14px] font-semibold text-love">In {info.in_carts}+ carts</p>
      )}
      <div className={`flex flex-wrap items-baseline gap-x-3 ${info.in_carts ? "mt-1" : "mt-4"}`}>
        <p className="text-[24px] font-semibold">{formatPrice(price === null ? null : price + fee)}</p>
        {onSale && <p className="text-[16px] text-muted line-through">{formatPrice(was + fee)}</p>}
      </div>
      {onSale && percentOff > 0 && (
        <p className="mt-0.5 text-[15px] font-medium text-[#2e7d32]">
          {percentOff}% off
          {info.sale_ends_at && (
            <>
              <span aria-hidden="true"> · </span>
              <SaleCountdown endsAt={info.sale_ends_at} />
            </>
          )}
        </p>
      )}
      <p className="text-[13px] text-muted">
        Inclusive of all taxes{fee > 0 ? ` · includes ${formatPrice(fee)} for personalisation` : ""}
      </p>
      {leadTime && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-sm bg-chalk px-3 py-1 text-[13px] font-medium">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {leadTime}
        </p>
      )}

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
                  className={`h-[34px] w-[34px] rounded-sm border ${active ? "outline outline-2 outline-offset-2 outline-black" : "border-black/15"}`}
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

      {engraving && !engraving.required && (
        <div className="mt-7">
          <label htmlFor="personalise" className="block text-[14px] font-medium">
            Personalisation
          </label>
          <div className="relative mt-2">
            <select
              id="personalise"
              value={personalise ? "yes" : "no"}
              onChange={(e) => {
                setPersonalise(e.target.value === "yes")
                setAdded(false)
                setError("")
              }}
              className="h-[48px] w-full appearance-none rounded-md border border-rule bg-white pl-4 pr-10 text-[15px] outline-none focus:border-black"
            >
              <option value="no">No personalisation</option>
              <option value="yes">
                Add personalisation{engraving.fee > 0 ? ` (+${formatPrice(engraving.fee)})` : " (free)"}
              </option>
            </select>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      )}

      {engraving && engravingOn && (
        <div className={engraving.required ? "mt-7" : "mt-4"}>
          <label htmlFor="engraving-text" className="flex justify-between text-[14px] font-medium">
            <span>
              {engraving.label}
              {engraving.required && engraving.fee > 0 && (
                <span className="font-normal text-muted"> (+{formatPrice(engraving.fee)})</span>
              )}
            </span>
            <span className="font-normal text-muted">
              {text.length}/{engraving.max}
            </span>
          </label>
          <input
            id="engraving-text"
            value={text}
            maxLength={engraving.max}
            autoFocus={!engraving.required}
            onChange={(e) => {
              setText(e.target.value)
              setAdded(false)
            }}
            placeholder="Type exactly as it should appear"
            className="mt-2 h-[48px] w-full rounded-md border border-rule bg-white px-4 text-[15px] outline-none focus:border-black"
          />
          <p className="mt-1.5 text-[13px] text-muted">Check the spelling: personalised items can&apos;t be returned.</p>
        </div>
      )}

      {selected && inStock(selected) && (
        <div className="mt-7">
          <label htmlFor="quantity" className="block text-[14px] font-medium">
            Quantity
          </label>
          <div className="relative mt-2 w-[120px]">
            <select
              id="quantity"
              value={quantity}
              onChange={(e) => {
                setQty(Number(e.target.value))
                setAdded(false)
              }}
              className="h-[48px] w-full appearance-none rounded-md border border-rule bg-white pl-4 pr-10 text-[15px] outline-none focus:border-black"
            >
              {Array.from({ length: limit }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      )}

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
      </div>
      {info.back_in_stock && selected && !inStock(selected) && <NotifyMe key={selected.id} variantId={selected.id} />}
      {added && (
        <p className="mt-4 text-[15px]">
          Added to cart!{" "}
          <Link href="/cart" className="underline underline-offset-4">
            View cart
          </Link>
        </p>
      )}
      {error && <p className="mt-3 text-[15px] text-red-700">{error}</p>}

      <ul className="mt-7 space-y-2.5 text-[15px]">
        {info.dispatch_from && (
          <li className="flex gap-2.5">
            <Pin />
            <span>Dispatched from {info.dispatch_from}</span>
          </li>
        )}
        {today !== null && selected && inStock(selected) && (
          <li className="flex gap-2.5">
            <Tick />
            <span>
              Arrives by <span className="font-medium">{formatArrival(arrivalDate(today, days))}</span> if you order today
            </span>
          </li>
        )}
        {returns && (
          <li className="flex gap-2.5">
            <Tick />
            <span>{returns}</span>
          </li>
        )}
      </ul>
    </div>
  )
}
