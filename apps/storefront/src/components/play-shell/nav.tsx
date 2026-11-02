"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { GearIcon, openBoardSettings } from "@/components/chess/board-settings"
import { ExperienceSwitch } from "@/components/experience-switch"
import { GIcon } from "./icons"

export const PLAY_NAV = [
  { href: "/play", label: "Play", icon: "home" },
  { href: "/play/online", label: "Online", icon: "bolt" },
  { href: "/play/computer", label: "Computer", icon: "cpu" },
  { href: "/play/friend", label: "Friend", icon: "friend" },
  { href: "/play/tournaments", label: "Tournaments", icon: "trophy" },
  { href: "/play/history", label: "History", icon: "history" },
  { href: "/play/leaderboard", label: "Leaderboard", icon: "chart" },
  { href: "/play/profile", label: "Profile", icon: "user" },
]
const MOBILE_TABS = ["/play", "/play/online", "/play/computer", "/play/tournaments", "/play/history"]

const isActive = (path: string, href: string) =>
  href === "/play" ? path === "/play" : path === href || path.startsWith(`${href}/`) || (href === "/play/tournaments" && path.startsWith("/play/arena"))

// Which screen we're on, for the top bar on phones.
const titleFor = (path: string) => {
  const item = [...PLAY_NAV].reverse().find((n) => isActive(path, n.href))
  if (path.startsWith("/play/arena")) return "Arena"
  if (!item || item.href === "/play") return /^\/play\/[A-Za-z0-9]{10}$/.test(path) ? "Game" : "Play chess"
  return item.label
}

// Desktop: a side menu, like a game's main menu.
export function SideNav({ account, showSwitch = true }: { account: React.ReactNode; showSwitch?: boolean }) {
  const path = usePathname()
  return (
    <aside className="sticky top-0 hidden h-dvh w-[212px] shrink-0 flex-col border-r border-[var(--g-line)] bg-[var(--g-side)] lg:flex">
      <Link href="/play" className="flex items-center px-5 pb-3 pt-5">
        <Image src="/brand/logo-footer.webp" alt="The 64 Squares" width={388} height={160} className="h-[44px] w-auto" priority />
      </Link>
      {showSwitch && <ExperienceSwitch active="play" dark className="mx-4 mb-3" />}
      <nav className="flex flex-col gap-1 px-3">
        {PLAY_NAV.map((n) => {
          const on = isActive(path, n.href)
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold transition ${
                on ? "bg-[var(--g-panel-3)] text-white" : "text-[var(--g-muted)] hover:bg-[var(--g-panel)] hover:text-white"
              }`}
            >
              <GIcon name={n.icon} className={on ? "text-[var(--g-gold)]" : ""} />
              {n.label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t border-[var(--g-line)] p-3">
        <button
          type="button"
          onClick={openBoardSettings}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium text-[var(--g-muted)] hover:bg-[var(--g-panel)] hover:text-white"
        >
          <GearIcon />
          Board settings
        </button>
        {account}
        <Link href="/shop" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-[var(--g-muted)] hover:bg-[var(--g-panel)] hover:text-white">
          <GIcon name="shop" size={20} />
          Back to the shop
        </Link>
      </div>
    </aside>
  )
}

// Phones: a slim top bar with a back arrow, and tabs at the bottom.
export function MobileBar({ showSwitch = true }: { showSwitch?: boolean }) {
  const path = usePathname()
  const home = path === "/play"
  return (
    <header className="sticky top-0 z-30 flex h-[52px] items-center gap-2 border-b border-[var(--g-line)] bg-[var(--g-side)] px-2 lg:hidden">
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
      <button type="button" aria-label="Board settings" onClick={openBoardSettings} className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--g-muted)]">
        <GearIcon size={22} />
      </button>
    </header>
  )
}

export function MobileTabs() {
  const path = usePathname()
  // While playing, the board and its buttons get the whole screen.
  if (/^\/play\/[A-Za-z0-9]{10}$/.test(path) || path === "/play/computer") return null
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid h-[62px] grid-cols-5 border-t border-[var(--g-line)] bg-[var(--g-side)] pb-[env(safe-area-inset-bottom)] lg:hidden">
      {MOBILE_TABS.map((href) => {
        const n = PLAY_NAV.find((x) => x.href === href)!
        const on = isActive(path, href)
        return (
          <Link key={href} href={href} className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${on ? "text-[var(--g-gold)]" : "text-[var(--g-muted)]"}`}>
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
