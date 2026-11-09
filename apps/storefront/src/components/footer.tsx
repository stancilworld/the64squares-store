import Image from "next/image"
import Link from "next/link"
import type { ComponentType } from "react"
import { type FooterLink, type SiteNavigation, getContent, getMarketingConfig, getSiteNavigation } from "@/lib/data"
import { anyTag } from "@/lib/tracking/types"
import { CookieSettingsLink } from "./tracking/tracking"
import { FacebookIcon, InstagramIcon, LinkedInIcon, WhatsAppIcon, YouTubeIcon } from "./icons"
import { Media } from "./media"

const SOCIAL_ICONS: [keyof SiteNavigation["footer"]["socials"], string, ComponentType<{ className?: string }>][] = [
  ["facebook", "Facebook", FacebookIcon],
  ["instagram", "Instagram", InstagramIcon],
  ["linkedin", "LinkedIn", LinkedInIcon],
  ["youtube", "YouTube", YouTubeIcon],
  ["whatsapp", "WhatsApp", WhatsAppIcon],
]

function SocialLinks({ socials, className, size }: { socials: SiteNavigation["footer"]["socials"]; className: string; size: string }) {
  return (
    <div className={className}>
      {SOCIAL_ICONS.filter(([key]) => socials[key]).map(([key, label, Icon]) => (
        <a key={key} href={socials[key]} target="_blank" rel="noopener noreferrer" aria-label={label}>
          <Icon className={size} />
        </a>
      ))}
    </div>
  )
}

// Footer links in rows: a link marked "same line" joins the line above, separated by " · ".
function FooterLinks({ links, className }: { links: FooterLink[]; className: string }) {
  const rows: FooterLink[][] = []
  for (const l of links) {
    if (l.same_line && rows.length) rows[rows.length - 1].push(l)
    else rows.push([l])
  }
  const external = (href: string) => /^https?:\/\//.test(href)
  return (
    <ul className={className}>
      {rows.map((row, i) => (
        <li key={i}>
          {row.map((l, j) => (
            <span key={l.href + l.label}>
              {j > 0 && " · "}
              {external(l.href) ? (
                <a href={l.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {l.label}
                </a>
              ) : (
                <Link href={l.href} className="hover:underline">
                  {l.label}
                </Link>
              )}
            </span>
          ))}
        </li>
      ))}
    </ul>
  )
}

export async function Footer() {
  const [site, nav, marketing] = await Promise.all([getContent("site"), getSiteNavigation(), getMarketingConfig()])
  const media = site.find((b) => b.section === "footer_media")?.image_url
  const f = nav.footer

  return (
    <footer className="board-wash mt-auto bg-ink text-white/80">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-6 pb-10 pt-14 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_1fr_1fr_1fr] lg:gap-12 lg:px-10 lg:pb-12 lg:pt-20">
        <div>
          {media ? (
            <Media src={media} className="h-[160px] w-[160px] rounded-md object-cover lg:h-[200px] lg:w-[200px]" />
          ) : (
            <Link href="/" aria-label="The 64 Squares home" className="inline-block">
              <Image src="/brand/logo-footer.webp" alt="The 64 Squares" width={388} height={160} className="h-[48px] w-auto lg:h-[56px]" />
            </Link>
          )}
          {f.tagline && <p className="mt-6 max-w-[360px] font-display text-[24px] leading-[1.15] text-white">{f.tagline}</p>}
          <SocialLinks socials={f.socials} className="mt-6 flex items-center gap-5" size="h-[22px] w-[22px]" />
        </div>

        <div>
          <h2 className="sq-mark text-[14px] font-bold text-white">{f.col1_title}</h2>
          <FooterLinks links={f.col1_links} className="mt-4 space-y-2.5 text-[15px]" />
        </div>

        <div>
          <h2 className="sq-mark text-[14px] font-bold text-white">{f.col2_title}</h2>
          <FooterLinks links={f.col2_links} className="mt-4 space-y-2.5 text-[15px]" />
        </div>

        {nav.experience?.show_switch !== false && (
          <div>
            <h2 className="sq-mark text-[14px] font-bold text-white">Play</h2>
            <FooterLinks
              links={[
                { label: "Play online", href: "/play" },
                { label: "Puzzles", href: "/play/puzzles" },
                { label: "Tournaments", href: "/tournaments" },
                { label: "Leaderboard", href: "/play/leaderboard" },
              ]}
              className="mt-4 space-y-2.5 text-[15px]"
            />
          </div>
        )}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-5 text-[13px] text-white/55 lg:px-10">
          <p>The 64 Squares, made in India.</p>
          {anyTag(marketing) && <CookieSettingsLink className="underline underline-offset-2 hover:text-white" />}
        </div>
      </div>
    </footer>
  )
}
