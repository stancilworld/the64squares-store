"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { PanelHeader } from "@/components/play-shell/nav"
import { GAME_URL } from "@/lib/game-types"
import type { PlayPass } from "@/lib/play"
import type { FullProfile } from "@/lib/profile-types"
import { Avatar, LevelBadge, XpBar } from "./avatar"
import { usePlayPass } from "./use-play-pass"

const field = "h-[46px] w-full rounded-lg border border-[var(--g-line)] bg-[var(--g-panel-2)] px-3 text-[15px] outline-none focus:border-[var(--g-accent)]"

// Your profile: picture, name, username, city and a few words about you.
export function ProfileEditor({ initialPass }: { initialPass: PlayPass | null }) {
  const pass = usePlayPass(initialPass)
  const socket = useRef<Socket | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState<FullProfile | null>(null)
  const [form, setForm] = useState({ display_name: "", username: "", city: "", bio: "" })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const token = pass && !pass.me.guest ? pass.token : null

  useEffect(() => {
    if (!token) return
    const s = io(GAME_URL, { path: "/game/socket.io", auth: { token }, transports: ["websocket", "polling"] })
    socket.current = s
    s.on("connect", () =>
      s.emit("profile:mine", null, (res: { ok: boolean; profile?: FullProfile }) => {
        if (!res.ok || !res.profile) return
        setProfile(res.profile)
        setForm({ display_name: res.profile.display_name, username: res.profile.username, city: res.profile.city, bio: res.profile.bio })
      })
    )
    return () => {
      s.disconnect()
    }
  }, [token])

  if (pass?.me.guest) {
    return (
      <div className="mx-auto max-w-[560px]">
        <PanelHeader title="Your profile" />
        <div className="g-panel mt-5 p-6 text-center">
          <p className="text-[16px]">You&apos;re playing as {pass.me.name}.</p>
          <p className="g-muted mt-1 text-[14px]">Create a free account for a profile with your picture, a rating, experience levels and friends.</p>
          <Link href="/account?next=/play/profile" className="g-btn g-btn-primary mt-5">
            Create an account
          </Link>
        </div>
      </div>
    )
  }
  if (!profile) return <p className="g-muted py-16 text-center">Loading your profile…</p>

  const save = () => {
    setBusy(true)
    setNote(null)
    socket.current?.emit("profile:update", form, (res: { ok: boolean; error?: string; profile?: FullProfile }) => {
      setBusy(false)
      if (res.ok && res.profile) {
        setProfile((p) => (p ? { ...p, ...res.profile } : p))
        setNote({ ok: true, text: "Saved. New games will show your new name." })
      } else setNote({ ok: false, text: res.error ?? "That didn't save. Please try again." })
    })
  }

  const upload = async (f: File) => {
    if (f.size > 6_000_000) return setNote({ ok: false, text: "Pictures can be up to 6 MB." })
    setNote(null)
    setBusy(true)
    try {
      const r = await fetch(`${GAME_URL}/game/profile/avatar`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": f.type || "application/octet-stream" }, body: f })
      const d = (await r.json()) as { ok?: boolean; avatar_url?: string; error?: string }
      if (d.ok && d.avatar_url) {
        setProfile((p) => (p ? { ...p, avatar_url: d.avatar_url! } : p))
        setNote({ ok: true, text: "Picture updated." })
      } else setNote({ ok: false, text: d.error ?? "That picture didn't upload." })
    } catch {
      setNote({ ok: false, text: "That picture didn't upload. Please try again." })
    } finally {
      setBusy(false)
    }
  }

  const removePicture = async () => {
    await fetch(`${GAME_URL}/game/profile/avatar`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } })
    setProfile((p) => (p ? { ...p, avatar_url: null } : p))
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <PanelHeader
        title="Your profile"
        right={
          <Link href={`/play/player/${profile.username}`} className="g-btn g-btn-ghost !min-h-[36px] text-[13px]">
            View public profile
          </Link>
        }
      />
      <div className="g-panel mt-5 flex flex-col items-center gap-5 p-6 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <Avatar url={profile.avatar_url} name={form.display_name || profile.display_name} size={112} />
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" disabled={busy} className="g-btn !min-h-[36px] text-[13px]" onClick={() => file.current?.click()}>
            {profile.avatar_url ? "Change picture" : "Add a picture"}
          </button>
          {profile.avatar_url && (
            <button type="button" className="g-muted text-[12px] underline underline-offset-2" onClick={removePicture}>
              Remove picture
            </button>
          )}
        </div>
        <div className="w-full min-w-0 flex-1">
          <p className="text-[22px] font-bold leading-tight">{profile.display_name}</p>
          <p className="g-muted text-[14px]">@{profile.username}</p>
          <div className="mt-2">
            <LevelBadge level={profile.level} />
          </div>
          <div className="mt-3 max-w-[360px]">
            <XpBar level={profile.level} />
          </div>
        </div>
      </div>

      <div className="g-panel mt-4 grid gap-4 p-6 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
          Display name
          <input className={field} maxLength={40} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <span className="g-muted text-[12px] font-normal">Shown at the board and to your friends.</span>
        </label>
        <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
          Username
          <div className="flex items-center rounded-lg border border-[var(--g-line)] bg-[var(--g-panel-2)] pl-3 focus-within:border-[var(--g-accent)]">
            <span className="g-muted">@</span>
            <input
              className="h-[44px] w-full bg-transparent px-1 text-[15px] outline-none"
              maxLength={20}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
            />
          </div>
          <span className="g-muted text-[12px] font-normal">How friends find you. Letters, numbers and _ only.</span>
        </label>
        <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
          City
          <input className={field} maxLength={60} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-[14px] font-semibold sm:col-span-2">
          About you
          <textarea
            className="min-h-[90px] w-full rounded-lg border border-[var(--g-line)] bg-[var(--g-panel-2)] p-3 text-[15px] outline-none focus:border-[var(--g-accent)]"
            maxLength={200}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            placeholder="Favourite opening, club, or what you're working on"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="button" disabled={busy} className="g-btn g-btn-primary" onClick={save}>
            {busy ? "Saving…" : "Save profile"}
          </button>
          {note && <p className={`text-[14px] ${note.ok ? "text-[#7bd88f]" : "text-[var(--g-bad)]"}`}>{note.text}</p>}
        </div>
      </div>
    </div>
  )
}
