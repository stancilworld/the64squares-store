"use client"

import type { HttpTypes } from "@medusajs/types"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useTransition } from "react"
import { removeLine, setLineSelected, updateLine } from "@/lib/cart"
import { notifyCartChanged } from "@/lib/cart-events"
import { formatPrice } from "@/lib/format"
import { useList } from "@/lib/list"
import { ChevronRightThin } from "./icons"
import { ListCardView, useListCards, useTossIn } from "./list-cards"
import { FillMedia } from "./media"

type Line = HttpTypes.StoreCartLineItem

export const isSelected = (line: Line) => !(line.metadata as { unselected?: boolean } | null)?.unselected

function Tick({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="mt-[6px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] border-black lg:h-[20px] lg:w-[20px]"
    >
      {checked && <span className="h-full w-full rounded-[2px] bg-black" />}
    </button>
  )
}

function Item({ line, onChange }: { line: Line; onChange: (fn: () => Promise<void>) => void }) {
  const list = useList()
  const selected = isSelected(line)
  return (
    <li className="flex gap-3 lg:gap-5">
      <Tick
        checked={selected}
        label={`Buy ${line.product_title} now`}
        onChange={() => onChange(() => setLineSelected(line.id, !selected))}
      />
      <div className="flex min-w-0 flex-1 gap-4 border-b border-black/25 pb-6 lg:pb-8">
        <div className="min-w-0 flex-1">
          <Link href={`/products/${line.product_handle}`} className="text-[20px] font-medium leading-tight lg:text-[26px]">
            {line.product_title}
          </Link>
          {line.variant_title && line.variant_title !== "Default" && (
            <p className="mt-[2px] text-[13px] text-black/60 lg:text-[15px]">{line.variant_title}</p>
          )}
          <p className="mt-[2px] text-[12px] italic lg:text-[14px]">Quantity: {line.quantity}</p>
          <div className="mt-[6px] flex h-[22px] w-[74px] items-center justify-between rounded-full border border-black text-[12px] lg:h-[28px] lg:w-[92px] lg:text-[14px]">
            <button
              type="button"
              aria-label="One less"
              onClick={() => onChange(() => updateLine(line.id, line.quantity - 1))}
              className="h-full w-[24px] border-r border-black lg:w-[30px]"
            >
              −
            </button>
            <span>{line.quantity}</span>
            <button
              type="button"
              aria-label="One more"
              onClick={() => onChange(() => updateLine(line.id, line.quantity + 1))}
              className="h-full w-[24px] border-l border-black lg:w-[30px]"
            >
              +
            </button>
          </div>
          <p className="mt-[10px] flex items-center gap-2 text-[11px] italic lg:text-[13px]">
            <button type="button" onClick={() => onChange(() => removeLine(line.id))} className="underline underline-offset-2">
              Remove
            </button>
            <span aria-hidden="true">•</span>
            <button
              type="button"
              onClick={() =>
                onChange(async () => {
                  list.add(line.product_id!, line.variant_id ?? null)
                  await removeLine(line.id)
                })
              }
              className="underline underline-offset-2"
            >
              Move to Wishlist
            </button>
          </p>
          <p className="mt-2 text-[15px] lg:text-[17px]">{formatPrice(line.total ?? line.unit_price * line.quantity)}</p>
        </div>
        <Link
          href={`/products/${line.product_handle}`}
          className="relative h-[82px] w-[92px] shrink-0 overflow-hidden rounded-[16px] bg-placeholder lg:h-[120px] lg:w-[135px] lg:rounded-[22px]"
        >
          {line.thumbnail && <FillMedia src={line.thumbnail} sizes="135px" alt="" />}
        </Link>
      </div>
    </li>
  )
}

function ListRow() {
  const cards = useListCards()
  const { toss, busy } = useTossIn()
  const scroller = useRef<HTMLDivElement>(null)
  if (!cards?.length) {
    return null
  }
  return (
    <section className="mt-[56px] lg:mt-[72px]" aria-labelledby="backpack-list">
      <div className="flex items-baseline justify-between">
        <h2 id="backpack-list" className="text-[18px] font-semibold lg:text-[24px]">Wishlist</h2>
        <Link href="/list" className="text-[14px] underline underline-offset-4 lg:text-[16px]">See all</Link>
      </div>
      <div className="relative mt-5">
        <div ref={scroller} className="-mx-5 flex snap-x gap-[20px] overflow-x-auto px-5 pb-2 [scrollbar-width:none] lg:mx-0 lg:px-0">
          {cards.map((c) => (
            <ListCardView
              key={c.productId + (c.variantId ?? "")}
              card={c}
              size="sm"
              onToss={() => toss(c)}
              busy={busy === c.productId + c.variantId}
            />
          ))}
        </div>
        {cards.length > 2 && (
          <button
            type="button"
            aria-label="More from your Wishlist"
            onClick={() => scroller.current?.scrollBy({ left: 260, behavior: "smooth" })}
            className="absolute -right-5 top-0 flex h-[150px] w-[60px] items-center justify-end bg-gradient-to-l from-white via-white/80 to-transparent pr-4 lg:right-0 lg:h-[230px]"
          >
            <ChevronRightThin className="h-[22px] w-[14px]" />
          </button>
        )}
      </div>
    </section>
  )
}

function PriceTotal({ lines }: { lines: Line[] }) {
  const chosen = lines.filter(isSelected)
  const count = chosen.reduce((n, l) => n + l.quantity, 0)
  const sum = (f: (l: Line) => number) => chosen.reduce((n, l) => n + f(l), 0)
  const total = sum((l) => l.total ?? l.unit_price * l.quantity)
  const mrp = sum((l) => (l.compare_at_unit_price ?? l.unit_price) * l.quantity)
  const discount = Math.max(0, mrp - total)
  const gst = sum((l) => l.tax_total ?? 0)

  return (
    <aside className="mt-[56px] h-fit lg:sticky lg:top-[150px] lg:mt-0" aria-labelledby="price-total">
      <h2 id="price-total" className="px-1 text-[18px] font-semibold lg:text-[22px]">
        Price Total <span className="text-[13px] font-normal lg:text-[15px]">({count} {count === 1 ? "Item" : "Items"})</span>
      </h2>
      <dl className="mt-5 space-y-[14px] px-1 text-[13px] lg:text-[16px]">
        <div className="flex justify-between"><dt>Total MRP</dt><dd>{formatPrice(mrp)}</dd></div>
        <div className="flex justify-between"><dt>Discount</dt><dd>{discount > 0 ? `− ${formatPrice(discount)}` : formatPrice(0)}</dd></div>
        <div className="flex justify-between"><dt>GST/Tax (included)</dt><dd>{formatPrice(gst)}</dd></div>
        <div className="flex justify-between"><dt>Shipping fee</dt><dd>Free</dd></div>
      </dl>
      <div className="mt-5 flex justify-between border-t border-black px-1 pt-5 text-[14px] font-semibold lg:text-[18px]">
        <span>Total</span>
        <span>{formatPrice(total)}</span>
      </div>
      {count > 0 ? (
        <Link
          href="/checkout"
          className="mt-8 flex h-[44px] w-full items-center justify-center rounded-full bg-black text-[16px] font-semibold text-white hover:bg-ink lg:h-[54px] lg:text-[18px]"
        >
          Checkout
        </Link>
      ) : (
        <p className="mt-8 flex h-[44px] w-full items-center justify-center rounded-full bg-pill text-[15px] text-black/60 lg:h-[54px]">
          Tick an item to check out
        </p>
      )}
      <p className="mt-6 text-center text-[13px] italic underline underline-offset-2 lg:text-[15px]">
        <Link href="/contact">Having a Problem? Contact Us.</Link>
      </p>
    </aside>
  )
}

export function Backpack({ cart }: { cart: HttpTypes.StoreCart | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const lines = [...(cart?.items ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      await fn()
      notifyCartChanged()
      router.refresh()
    })

  return (
    <div className={`lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-[96px] ${pending ? "opacity-60 transition-opacity" : ""}`}>
      <div>
        <h1 className="text-[22px] font-semibold lg:text-[34px]">Your Cart</h1>
        {lines.length ? (
          <ul className="mt-7 space-y-6 lg:mt-10 lg:space-y-8">
            {lines.map((l) => (
              <Item key={l.id} line={l} onChange={run} />
            ))}
          </ul>
        ) : (
          <div className="mt-8">
            <p className="text-[18px]">Your cart is empty.</p>
            <Link href="/shop" className="mt-5 inline-flex h-[42px] items-center rounded-full bg-ink px-8 text-[16px] text-white">
              Shop furniture
            </Link>
          </div>
        )}
        <ListRow />
      </div>
      {lines.length > 0 && <PriceTotal lines={lines} />}
    </div>
  )
}
