"use client"

import Image from "next/image"
import { useLayoutEffect, useRef, useState } from "react"
import type { TeamMember } from "@/lib/types"

// Must match MASK_SIZE in the admin (apps/backend/src/admin/lib/face-measure.ts).
const MASK_SIZE = 40

type Placed = TeamMember & { box: NonNullable<TeamMember["box"]> }

// The face under a point (canvas pixels), using each face's measured outline so the right
// person lights up where faces overlap. The smaller face wins (it is usually in front).
const faceAt = (members: Placed[], x: number, y: number): Placed | null => {
  let found: Placed | null = null
  let foundArea = Infinity
  for (const m of members) {
    const b = m.box
    if (x < b.x || y < b.y || x >= b.x + b.width || y >= b.y + b.height) {
      continue
    }
    if (m.mask) {
      const cx = Math.min(MASK_SIZE - 1, Math.floor(((x - b.x) / b.width) * MASK_SIZE))
      const cy = Math.min(MASK_SIZE - 1, Math.floor(((y - b.y) / b.height) * MASK_SIZE))
      if (m.mask[cy * MASK_SIZE + cx] !== "1") {
        continue
      }
    }
    const area = b.width * b.height
    if (area < foundArea) {
      found = m
      foundArea = area
    }
  }
  return found
}

// "Meet our team": black & white caricatures stacked into the group picture. The face under
// the mouse (or tapped on a phone, or focused with the keyboard) turns colour and shows a
// name tag at its top-right.
export function TeamFaces({ members }: { members: TeamMember[] }) {
  const stage = useRef<HTMLDivElement>(null)
  const pointer = useRef("mouse")
  const [active, setActive] = useState<string | null>(null)
  const placed = members.filter((m): m is Placed => !!m.box)
  const first = placed.find((m) => m.canvas_width && m.canvas_height)
  if (!first) {
    return null
  }
  const W = first.canvas_width!
  const H = first.canvas_height!
  const current = placed.find((m) => m.id === active)

  const pick = (clientX: number, clientY: number) => {
    const r = stage.current!.getBoundingClientRect()
    return faceAt(placed, ((clientX - r.left) / r.width) * W, ((clientY - r.top) / r.height) * H)
  }

  const pct = (v: number, of: number) => `${(v / of) * 100}%`

  return (
    <div
      ref={stage}
      className={`relative w-full select-none ${active ? "cursor-pointer" : ""}`}
      style={{ aspectRatio: `${W} / ${H}` }}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse") {
          setActive(pick(e.clientX, e.clientY)?.id ?? null)
        }
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") {
          setActive(null)
        }
      }}
      onPointerDown={(e) => {
        pointer.current = e.pointerType
      }}
      onClick={(e) => {
        // Phones and tablets: tap a face to light it up, tap it again or elsewhere to clear.
        if (pointer.current === "mouse") {
          return
        }
        const hit = pick(e.clientX, e.clientY)
        setActive((a) => (hit && hit.id !== a ? hit.id : null))
      }}
    >
      {placed.map((m) => (
        <div key={m.id} className="pointer-events-none absolute inset-0">
          <Image
            src={m.image_url}
            alt=""
            fill
            sizes="(min-width: 1200px) 1100px, 100vw"
            className="object-contain"
          />
          {m.color_image_url && (
            <Image
              src={m.color_image_url}
              alt=""
              fill
              sizes="(min-width: 1200px) 1100px, 100vw"
              className={`object-contain transition-opacity duration-300 ease-out ${
                active === m.id ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
          {/* Invisible, keyboard-focusable spot over each face (mouse and taps use the stage). */}
          <button
            type="button"
            aria-label={m.role ? `${m.name}, ${m.role}` : m.name}
            className="pointer-events-none absolute rounded-[40%] outline-offset-4 focus-visible:outline-2 focus-visible:outline-ink"
            style={{
              left: pct(m.box.x, W),
              top: pct(m.box.y, H),
              width: pct(m.box.width, W),
              height: pct(m.box.height, H),
            }}
            onFocus={() => setActive(m.id)}
            onBlur={() => setActive((a) => (a === m.id ? null : a))}
          />
        </div>
      ))}

      {current && <NameTag key={current.id} member={current} W={W} H={H} />}
    </div>
  )
}

// Sits just above the face's top-right, like the design. If that would run off the screen
// (faces at the right edge on narrow screens), it moves to the face's top-left instead.
function NameTag({ member, W, H }: { member: Placed; W: number; H: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [flip, setFlip] = useState(false)
  const b = member.box

  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (r && !flip && r.right > document.documentElement.clientWidth - 8) {
      setFlip(true)
    }
  }, [flip])

  const left = `${((b.x + b.width * (flip ? 0.4 : 0.6)) / W) * 100}%`
  const top = `${((b.y + b.height * 0.14) / H) * 100}%`
  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute z-10 flex animate-[tag-in_200ms_ease-out] items-center gap-x-[10px] rounded-[8px] bg-black px-[12px] py-[8px] text-white lg:gap-x-[15px] lg:rounded-[10px] lg:px-[22px] lg:py-[14px] ${
        flip ? "-translate-x-full" : ""
      } -translate-y-full`}
      style={{ left, top }}
    >
      <span className="font-display h-section">{member.name}</span>
      {member.role && (
        <span className="max-w-[56px] text-[10px] leading-[12px] text-white/85 lg:max-w-[60px] lg:text-[12px] lg:leading-[14px]">
          {member.role}
        </span>
      )}
    </div>
  )
}
