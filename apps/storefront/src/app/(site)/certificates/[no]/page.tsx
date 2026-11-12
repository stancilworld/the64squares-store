import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import QRCode from "qrcode"
import { Suspense } from "react"
import { PrintButton } from "@/components/tourney/print-button"
import { absoluteUrl } from "@/lib/seo"
import { eventDate } from "@/lib/tournament-types"
import { getCertificate } from "@/lib/tournaments"

export const metadata: Metadata = { title: "Tournament certificate", robots: { index: false } }

const ordinal = (n: number) => {
  const v = n % 100
  return `${n}${["th", "st", "nd", "rd"][(v - 20) % 10] ?? ["th", "st", "nd", "rd"][v] ?? "th"}`
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : `${Math.floor(n)}½`)

// The chessboard band down each side of the certificate.
const BAND = { background: "repeating-conic-gradient(#173b2c 0 25%, #f4f1e8 0 50%) 0 0/24px 24px" }

async function CertificateView({ params }: { params: Promise<{ no: string }> }) {
  const no = decodeURIComponent((await params).no).toUpperCase()
  const c = await getCertificate(no)
  if (!c) notFound()
  const url = absoluteUrl(`/certificates/${c.number}`)
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#173b2c", light: "#0000" } })
  const podium = c.rank <= 3
  const scoreText = c.score == null ? "" : c.tournament.format === "Knockout" ? `, winning ${fmt(c.score)} ${c.score === 1 ? "round" : "rounds"}` : ` with ${fmt(c.score)} points`

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6 print:max-w-none print:p-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-semibold ${c.final ? "bg-[#e6f4ea] text-[#1e6b3a]" : "bg-[#fff4d6] text-[#7a5600]"}`}>
          <span aria-hidden="true">{c.final ? "✓" : "…"}</span>
          {c.final ? "Genuine certificate, issued by The 64 Squares." : "Genuine certificate. The result is provisional until the fair-play review."}
        </p>
        <PrintButton />
      </div>

      <article className="relative flex overflow-hidden rounded-sm bg-white text-[#14231c] shadow-[0_20px_60px_rgba(0,0,0,0.18)] ring-1 ring-black/10 print:shadow-none print:ring-0" aria-label={`Certificate ${c.number}`}>
        <span aria-hidden="true" className="w-6 shrink-0 sm:w-8" style={BAND} />
        <div className="min-w-0 flex-1 px-5 py-10 sm:px-14 sm:py-14">
          <p className="text-[13px] font-bold tracking-[0.04em] text-[#173b2c]">The 64 Squares</p>
          <h1 className="mt-6 text-[34px] font-extrabold leading-[1.05] tracking-tight sm:text-[50px]">{podium ? "Certificate of Achievement" : "Certificate of Participation"}</h1>
          <p className="mt-8 text-[15px] text-[#4b5a52]">This is to certify that</p>
          <p className="mt-2 border-b-2 border-[#173b2c] pb-3 text-[34px] font-bold leading-tight sm:text-[46px]">{c.player_name}</p>
          {c.city && <p className="mt-2 text-[15px] text-[#4b5a52]">of {c.city}</p>}
          <p className="mt-6 max-w-[620px] text-[18px] leading-relaxed sm:text-[20px]">
            finished <strong>{ordinal(c.rank)}</strong> of {c.players} players{scoreText} in <strong>{c.tournament.title}</strong>, an online {c.tournament.format} tournament ({c.tournament.time_control}) played on {eventDate(c.tournament.starts_at)}.
          </p>

          <div className="mt-12 flex flex-wrap items-end justify-between gap-8">
            <div className="flex items-end gap-5">
              {podium && (
                <span
                  aria-hidden="true"
                  className="grid h-[92px] w-[92px] place-items-center rounded-full text-[36px] font-black text-[#3a2a00] shadow-inner"
                  style={{ background: c.rank === 1 ? "radial-gradient(circle at 35% 30%, #ffe88a, #c9a227 70%)" : c.rank === 2 ? "radial-gradient(circle at 35% 30%, #ffffff, #a9b0b8 70%)" : "radial-gradient(circle at 35% 30%, #f6c79a, #b06d34 70%)" }}
                >
                  {c.rank}
                </span>
              )}
              <div className="min-w-0 text-[13px] leading-relaxed text-[#4b5a52]">
                <p>
                  Certificate no. <span className="font-bold text-[#14231c]">{c.number}</span>
                </p>
                <p>Issued {eventDate(c.issued_at)}</p>
                <p className="break-all">Check it at {url.replace(/^https?:\/\//, "")}</p>
              </div>
            </div>
            <span className="block w-[104px] [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label="QR code to check this certificate" dangerouslySetInnerHTML={{ __html: qr }} />
          </div>
        </div>
        <span aria-hidden="true" className="w-6 shrink-0 sm:w-8" style={BAND} />
      </article>

      <p className="mt-6 text-center text-[14px] text-muted print:hidden">
        <Link href={`/play/tournaments/${c.tournament.handle}`} className="underline underline-offset-2">
          See the tournament and replay its games
        </Link>
      </p>
    </div>
  )
}

export default function CertificatePage(props: { params: Promise<{ no: string }> }) {
  return (
    <Suspense fallback={<div className="h-[700px]" />}>
      <CertificateView {...props} />
    </Suspense>
  )
}
