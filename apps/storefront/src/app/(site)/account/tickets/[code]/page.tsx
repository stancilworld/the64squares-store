import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import QRCode from "qrcode"
import { Suspense } from "react"
import { TicketActions } from "@/components/tournaments/ticket-actions"
import { getToken } from "@/lib/auth"
import { formatPrice } from "@/lib/format"
import { getMyTicket } from "@/lib/tournament-actions"
import { eventDate, eventTime } from "@/lib/tournament-types"

export const metadata: Metadata = { title: "Your ticket", robots: { index: false } }

async function TicketView({ params, searchParams }: PageProps<"/account/tickets/[code]">) {
  const { code } = await params
  const sp = await searchParams
  if (!(await getToken())) redirect(`/account?next=/account/tickets/${encodeURIComponent(code)}`)
  const ticket = await getMyTicket(code)
  if (!ticket) {
    return (
      <div className="py-16 text-center">
        <h1 className="font-display h-page">Ticket not found</h1>
        <p className="mt-3 text-muted">It may belong to another account. Your tickets are listed in your account.</p>
        <Link href="/account" className="btn btn-solid mt-6">
          Go to my account
        </Link>
      </div>
    )
  }
  const ev = ticket.tournament
  const qr = await QRCode.toString(ticket.qr_url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
  const cancelled = ticket.status === "cancelled"

  return (
    <div className="mx-auto max-w-[760px]">
      {sp.new && !cancelled && (
        <p role="status" className="mb-6 rounded-md bg-maple-soft px-5 py-4 text-[15px]">
          You&apos;re registered. We&apos;ve emailed this ticket to {ticket.email}.
        </p>
      )}
      <article className={`overflow-hidden rounded-md border ${cancelled ? "border-rule opacity-70" : "border-black"} print:border-black`}>
        <div className="bg-velvet px-6 py-5 text-white print:bg-white print:text-black">
          <p className="text-[13px] text-maple print:text-black">Tournament ticket</p>
          <h1 className="font-display h-section mt-1">{ev.title}</h1>
        </div>
        <div className="grid gap-6 p-6 sm:grid-cols-[1fr_200px]">
          <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2.5 text-[15px]">
            <dt className="text-muted">Player</dt>
            <dd className="font-medium">{ticket.player_name}</dd>
            <dt className="text-muted">When</dt>
            <dd>
              {eventDate(ev.starts_at)}
              <br />
              {eventTime(ev.starts_at)}
            </dd>
            <dt className="text-muted">Where</dt>
            <dd className="whitespace-pre-line">{ev.mode === "online" ? "Online, on The 64 Squares" : ev.venue ?? "Venue to be announced"}</dd>
            <dt className="text-muted">Format</dt>
            <dd>
              {ev.format_label}, {ev.time_control}
            </dd>
            {ev.entry_fee > 0 && (
              <>
                <dt className="text-muted">Entry fee</dt>
                <dd>
                  {formatPrice(ev.entry_fee)}
                  {ev.mode === "offline" ? ", pay at the venue" : ""}
                </dd>
              </>
            )}
            {ticket.rating != null && (
              <>
                <dt className="text-muted">Rating</dt>
                <dd>
                  {ticket.rating}
                  {ticket.fide_id ? ` (FIDE ${ticket.fide_id})` : ""}
                </dd>
              </>
            )}
          </dl>
          <div className="flex flex-col items-center gap-3 border-t border-dashed border-rule pt-6 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            {cancelled ? (
              <p className="py-10 text-center text-[15px] font-medium text-love">Cancelled</p>
            ) : (
              <div className="w-[168px] [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label={`QR code for ticket ${ticket.ticket_code}`} dangerouslySetInnerHTML={{ __html: qr }} />
            )}
            <p className="font-mono text-[18px] font-semibold tracking-[0.12em]">{ticket.ticket_code}</p>
            {ticket.checked_in_at && <p className="text-[13px] text-velvet">Checked in</p>}
          </div>
        </div>
        <p className="border-t border-rule bg-linen px-6 py-3 text-[13px] text-muted print:bg-white">
          {cancelled
            ? "This place was cancelled."
            : ev.mode === "offline"
              ? "Show this QR code at the door to check in."
              : "Keep this code handy. You may need it to join on the day."}
        </p>
      </article>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <TicketActions code={ticket.ticket_code} canCancel={ticket.can_cancel} />
        <Link href={`/tournaments/${ev.handle}`} className="text-[15px] underline underline-offset-4 print:hidden">
          Tournament details
        </Link>
      </div>
    </div>
  )
}

export default function TicketPage(props: PageProps<"/account/tickets/[code]">) {
  return (
    <section className="mx-auto max-w-[1440px] px-6 pb-20 pt-10 lg:px-10 lg:pb-28 lg:pt-14">
      <Suspense fallback={<p className="text-center text-muted">Loading your ticket…</p>}>
        <TicketView {...props} />
      </Suspense>
    </section>
  )
}
