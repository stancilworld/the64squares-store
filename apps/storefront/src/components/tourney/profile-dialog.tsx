"use client"

import Link from "next/link"
import { useEffect, useId, useRef, useState } from "react"
import { type PlayerProfile, savePlayerProfile } from "@/lib/tournament-actions"
import { nowMs } from "@/lib/clock"

const ageOf = (dob: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null
  const [y, m, d] = dob.split("-").map(Number)
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--
  return age
}

// "Almost done!": the details a player gives once before their first tournament. Under-18s
// add a parent or guardian, who agrees on their behalf.
export function ProfileDialog({ open, profile, onClose, onSaved }: { open: boolean; profile: PlayerProfile; onClose: () => void; onSaved: (p: PlayerProfile) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const [f, setF] = useState({
    first_name: profile.first_name,
    last_name: profile.last_name,
    dob: profile.dob ?? "",
    city: profile.city ?? "",
    state: profile.state ?? "",
    guardian_name: profile.guardian_name ?? "",
    guardian_phone: profile.guardian_phone ?? "",
    guardian_consent: profile.guardian_consent,
    terms: profile.terms,
    marketing: false,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const age = ageOf(f.dob)
  const minor = age != null && age < 18
  const ready = f.first_name.trim() && f.last_name.trim() && age != null && f.city.trim().length > 1 && f.state && f.terms && (!minor || (f.guardian_name.trim() && f.guardian_phone.trim() && f.guardian_consent))
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }))
  const input = "mt-1.5 h-[48px] w-full rounded-lg border border-white/20 bg-transparent px-4 text-[16px] text-white outline-none placeholder:text-white/35 focus:border-[var(--g-accent)]"
  const label = "text-[14px] text-white/60"
  const max = new Date(nowMs() - 4 * 365 * 86_400_000).toISOString().slice(0, 10)

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={`${id}-t`}
      className="m-auto max-h-[94dvh] w-[min(96vw,560px)] overflow-y-auto rounded-2xl border border-white/10 bg-[#222] p-0 text-white shadow-2xl backdrop:bg-black/70"
    >
      <form
        className="relative px-6 pb-7 pt-8 sm:px-8"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!ready) return
          setBusy(true)
          setError(null)
          const res = await savePlayerProfile({
            first_name: f.first_name,
            last_name: f.last_name,
            dob: f.dob,
            city: f.city,
            state: f.state,
            guardian_name: minor ? f.guardian_name : null,
            guardian_phone: minor ? f.guardian_phone : null,
            guardian_consent: minor ? f.guardian_consent : false,
            terms: f.terms,
            marketing: f.marketing,
          })
          setBusy(false)
          if (res.ok) onSaved(res.profile)
          else setError(res.error)
        }}
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full text-[22px] text-[var(--g-accent)] hover:bg-white/5">
          ×
        </button>
        <h2 id={`${id}-t`} className="text-[34px] font-extrabold leading-none tracking-tight sm:text-[40px]">
          Almost done!
        </h2>
        <p className="mt-3 text-[16px] text-white/80">Complete your player profile to enter tournaments. You only do this once.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>First name</span>
            <input required autoComplete="given-name" value={f.first_name} onChange={set("first_name")} className={input} />
          </label>
          <label className="block">
            <span className={label}>Last name</span>
            <input required autoComplete="family-name" value={f.last_name} onChange={set("last_name")} className={input} />
          </label>
          <label className="block">
            <span className={label}>Date of birth</span>
            <input required type="date" max={max} min="1915-01-01" autoComplete="bday" value={f.dob} onChange={set("dob")} className={`${input} [color-scheme:dark]`} />
          </label>
          <label className="block">
            <span className={label}>City</span>
            <input required autoComplete="address-level2" value={f.city} onChange={set("city")} className={input} />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>State</span>
            <select required value={f.state} onChange={set("state")} className={`${input} [color-scheme:dark]`}>
              <option value="">Choose your state</option>
              {profile.states.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        {minor && (
          <fieldset className="mt-5 rounded-xl border border-[var(--g-accent)]/40 bg-[var(--g-accent)]/[0.06] p-4">
            <legend className="px-1 text-[14px] font-semibold text-[var(--g-accent)]">Under 18: a parent or guardian</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Their name</span>
                <input required value={f.guardian_name} onChange={set("guardian_name")} className={input} />
              </label>
              <label className="block">
                <span className={label}>Their phone</span>
                <input required type="tel" inputMode="tel" value={f.guardian_phone} onChange={set("guardian_phone")} className={input} />
              </label>
            </div>
            <label className="mt-4 flex gap-3 text-[14px] leading-snug">
              <input type="checkbox" checked={f.guardian_consent} onChange={set("guardian_consent")} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--g-accent)]" />
              <span>I am this player&apos;s parent or guardian and I agree to them taking part, under the tournament rules.</span>
            </label>
          </fieldset>
        )}

        <div className="mt-6 space-y-4">
          <label className="flex gap-3 text-[14px] leading-snug">
            <input type="checkbox" required checked={f.terms} onChange={set("terms")} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--g-accent)]" />
            <span>
              I agree with the{" "}
              <Link href="/help/tournament-rules" target="_blank" className="text-[var(--g-accent)] underline-offset-2 hover:underline">
                tournament rules
              </Link>
              ,{" "}
              <Link href="/help/fair-play" target="_blank" className="text-[var(--g-accent)] underline-offset-2 hover:underline">
                fair-play policy
              </Link>{" "}
              and{" "}
              <Link href="/help/privacy" target="_blank" className="text-[var(--g-accent)] underline-offset-2 hover:underline">
                privacy policy
              </Link>
              .
            </span>
          </label>
          <label className="flex gap-3 text-[14px] leading-snug">
            <input type="checkbox" checked={f.marketing} onChange={set("marketing")} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--g-accent)]" />
            <span>Send me news about tournaments, puzzles and offers from The 64 Squares (optional).</span>
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-[14px] text-[var(--g-bad)]">
            {error}
          </p>
        )}
        <button type="submit" disabled={!ready || busy} className="mt-6 h-[54px] w-full rounded-lg bg-[var(--g-accent)] text-[18px] font-bold text-black transition disabled:bg-[#4a4320] disabled:text-black/60">
          {busy ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </dialog>
  )
}
