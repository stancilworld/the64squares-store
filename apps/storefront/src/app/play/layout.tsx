import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { BoardSettingsModal } from "@/components/chess/board-settings"
import { ChallengeDialog } from "@/components/play/challenge-dialog"
import { PlayLive } from "@/components/play-shell/live"
import { getPlayPass } from "@/lib/play"
import { GIcon } from "@/components/play-shell/icons"
import { MobileBar, MobileTabs, SideNav } from "@/components/play-shell/nav"
import { getCustomer } from "@/lib/auth"
import { getSiteNavigation } from "@/lib/data"

export const metadata: Metadata = { title: { default: "Play chess", template: "%s | Play | The 64 Squares" } }

async function Account() {
  const c = await getCustomer()
  return (
    <Link
      href={c ? "/play/profile" : "/account?next=/play"}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-[var(--g-muted)] hover:bg-[var(--g-panel)] hover:text-white"
    >
      <GIcon name="user" size={20} />
      <span className="truncate">{c ? c.first_name || c.email.split("@")[0] : "Sign in"}</span>
    </Link>
  )
}

async function Side() {
  const nav = await getSiteNavigation()
  return (
    <SideNav
      showSwitch={nav.experience?.show_switch !== false}
      account={
        <Suspense fallback={null}>
          <Account />
        </Suspense>
      }
    />
  )
}

async function Live() {
  return <PlayLive pass={await getPlayPass()} />
}

async function Top() {
  const nav = await getSiteNavigation()
  return <MobileBar showSwitch={nav.experience?.show_switch !== false} />
}

const navFallback = <aside className="hidden w-[212px] shrink-0 bg-[var(--g-side)] lg:block" />

// The game area: full screen, its own menu, no shop header or footer.
export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="play-ui flex min-h-dvh">
      <Suspense fallback={navFallback}>
        <Side />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="h-[52px] bg-[var(--g-side)] lg:hidden" />}>
          <Top />
        </Suspense>
        <main className="flex-1 px-3 pb-[78px] pt-3 sm:px-5 lg:px-8 lg:pb-6 lg:pt-6">{children}</main>
        <Suspense fallback={null}>
          <MobileTabs />
        </Suspense>
        <BoardSettingsModal />
        <ChallengeDialog />
        <Suspense fallback={null}>
          <Live />
        </Suspense>
      </div>
    </div>
  )
}
