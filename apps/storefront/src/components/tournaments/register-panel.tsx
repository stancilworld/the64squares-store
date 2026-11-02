"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { registerForTournament } from "@/lib/tournament-actions"
import type { Ticket, Tournament } from "@/lib/tournament-types"

type Me = { name: string; email: string; phone: string | null } | null

const field =
  "h-[46px] w-full rounded-md border border-rule bg-white px-4 text-[15px] outline-none placeholder:text-muted focus:border-black"

// The box beside a tournament: sign in, register, or see your ticket.
export function RegisterPanel({ t, me, ticket }: { t: Tournament; me: Me; ticket: Ticket | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const ratingNeeded = t.rating_min != null || t.rating_max != null
  const [form, setForm] = useState({
    player_name: me?.name ?? "",
    phone: me?.phone ?? "",
    rating: "",
    fide_id: "",
    city: "",
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const next = `/tournaments/${t.handle}`

  if (ticket && ticket.status === "confirmed") {
    return (
      <div className="rounded-md border border-velvet/30 bg-maple-soft p-6">
        <p className="font-display h-sub">You&apos;re registered</p>
        <p className="mt-2 text-[15px]">
          Ticket <span className="font-mono font-medium">{ticket.ticket_code}</span>
        </p>
        {t.mode === "online" && t.format === "arena" && (
          <Link href={`/tournaments/${t.handle}/arena`} className="btn btn-solid mt-5 w-full">
            Open the arena
          </Link>
        )}
        <Link href={`/account/tickets/${ticket.ticket_code}`} className={`btn mt-3 w-full ${t.mode === "online" && t.format === "arena" ? "btn-outline" : "btn-solid mt-5"}`}>
          Show my ticket
        </Link>
        {t.mode === "online" && t.format === "arena" && (
          <p className="mt-3 text-[13px] text-muted">The arena opens at the start time. Keep its page open to be paired.</p>
        )}
      </div>
    )
  }

  if (!t.registration_open) {
    return (
      <div className="rounded-md border border-rule bg-linen p-6">
        <p className="font-display h-sub">{t.status === "cancelled" ? "Cancelled" : "Registration closed"}</p>
        <p className="mt-2 text-[15px] text-muted">{t.registration_note}</p>
        {t.mode === "online" && t.format === "arena" && t.status !== "cancelled" && (
          <Link href={`/tournaments/${t.handle}/arena`} className="btn btn-solid mt-5 w-full">
            {t.status === "completed" ? "Final standings" : "Watch the arena"}
          </Link>
        )}
        <Link href="/tournaments" className="btn btn-outline mt-5 w-full">
          See other tournaments
        </Link>
      </div>
    )
  }

  if (!me) {
    return (
      <div className="rounded-md border border-rule p-6">
        <p className="font-display h-sub">Register</p>
        <p className="mt-2 text-[15px] text-muted">
          Sign in or create a free account to take your place. Your ticket is saved in your account and emailed to you.
        </p>
        <Link href={`/account?next=${encodeURIComponent(next)}`} className="btn btn-solid mt-5 w-full">
          Sign in to register
        </Link>
      </div>
    )
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const rating = form.rating.trim() ? Number(form.rating) : null
    start(async () => {
      const res = await registerForTournament(t.handle, {
        player_name: form.player_name.trim(),
        phone: form.phone.trim() || null,
        rating: rating != null && Number.isFinite(rating) ? Math.round(rating) : null,
        fide_id: form.fide_id.trim() || null,
        city: form.city.trim() || null,
      })
      if (res.ok) {
        router.push(`/account/tickets/${res.ticket.ticket_code}?new=1`)
      } else if (res.signIn) {
        router.push(`/account?next=${encodeURIComponent(next)}`)
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-rule p-6">
      <p className="font-display h-sub">Register</p>
      <p className="mt-1 text-[14px] text-muted">Signed in as {me.email}</p>
      <div className="mt-5 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-[14px] font-medium">
          Player name
          <input className={field} required minLength={2} maxLength={120} autoComplete="name" value={form.player_name} onChange={set("player_name")} />
          <span className="text-[12px] font-normal text-muted">As it should appear on the standings.</span>
        </label>
        <label className="flex flex-col gap-1.5 text-[14px] font-medium">
          Phone
          <input className={field} type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={form.phone} onChange={set("phone")} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[14px] font-medium">
            Rating{ratingNeeded ? "" : " (optional)"}
            <input className={field} type="number" inputMode="numeric" min={0} max={3500} required={ratingNeeded} value={form.rating} onChange={set("rating")} />
          </label>
          <label className="flex flex-col gap-1.5 text-[14px] font-medium">
            FIDE ID (optional)
            <input className={field} inputMode="numeric" pattern="[0-9]{3,12}" title="Numbers only" value={form.fide_id} onChange={set("fide_id")} />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-[14px] font-medium">
          City (optional)
          <input className={field} autoComplete="address-level2" maxLength={80} value={form.city} onChange={set("city")} />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-[14px] text-love">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-solid mt-6 w-full disabled:opacity-60">
        {pending ? "Registering…" : t.entry_fee > 0 ? "Register, pay at the venue" : "Register for free"}
      </button>
      <p className="mt-3 text-[12px] text-muted">By registering you agree to the tournament rules below.</p>
    </form>
  )
}
