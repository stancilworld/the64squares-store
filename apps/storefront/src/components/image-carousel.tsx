"use client"

import { useState } from "react"
import { ChevronLeftThin, ChevronRightThin } from "./icons"
import { FillMedia } from "./media"

// Featured collection pictures, browsed with the arrows. Empty slots show the grey box.
export function ImageCarousel({ images, label }: { images: (string | null)[]; label: string }) {
  const [index, setIndex] = useState(0)
  const count = Math.max(images.length, 1)
  const go = (i: number) => setIndex((i + count) % count)

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className="relative aspect-[675/487] w-full overflow-hidden bg-placeholder"
    >
      <div
        className="flex h-full transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {(images.length ? images : [null]).map((src, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            aria-hidden={i !== index}
            className="relative h-full w-full shrink-0"
          >
            {src && <FillMedia src={src} sizes="(min-width: 1024px) 675px, 100vw" />}
          </div>
        ))}
      </div>
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous picture"
            onClick={() => go(index - 1)}
            className="absolute left-[18px] top-1/2 -translate-y-1/2 p-4 text-black hover:opacity-70"
          >
            <ChevronLeftThin className="h-[34px] w-[22px]" />
          </button>
          <button
            type="button"
            aria-label="Next picture"
            onClick={() => go(index + 1)}
            className="absolute right-[13px] top-1/2 -translate-y-[54%] p-4 text-black hover:opacity-70"
          >
            <ChevronRightThin className="h-[34px] w-[22px]" />
          </button>
        </>
      )}
    </div>
  )
}
