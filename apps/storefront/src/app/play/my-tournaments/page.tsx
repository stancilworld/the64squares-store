import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PanelHeader } from "@/components/play-shell/nav"
import { CopyLink, SignInButton } from "@/components/tourney/my-bits"
import { PrizeClaim } from "@/components/tourney/prize-claim"
import { getCustomer } from "@/lib/auth"
import { getMyPasses, getMyTickets, getPlayInvite, type PassWallet } from "@/lib/tournament-actions"
import { eventDay, eventTime, FORMAT_COLOUR, type Ticket } from "@/lib/tournament-types"
import { Loading } from "../loading-text"
import { nowMs } from "@/lib/clock"

export const metadata: Metadata = { title: "My tournaments", robots: { index: false } }

const MEDAL: Record<number, string> = { 1: "from-[#f5c542] to-[#b8860b] text-black", 2: "from-[#e3e6ea] to-[#8f959c] text-black", 3: "from-[#e7a46b] to-[#8a4f22] text-black" }

const ordinal = (n: number) => {
  const v = n % 100
  return `${n}${["th", "st", "nd", "rd"][(v - 20) % 10] ?? ["th", "st", "nd", "rd"][v] ?? "th"}`
}

// The ways to earn a pass, as the admin set them (Tournaments → Tournament Passes).
function EarnList({ rules }: { rules: PassWallet["rules"] }) {
  const ways = [
    rules.games_per_pass > 0 && rules.games_daily_max > 0 && { icon: "♞", title: `Play ${rules.games_per_pass} rated games`, detail: `Against real players. Up to ${rules.games_daily_max} ${rules.games_daily_max === 1 ? "pass" : "passes"} a day.`, n: 1, href: "/play/online" },
    rules.puzzle_streak_days > 0 && rules.puzzle_pass > 0 && { icon: "🧩", title: `Solve puzzles ${rules.puzzle_streak_days} days in a row`, detail: "Once a week.", n: rules.puzzle_pass, href: "/play/puzzles" },
    rules.completed > 0 && { icon: "🏁", title: "Finish a tournament", detail: "Play to the end, win or lose.", n: rules.completed, href: "/play/tournaments" },
    rules.referral > 0 && rules.referral_monthly_max > 0 && { icon: "🤝", title: "Invite a friend", detail: `When they join and play a game. Up to ${rules.referral_monthly_max} a month.`, n: rules.referral, href: null },
  ].filter(Boolean) as { icon: string; title: string; detail: string; n: number; href: string | null }[]
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2">
      {ways.map((w) => {
        const body = (
          <>
            <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--g-panel-2)] text-[22px]">
              {w.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">{w.title}</span>
              <span className="g-muted block text-[13px]">{w.detail}</span>
            </span>
            <span className="shrink-0 rounded-md bg-[var(--g-accent)] px-2 py-1 text-[13px] font-extrabold text-black">+{w.n}</span>
          </>
        )
        return (
          <li key={w.title}>
            {w.href ? (
              <Link href={w.href} className="g-panel flex items-center gap-3 p-3 hover:brightness-110">
                {body}
              </Link>
            ) : (
              <div className="g-panel flex items-center gap-3 p-3">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Upcoming({ x }: { x: Ticket }) {
  const colour = FORMAT_COLOUR[x.tournament.format ?? "arena"] ?? "#ffb300"
  return (
    <Link href={`/play/tournaments/${x.tournament.handle}`} className="g-panel relative flex items-center gap-4 overflow-hidden p-4 pl-5 hover:brightness-110">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: colour }} />
      <span className="w-[64px] shrink-0 text-center leading-tight">
        <span className="g-muted block text-[12px] font-semibold">{eventDay(x.tournament.starts_at).split(",")[0]}</span>
        <span className="block text-[18px] font-extrabold">{eventTime(x.tournament.starts_at)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-bold">{x.tournament.title}</span>
        <span className="g-muted block text-[13px]">
          {x.tournament.format_label} · {x.tournament.time_control} · Player ID <span className="font-semibold text-white/80">{x.ticket_code}</span>
        </span>
      </span>
      <span className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] font-bold ${x.checked_in_at ? "bg-[var(--g-good)] text-black" : x.can_check_in ? "bg-[var(--g-accent)] text-black" : "bg-[var(--g-panel-3)]"}`}>
        {x.checked_in_at ? "Checked in" : x.can_check_in ? "Check in now" : "Registered"}
      </span>
    </Link>
  )
}

function Result({ x }: { x: Ticket }) {
  const rank = x.final_rank
  return (
    <li className="g-panel flex flex-col p-4">
      <div className="flex items-start gap-3">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[19px] font-black ${rank && MEDAL[rank] ? MEDAL[rank] : "from-white/15 to-white/5"}`}>{rank ?? "–"}</span>
        <span className="min-w-0 flex-1">
          <Link href={`/play/tournaments/${x.tournament.handle}`} className="block truncate text-[16px] font-bold hover:underline">
            {x.tournament.title}
          </Link>
          <span className="g-muted block text-[13px]">
            {eventDay(x.tournament.starts_at)} · {x.tournament.format_label}
          </span>
          <span className="mt-1 block text-[14px]">
            {x.tournament.status === "cancelled"
              ? "Called off. Your pass came back."
              : rank
                ? `${ordinal(rank)} place${x.score != null ? ` · ${x.score} ${x.tournament.format === "knockout" ? "rounds won" : "points"}` : ""}${x.tournament.results_final_at ? "" : " · provisional"}`
                : x.status === "withdrawn"
                  ? "Left the event"
                  : "Didn't play"}
          </span>
        </span>
      </div>
      <PrizeClaim ticket={x} />
      {(x.certificate_no || x.coupon_code) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {x.certificate_no && (
            <Link href={`/certificates/${x.certificate_no}`} className="g-btn !min-h-[38px] !px-3 !text-[13px]">
              Certificate
            </Link>
          )}
          {x.coupon_code && (
            <span className="rounded-md border border-dashed border-white/25 px-2.5 py-1.5 text-[13px]">
              Shop code <strong className="tracking-wider">{x.coupon_code}</strong>
            </span>
          )}
        </div>
      )}
    </li>
  )
}

async function Locker() {
  const me = await getCustomer()
  if (!me) {
    return (
      <div className="g-panel flex flex-col items-center gap-4 px-6 py-14 text-center">
        <span aria-hidden="true" className="text-[48px]">
          🎟️
        </span>
        <h2 className="text-[24px] font-extrabold">Your first Tournament Pass is waiting</h2>
        <p className="g-muted max-w-[460px] text-[15px]">Make a free account and you get a pass to enter any online tournament. Earn more by playing.</p>
        <SignInButton label="Sign in or create an account" />
      </div>
    )
  }
  const [tickets, wallet, invite] = await Promise.all([getMyTickets(), getMyPasses(), getPlayInvite()])
  const now = nowMs()
  const online = tickets.filter((x) => x.tournament.mode === "online")
  const upcoming = online
    .filter((x) => x.status === "confirmed" && x.tournament.status === "published" && new Date(x.tournament.starts_at).getTime() + 6 * 3600_000 > now)
    .sort((a, b) => new Date(a.tournament.starts_at).getTime() - new Date(b.tournament.starts_at).getTime())
  const past = online.filter((x) => !upcoming.includes(x) && (x.status !== "cancelled" || x.tournament.status === "cancelled"))
  const podiums = past.filter((x) => x.final_rank && x.final_rank <= 3).length
  const best = past.reduce<number | null>((b, x) => (x.final_rank && (b == null || x.final_rank < b) ? x.final_rank : b), null)
  const balance = wallet?.balance ?? 0

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Your passes" className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* The pass itself: a ticket with a tear-off stub. */}
        <div className="relative overflow-hidden rounded-2xl bg-[var(--g-accent)] text-black">
          <span aria-hidden="true" className="absolute inset-0 opacity-[0.09]" style={{ background: "repeating-conic-gradient(#000 0 25%, transparent 0 50%) 0 0/28px 28px" }} />
          <div className="relative flex">
            <div className="flex-1 p-5 sm:p-6">
              <p className="text-[13px] font-extrabold">THE 64 SQUARES</p>
              <p className="mt-6 text-[76px] font-black leading-none tabular-nums">{balance}</p>
              <p className="mt-1 text-[20px] font-extrabold">Tournament {balance === 1 ? "Pass" : "Passes"}</p>
              <p className="mt-3 text-[13px] font-medium opacity-75">1 pass enters 1 online tournament. Never sold, can&apos;t be transferred, no cash value.</p>
            </div>
            <div className="relative flex w-[88px] shrink-0 flex-col items-center justify-center border-l-2 border-dashed border-black/30 text-center">
              <span aria-hidden="true" className="absolute -left-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-[var(--g-bg)]" />
              <span aria-hidden="true" className="absolute -bottom-[11px] -left-[11px] h-[22px] w-[22px] rounded-full bg-[var(--g-bg)]" />
              <span className="text-[34px]" aria-hidden="true">
                ♛
              </span>
              <span className="mt-1 text-[11px] font-extrabold">ADMIT ONE</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Played", past.filter((x) => x.final_rank).length],
            ["Podiums", podiums],
            ["Best finish", best ? ordinal(best) : "–"],
          ].map(([k, v]) => (
            <div key={k} className="g-panel flex flex-col justify-end p-4">
              <span className="g-muted text-[13px] font-semibold">{k}</span>
              <span className="text-[30px] font-black tabular-nums">{v}</span>
            </div>
          ))}
          <Link href="/play/tournaments" className="col-span-3 flex h-[52px] items-center justify-center rounded-xl bg-white text-[16px] font-extrabold text-black hover:bg-white/90">
            {balance > 0 ? "Use a pass: find a tournament" : "See the tournaments"}
          </Link>
        </div>
      </section>

      {upcoming.length > 0 && (
        <section aria-labelledby="up-h">
          <h2 id="up-h" className="text-[20px] font-extrabold">
            Coming up
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {upcoming.map((x) => (
              <Upcoming key={x.id} x={x} />
            ))}
          </div>
        </section>
      )}

      {wallet && (
        <section aria-labelledby="earn-h">
          <h2 id="earn-h" className="text-[20px] font-extrabold">
            Earn more passes
          </h2>
          <div className="mt-3">
            <EarnList rules={wallet.rules} />
          </div>
          {invite && wallet.rules.referral > 0 && (
            <div className="mt-3 max-w-[640px]">
              <p className="g-muted mb-1.5 text-[13px]">Your invite link</p>
              <CopyLink link={invite.link} />
            </div>
          )}
        </section>
      )}

      {past.length > 0 && (
        <section aria-labelledby="res-h">
          <h2 id="res-h" className="text-[20px] font-extrabold">
            Results
          </h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {past.map((x) => (
              <Result key={x.id} x={x} />
            ))}
          </ul>
        </section>
      )}

      {!!wallet?.history.length && (
        <section aria-labelledby="hist-h">
          <h2 id="hist-h" className="text-[20px] font-extrabold">
            Pass history
          </h2>
          <ul className="g-panel mt-3 divide-y divide-[var(--g-line)]">
            {wallet.history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-10 shrink-0 text-center text-[16px] font-extrabold tabular-nums ${h.delta > 0 ? "text-[var(--g-good)]" : "text-white/60"}`}>{h.delta > 0 ? `+${h.delta}` : h.delta}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{h.label}</span>
                  {h.note && <span className="g-muted block truncate text-[13px]">{h.note}</span>}
                </span>
                <span className="g-muted shrink-0 text-[13px]">{eventDay(h.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default function MyTournamentsPage() {
  return (
    <div className="mx-auto max-w-[1180px] pb-10">
      <PanelHeader title="My tournaments" back="/play/tournaments" backLabel="Tournaments" />
      <div className="mt-5">
        <Suspense fallback={<Loading text="Loading your tournaments…" />}>
          <Locker />
        </Suspense>
      </div>
    </div>
  )
}
