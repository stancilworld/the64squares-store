"use client"

import { useState } from "react"
import { type PrizeAddress, sendPrizeAddress } from "@/lib/tournament-actions"
import type { Ticket } from "@/lib/tournament-types"

const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
]

// A prize won: where it stands, and the delivery address form once the result is final.
// (The roadmap: winners only are asked for an address, never at sign-up.)
export function PrizeClaim({ ticket, onSaved }: { ticket: Ticket; onSaved?: (t: Ticket) => void }) {
  const [t, setT] = useState(ticket)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState<PrizeAddress>({ name: ticket.player_name, phone: ticket.phone ?? "", line1: "", line2: "", city: ticket.city ?? "", state: "", pincode: "" })
  if (!t.prize_title || t.review === "disqualified") return null

  const set = (k: keyof PrizeAddress) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await sendPrizeAddress(t.tournament.handle, f)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setT(res.ticket)
    setOpen(false)
    onSaved?.(res.ticket)
  }

  const status =
    t.prize_status === "delivered"
      ? "Delivered. Enjoy it!"
      : t.prize_status === "shipped"
        ? `On its way${t.prize_tracking ? `: ${t.prize_tracking}` : ""}.`
        : t.prize_status === "address"
          ? t.prize_address
            ? "Address received. We'll post it soon and send you the tracking."
            : "Confirmed! Tell us where to send it."
          : "Waiting for the fair-play review (within 48 hours of the end)."

  const input = "h-11 w-full rounded-lg border border-[var(--g-line)] bg-[var(--g-panel-2)] px-3 text-[15px] text-white outline-none focus:border-[var(--g-accent)]"
  return (
    <div className="mt-3 rounded-xl border border-[var(--g-accent)]/40 bg-[var(--g-accent)]/[0.08] p-3.5">
      <p className="flex items-center gap-2 text-[15px] font-extrabold">
        <span aria-hidden="true">🎁</span> {t.prize_title}
      </p>
      <p className="mt-0.5 text-[13px] text-[var(--g-muted)]">{status}</p>
      {t.can_send_address && !open && (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 h-[44px] w-full rounded-lg bg-[var(--g-accent)] text-[15px] font-bold text-black">
          {t.prize_address ? "Change the address" : "Add your delivery address"}
        </button>
      )}
      {open && (
        <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-2.5">
          <label className="col-span-2 text-[13px] font-semibold">
            Name
            <input className={`${input} mt-1`} required minLength={2} value={f.name} onChange={set("name")} autoComplete="name" />
          </label>
          <label className="col-span-2 text-[13px] font-semibold">
            Phone
            <input className={`${input} mt-1`} required inputMode="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" />
          </label>
          <label className="col-span-2 text-[13px] font-semibold">
            House, street
            <input className={`${input} mt-1`} required minLength={3} value={f.line1} onChange={set("line1")} autoComplete="address-line1" />
          </label>
          <label className="col-span-2 text-[13px] font-semibold">
            Area, landmark (optional)
            <input className={`${input} mt-1`} value={f.line2} onChange={set("line2")} autoComplete="address-line2" />
          </label>
          <label className="text-[13px] font-semibold">
            City
            <input className={`${input} mt-1`} required value={f.city} onChange={set("city")} autoComplete="address-level2" />
          </label>
          <label className="text-[13px] font-semibold">
            PIN code
            <input className={`${input} mt-1`} required inputMode="numeric" pattern="[1-9][0-9]{5}" value={f.pincode} onChange={set("pincode")} autoComplete="postal-code" />
          </label>
          <label className="col-span-2 text-[13px] font-semibold">
            State
            <select className={`${input} mt-1`} required value={f.state} onChange={set("state")}>
              <option value="">Choose…</option>
              {STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="col-span-2 text-[13px] text-[#ff8a80]">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="col-span-2 h-[46px] rounded-lg bg-[var(--g-accent)] text-[15px] font-bold text-black disabled:opacity-50">
            {busy ? "Saving…" : "Send my prize here"}
          </button>
        </form>
      )}
    </div>
  )
}
