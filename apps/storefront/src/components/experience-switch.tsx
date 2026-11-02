import Link from "next/link"

// The Shop / Play switch. Shown at the top of the shop and in the Play menu
// (it can be turned off in the admin: Website → Menu & footer).
export function ExperienceSwitch({ active, dark = false, className = "" }: { active: "shop" | "play"; dark?: boolean; className?: string }) {
  const base = "flex h-full items-center justify-center rounded-full px-3.5 text-[13px] font-semibold transition sm:px-4"
  const on = dark ? "bg-[var(--g-gold)] text-[#1d1408] shadow" : "bg-velvet text-white shadow"
  const off = dark ? "text-[var(--g-muted)] hover:text-white" : "text-black/60 hover:text-black"
  return (
    <nav aria-label="Shop or play" className={`flex h-[34px] shrink-0 items-center rounded-full p-[3px] ${dark ? "bg-[var(--g-panel-2)]" : "bg-linen"} ${className}`}>
      <Link href="/shop" aria-current={active === "shop" ? "page" : undefined} className={`${base} ${active === "shop" ? on : off}`}>
        Shop
      </Link>
      <Link href="/play" aria-current={active === "play" ? "page" : undefined} className={`${base} ${active === "play" ? on : off}`}>
        Play
      </Link>
    </nav>
  )
}
