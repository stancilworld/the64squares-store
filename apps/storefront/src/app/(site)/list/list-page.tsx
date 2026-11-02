"use client"

import Link from "next/link"
import { useState } from "react"
import { ChevronDown } from "@/components/icons"
import { ListCardView, useListCards, useTossIn } from "@/components/list-cards"

const PAGE = 9

export function ListPageView() {
  const cards = useListCards()
  const { toss, busy } = useTossIn()
  const [shown, setShown] = useState(PAGE)

  if (cards === null) {
    return <div className="h-[400px]" aria-busy="true" />
  }
  if (!cards.length) {
    return (
      <div className="py-16 text-center">
        <p className="text-[20px]">Your wishlist is empty. Tap the heart on any product to save it here.</p>
        <Link href="/shop" className="mt-6 btn btn-solid">
          Browse the shop
        </Link>
      </div>
    )
  }
  return (
    <>
      <div className="mt-[40px] grid grid-cols-2 gap-x-5 gap-y-12 lg:mt-[62px] lg:grid-cols-[repeat(3,301px)] lg:gap-x-[66px] lg:gap-y-[64px]">
        {cards.slice(0, shown).map((c) => (
          <ListCardView
            key={c.productId + (c.variantId ?? "")}
            card={c}
            onToss={() => toss(c)}
            busy={busy === c.productId + c.variantId}
          />
        ))}
      </div>
      {shown < cards.length && (
        <div className="mt-[64px] flex justify-center lg:mt-[120px]">
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="flex items-center gap-[14px] text-[28px] lg:text-[32px]">
            <span className="underline decoration-[2px] underline-offset-[8px]">See More</span>
            <ChevronDown className="mt-2 h-[22px] w-[26px]" />
          </button>
        </div>
      )}
    </>
  )
}
