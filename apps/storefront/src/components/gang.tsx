"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { Character } from "@/lib/types"
import { CloseIcon } from "./icons"
import { FillMedia } from "./media"

function Card({ c, onOpen }: { c: Character; onOpen: () => void }) {
  const live = c.status === "live"
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${c.greeting} ${c.name}${live ? "" : ", coming soon"}`}
      className="group flex flex-col items-center text-center"
    >
      <div className="relative flex aspect-[382/441] w-[54.6vw] max-w-[382px] items-center justify-center overflow-hidden rounded-[22px] bg-placeholder transition-transform duration-300 group-hover:-translate-y-1 sm:w-full sm:rounded-[40px]">
        {c.image_url && (
          <div className={`absolute inset-0 ${live ? "" : "opacity-40"}`}>
            <FillMedia src={c.image_url} alt={live ? c.name : ""} sizes="(min-width: 1024px) 382px, 90vw" />
          </div>
        )}
        {!live && (
          <p className="relative w-[70px] text-left text-[16px] leading-[17px] tracking-[0.02em] sm:w-[124px] sm:text-[28px] sm:leading-[33px] lg:w-[130px] lg:text-[32px] lg:leading-[33px]">
            {c.coming_soon_text}
          </p>
        )}
      </div>
      <p className="mt-[20px] text-[11px] leading-none sm:mt-[40px] sm:text-[24px] lg:text-[28px]">{c.greeting}</p>
      <h2 className="-mt-[2px] font-display text-[48px] leading-[36px] sm:mt-[6px] sm:text-[84px] sm:leading-none lg:-mt-[7px] lg:text-[120px] lg:leading-[90px]">
        {c.name}
      </h2>
    </button>
  )
}

// The intro popup opened from a character card ("Bella the Builder" + story + Shop Now).
function Intro({ c, onClose }: { c: Character; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const live = c.status === "live"

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) {
      dialog.showModal()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby="character-intro-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the dimmed backdrop (outside the panel) closes it.
        if (e.target === e.currentTarget) {
          ref.current?.close()
        }
      }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[1370px] overflow-y-auto rounded-[28px] bg-white p-0 text-left text-black backdrop:bg-black/50 lg:rounded-[40px]"
    >
      <div className="relative grid gap-8 px-6 pb-10 pt-12 lg:grid-cols-[477px_543px] lg:justify-between lg:gap-0 lg:pb-[150px] lg:pl-[133px] lg:pr-[94px] lg:pt-[78px]">
        <button
          type="button"
          aria-label="Close"
          onClick={() => ref.current?.close()}
          className="absolute right-4 top-4 rounded-full p-2 hover:bg-pill lg:right-6 lg:top-6"
        >
          <CloseIcon className="h-6 w-6" />
        </button>
        <div className="lg:row-span-2">
          <h2
            id="character-intro-title"
            className="whitespace-nowrap font-display text-[56px] leading-[44px] lg:text-[150px] lg:leading-[150px]"
          >
            {c.collection_title || c.name}
          </h2>
          {c.story && (
            <div className="mt-6 space-y-[35px] text-[17px] leading-[26px] lg:mt-[72px] lg:text-[24px] lg:leading-[35px]">
              {c.story.split(/\n\s*\n/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
          {live ? (
            <Link
              href={`/shop?character=${c.handle}`}
              className="mt-8 inline-flex h-[48px] items-center justify-center rounded-full bg-ink px-7 text-[18px] text-white hover:bg-black lg:mt-[57px] lg:h-[58px] lg:w-[202px] lg:px-0 lg:text-[24px]"
            >
              Shop Now
            </Link>
          ) : (
            <p className="mt-8 inline-flex h-[48px] items-center justify-center rounded-full bg-pill px-7 text-[18px] text-black/70 lg:mt-[57px] lg:h-[58px] lg:px-9 lg:text-[24px]">
              Coming soon
            </p>
          )}
        </div>
        <div className="relative order-first aspect-[543/570] w-full overflow-hidden rounded-[28px] bg-placeholder lg:order-none lg:mt-[132px] lg:rounded-[50px]">
          {c.image_url && <FillMedia src={c.image_url} alt={c.name} sizes="(min-width: 1024px) 543px, 90vw" />}
        </div>
      </div>
    </dialog>
  )
}

export function Gang({ characters }: { characters: Character[] }) {
  const [open, setOpen] = useState<Character | null>(null)
  return (
    <>
      <div className="mt-[40px] grid grid-cols-1 gap-[35px] sm:grid-cols-2 sm:gap-14 lg:mt-[134px] lg:grid-cols-3 lg:gap-[44px]">
        {characters.map((c) => (
          <Card key={c.id} c={c} onOpen={() => setOpen(c)} />
        ))}
      </div>
      {open && <Intro key={open.id} c={open} onClose={() => setOpen(null)} />}
    </>
  )
}
