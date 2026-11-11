import Link from "next/link"

// Leaderboard: our players, or FIDE's official rankings.
export function LeaderboardSwitch({ on }: { on: "ours" | "fide" }) {
  const item = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-9 items-center rounded-full px-4 text-[14px] font-bold transition ${active ? "bg-white text-black" : "text-[var(--g-muted)] hover:text-white"}`}
    >
      {label}
    </Link>
  )
  return (
    <nav aria-label="Leaderboards" className="inline-flex gap-1 rounded-full bg-[var(--g-panel)] p-1">
      {item("/play/leaderboard", "The 64 Squares", on === "ours")}
      {item("/play/leaderboard/fide", "FIDE rankings", on === "fide")}
    </nav>
  )
}
