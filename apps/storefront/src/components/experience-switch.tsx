import Link from "next/link"

// The Shop / Play switch. Shown at the top of the shop and in the Play menu
// (it can be turned off in the admin: Website → Menu & footer).
export function ExperienceSwitch({ active, dark = false, className = "" }: { active: "shop" | "play"; dark?: boolean; className?: string }) {
  const base = "flex h-full flex-1 items-center justify-center px-3.5 text-[13px] font-bold transition-colors sm:px-4"
  const on = dark ? "bg-[var(--g-accent)] text-black" : "bg-black text-white"
  const off = dark ? "text-[var(--g-muted)] hover:text-white" : "text-black/60 hover:text-black"
  return (
    <nav
      aria-label="Shop or play"
      className={`flex h-[34px] shrink-0 items-center overflow-hidden rounded-sm border ${dark ? "border-[var(--g-line)] bg-[var(--g-panel)]" : "border-black bg-white"} ${className}`}
    >
      <Link href="/shop" aria-current={active === "shop" ? "page" : undefined} className={`${base} ${active === "shop" ? on : off}`}>
        Shop
      </Link>
      <Link href="/play" aria-current={active === "play" ? "page" : undefined} className={`${base} ${active === "play" ? on : off}`}>
        Play
      </Link>
    </nav>
  )
}
