"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { addToCart } from "@/lib/cart"
import { notifyCartChanged } from "@/lib/cart-events"
import { formatPrice } from "@/lib/format"
import { useList } from "@/lib/list"
import { getListCards, type ListCard } from "@/lib/list-actions"
import { FillMedia } from "./media"

// Loads product details for everything on the visitor's list.
export function useListCards() {
  const { items, ready } = useList()
  const [cards, setCards] = useState<ListCard[] | null>(null)
  const key = items.map((i) => `${i.productId}:${i.variantId}`).join(",")

  useEffect(() => {
    if (!ready) {
      return
    }
    let live = true
    getListCards(items.map(({ productId, variantId }) => ({ productId, variantId })))
      .then((c) => live && setCards(c))
      .catch(() => live && setCards([]))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the items
  }, [key, ready])

  return cards
}

// "Add to Cart": moves a list item into the cart (or opens the product to pick options).
export function useTossIn() {
  const list = useList()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()

  const toss = (card: ListCard) => {
    if (!card.variantId) {
      router.push(`/products/${card.handle}`)
      return
    }
    setBusy(card.productId + card.variantId)
    start(async () => {
      try {
        await addToCart(card.variantId!, 1)
        notifyCartChanged()
        list.remove(card.productId, card.variantId)
        router.refresh()
      } finally {
        setBusy(null)
      }
    })
  }
  return { toss, busy }
}

export function ListCardView({
  card,
  size = "lg",
  onToss,
  busy,
}: {
  card: ListCard
  size?: "lg" | "sm"
  onToss: () => void
  busy: boolean
}) {
  const list = useList()
  const lg = size === "lg"
  const href = `/products/${card.handle}`
  return (
    <article className={`flex shrink-0 flex-col items-center text-center ${lg ? "" : "w-[150px] snap-start lg:w-[230px]"}`}>
      <div className="relative w-full">
        <Link
          href={href}
          className={`relative block w-full overflow-hidden bg-placeholder ${lg ? "aspect-[301/369] rounded-[24px] lg:rounded-[40px]" : "aspect-square rounded-[20px] lg:rounded-[28px]"}`}
        >
          {card.thumbnail && (
            <FillMedia src={card.thumbnail} alt={card.title} sizes={lg ? "(min-width: 1024px) 301px, 45vw" : "230px"} />
          )}
        </Link>
        <button
          type="button"
          aria-label={`Remove ${card.title} from Wishlist`}
          onClick={() => list.remove(card.productId, card.variantId)}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[18px] leading-none shadow-sm hover:bg-white"
        >
          ×
        </button>
      </div>
      <h3 className={lg ? "mt-[8px] text-[18px] font-medium leading-tight lg:text-[24px]" : "mt-[10px] text-[15px] font-medium leading-tight lg:text-[20px]"}>
        <Link href={href}>{card.title}</Link>
      </h3>
      {card.variantTitle && <p className="text-[13px] text-black/60 lg:text-[15px]">{card.variantTitle}</p>}
      <p className={lg ? "text-[18px] text-muted lg:text-[24px]" : "text-[15px] text-muted lg:text-[20px]"}>{formatPrice(card.price)}</p>
      <button
        type="button"
        onClick={onToss}
        disabled={!card.inStock || busy}
        className={`mt-[10px] inline-flex items-center justify-center rounded-full bg-black text-white hover:bg-ink disabled:opacity-50 ${lg ? "h-[39px] w-[170px] text-[16px]" : "h-[34px] w-[130px] text-[14px] lg:h-[39px] lg:w-[170px] lg:text-[16px]"}`}
      >
        {!card.inStock ? "Sold out" : busy ? "Adding..." : card.variantId ? "Add to Cart" : "Choose options"}
      </button>
    </article>
  )
}
