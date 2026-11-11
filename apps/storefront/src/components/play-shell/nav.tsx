"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { GearIcon, openBoardSettings } from "@/components/chess/board-settings"
import { ExperienceSwitch } from "@/components/experience-switch"
import type { PlayPass } from "@/lib/play"
import { useSideFolded, toggleSide } from "@/lib/chess/side"
import { ActiveGames } from "./active-games"
import { GIcon } from "./icons"

export const PLAY_NAV = [
  { href: "/play", label: "Play", icon: "home" },
  { href: "/play/online", label: "Online", icon: "bolt" },
  { href: "/play/computer", label: "Computer", icon: "cpu" },
  { href: "/play/puzzles", label: "Puzzles", icon: "puzzle" },
  { href: "/play/friend", label: "Invite link", icon: "link" },
  { href: "/play/friends", label: "Friends", icon: "friend" },
  { href: "/play/tournaments", label: "Tournaments", icon: "trophy" },
  { href: "/play/history", label: "History", icon: "history" },
  { href: "/play/leaderboard", label: "Leaderboard", icon: "chart" },
  { href: "/play/news", label: "News", icon: "news" },
  { href: "/play/profile", label: "Profile", icon: "user" },
]
const MOBILE_TABS = ["/play", "/play/online", "/play/puzzles", "/play/friends", "/play/profile"]

const isActive = (path: string, href: string) =>
  href === "/play"
    ? path === "/play"
    : path === href || path.startsWith(`${href}/`) || (href === "/play/tournaments" && path.startsWith("/play/arena")) || (href === "/play/friends" && path.startsWith("/play/player/"))

// Which screen we're on, for the top bar on phones.
const titleFor = (path: string) => {
  const item = [...PLAY_NAV].reverse().find((n) => isActive(path, n.href))
  if (path.startsWith("/play/arena")) return "Arena"
  if (path.startsWith("/play/analysis")) return "Game review"
  if (!item || item.href === "/play") return /^\/play\/[A-Za-z0-9]{10}$/.test(path) ? "Game" : "Play chess"
  return item.label
}

// Desktop: a side menu, like a game's main menu. While a game is on it folds to icons; the
// arrow on its edge opens or folds it. On short screens it scrolls inside itself.
export function SideNav({ account, showSwitch = true, pass = null }: { account: React.ReactNode; showSwitch?: boolean; pass?: PlayPass | null }) {
  const path = usePathname()
  const folded = useSideFolded()
  const row = `flex items-center rounded-lg text-[var(--g-muted)] transition hover:bg-[var(--g-panel)] hover:text-white ${folded ? "h-11 justify-center short:h-10" : "gap-3 px-3 py-2.5 short:py-2"}`
  return (
    <aside
      data-folded={folded ? "" : undefined}
      className={`play-side sticky top-0 z-40 hidden h-dvh shrink-0 border-r border-[var(--g-line)] bg-[var(--g-side)] transition-[width] duration-200 lg:block ${folded ? "w-[72px]" : "w-[212px]"}`}
    >
      <button
        type="button"
        onClick={toggleSide}
        aria-label={folded ? "Open the menu" : "Fold the menu"}
        aria-expanded={!folded}
        title={folded ? "Open the menu" : "Fold the menu"}
        className="absolute -right-3 top-[76px] z-10 grid h-6 w-6 place-items-center rounded-full border border-[var(--g-line)] bg-[var(--g-panel-2)] text-[var(--g-muted)] shadow-md transition hover:bg-[var(--g-accent)] hover:text-black"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={folded ? "rotate-180" : ""}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden [scrollbar-width:thin]">
        <Link href="/play" className={`flex items-center pb-3 pt-5 short:pt-3 ${folded ? "justify-center" : "px-5"}`}>
          {folded ? (
            <Image src="/brand/logo-mark.png" alt="The 64 Squares" width={256} height={294} className="h-[38px] w-auto" priority />
          ) : (
            <Image src="/brand/logo-footer.webp" alt="The 64 Squares" width={388} height={160} className="h-[44px] w-auto" priority />
          )}
        </Link>
        {showSwitch && !folded && <ExperienceSwitch active="play" dark className="mx-4 mb-3" />}
        <nav className={`flex flex-col gap-1 short:gap-0.5 ${folded ? "px-2" : "px-3"}`}>
          {PLAY_NAV.map((n) => {
            const on = isActive(path, n.href)
            return (
              <Link
                key={n.href}
                href={n.href}
                title={folded ? n.label : undefined}
                aria-label={folded ? n.label : undefined}
                className={`${row} text-[15px] font-semibold ${on ? "!bg-[var(--g-panel-2)] !text-white shadow-[inset_3px_0_0_var(--g-accent)]" : ""}`}
              >
                <GIcon name={n.icon} className={on ? "text-[var(--g-accent)]" : ""} />
                {!folded && n.label}
              </Link>
            )
          })}
          <ActiveGames pass={pass} folded={folded} />
        </nav>
        <div className={`mt-auto flex flex-col gap-1 border-t border-[var(--g-line)] short:gap-0 ${folded ? "p-2" : "p-3"}`}>
          <button type="button" onClick={openBoardSettings} title={folded ? "Board settings" : undefined} aria-label="Board settings" className={`${row} text-left text-[14px] font-medium`}>
            <GearIcon />
            {!folded && "Board settings"}
          </button>
          {!folded && account}
          <Link href="/shop" title={folded ? "Back to the shop" : undefined} aria-label="Back to the shop" className={`${row} text-[14px] font-medium`}>
            <GIcon name="shop" size={20} />
            {!folded && "Back to the shop"}
          </Link>
        </div>
      </div>
    </aside>
  )
}

// Phones: a slim top bar with a back arrow, and tabs at the bottom.
export function MobileBar({ showSwitch = true, pass = null }: { showSwitch?: boolean; pass?: PlayPass | null }) {
  const path = usePathname()
  const home = path === "/play"
  return (
    <header className="play-topbar sticky top-0 z-30 flex h-[52px] items-center gap-2 border-b border-[var(--g-line)] bg-[var(--g-side)] px-2 lg:hidden">
      {home ? (
        showSwitch ? (
          <ExperienceSwitch active="play" dark />
        ) : (
          <Link href="/shop" aria-label="Back to the shop" className="flex h-10 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-[var(--g-muted)]">
            <GIcon name="back" size={20} />
            Shop
          </Link>
        )
      ) : (
        <Link href="/play" aria-label="Back to Play" className="flex h-10 w-10 items-center justify-center rounded-lg text-white">
          <GIcon name="back" />
        </Link>
      )}
      <p className={`flex-1 truncate text-center text-[16px] font-bold ${home && showSwitch ? "invisible" : ""}`}>{titleFor(path)}</p>
      <ActiveGames pass={pass} compact />
      <button type="button" aria-label="Board settings" onClick={openBoardSettings} className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--g-muted)]">
        <GearIcon size={22} />
      </button>
    </header>
  )
}

export function MobileTabs() {
  const path = usePathname()
  // While playing, the board and its buttons get the whole screen.
  if (/^\/play\/[A-Za-z0-9]{10}$/.test(path) || path === "/play/computer" || /^\/play\/(puzzles|analysis)\/.+/.test(path)) return null
  return (
    <nav className="play-tabs fixed inset-x-0 bottom-0 z-30 grid h-[62px] grid-cols-5 border-t border-[var(--g-line)] bg-[var(--g-side)] pb-[env(safe-area-inset-bottom)] lg:hidden">
      {MOBILE_TABS.map((href) => {
        const n = PLAY_NAV.find((x) => x.href === href)!
        const on = isActive(path, href)
        return (
          <Link key={href} href={href} className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${on ? "text-[var(--g-accent)]" : "text-[var(--g-muted)]"}`}>
            <GIcon name={n.icon} size={22} />
            {n.label}
          </Link>
        )
      })}
    </nav>
  )
}

// The top of each screen's panel: a back arrow and a title.
export function PanelHeader({ title, back = "/play", backLabel = "Play", right }: { title: string; back?: string | null; backLabel?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {back && (
        <Link href={back} className="g-btn g-btn-ghost !hidden !min-h-[36px] !px-2.5 !text-[13px] lg:!inline-flex" aria-label={`Back to ${backLabel}`}>
          <GIcon name="back" size={18} />
          <span className="hidden sm:inline">{backLabel}</span>
        </Link>
      )}
      <h1 className="g-title min-w-0 flex-1 truncate">{title}</h1>
      {right}
    </div>
  )
}
