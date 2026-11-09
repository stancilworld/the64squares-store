import Link from "next/link"
import { formatPrice } from "@/lib/format"
import { dateBlock, eventTime, ratingText, type Tournament, whereText } from "@/lib/tournament-types"

// One tournament in the list: a calendar date, what it is, and whether places are left.
export function TournamentRow({ t, past = false }: { t: Tournament; past?: boolean }) {
  const d = dateBlock(t.starts_at)
  const status =
    t.status === "cancelled"
      ? "Cancelled"
      : past || t.status === "completed"
        ? "Finished"
        : t.registration_open
          ? t.places_left != null
            ? `${t.places_left} ${t.places_left === 1 ? "place" : "places"} left`
            : "Registration open"
          : t.registration_note ?? "Registration closed"
  return (
    <li>
      <Link
        href={`/tournaments/${t.handle}`}
        className="group grid grid-cols-[72px_1fr] gap-x-5 gap-y-3 border border-rule p-4 transition-colors hover:border-black sm:grid-cols-[88px_1fr_auto] sm:items-center sm:p-5"
      >
        <div className={`flex flex-col items-center justify-center rounded-md py-3 ${past ? "bg-chalk text-muted" : "bg-amber text-black"}`}>
          <span className="text-[12px]">{d.weekday}</span>
          <span className="font-display text-[30px] leading-none">{d.day}</span>
          <span className="text-[12px]">{d.month}</span>
        </div>
        <div className="min-w-0">
          <h3 className="font-display h-sub group-hover:underline group-hover:decoration-amber group-hover:underline-offset-4">{t.title}</h3>
          {t.summary && <p className="mt-1 line-clamp-2 text-[15px] text-muted">{t.summary}</p>}
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            <span>
              {t.format_label}, {t.time_control}
            </span>
            <span>{eventTime(t.starts_at)}</span>
            <span>{whereText(t)}</span>
            <span>{t.entry_fee > 0 ? `${formatPrice(t.entry_fee)} entry` : "Free entry"}</span>
            <span>{ratingText(t)}</span>
          </p>
        </div>
        <div className="col-span-2 flex items-center justify-between gap-4 border-t border-rule pt-3 sm:col-span-1 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
          <span className={`text-[13px] ${t.registration_open && !past ? "text-good" : "text-muted"}`}>{status}</span>
          {!past && t.registration_open && <span className="btn btn-solid h-[40px] px-5 text-[14px]">Register</span>}
        </div>
      </Link>
    </li>
  )
}
