import Image from "next/image"
import Link from "next/link"
import type { ComponentType } from "react"
import { type FooterLink, type SiteNavigation, getContent, getSiteNavigation } from "@/lib/data"
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
  const [site, nav] = await Promise.all([getContent("site"), getSiteNavigation()])
  const media = site.find((b) => b.section === "footer_media")?.image_url
  const f = nav.footer

  return (
    <footer className="bg-black text-white">
      <div className="mx-auto grid min-h-[192px] max-w-[1440px] grid-cols-[1fr_auto] px-0 pb-6 sm:grid-cols-2 lg:h-[360px] lg:grid-cols-[minmax(0,1fr)_398px_370px] lg:pb-0">
        {media ? (
          <div className="pl-[24px] pt-[24px] lg:pl-[146px] lg:pt-0">
            <Media
              src={media}
              className="h-[150px] w-[150px] object-cover sm:h-[200px] sm:w-[200px] lg:h-[360px] lg:w-[360px]"
            />
          </div>
        ) : (
          <div className="relative pl-[41px] pt-[50px] lg:pl-[190px] lg:pt-[71px]">
            <Link href="/" aria-label="The64Squares home">
              <Image
                src="/brand/logo-footer.webp"
                alt="The64Squares"
                width={479}
                height={480}
                className="h-[80px] w-[80px] lg:h-[165px] lg:w-[160px]"
              />
            </Link>
            <p className="relative mt-[23px] inline-block pl-1 text-[10px] lg:mt-[45px] lg:pl-2 lg:text-[16px]">
              {f.tagline}
              <svg
                className="absolute -right-[8px] top-[1px] h-[34px] w-[8px] lg:-right-[12px] lg:top-[2px] lg:h-[70px] lg:w-[14px]"
                viewBox="0 0 14 70"
                preserveAspectRatio="none"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                aria-hidden="true"
              >
                <path d="M1 1c6 0 10 3 10 9v60" vectorEffect="non-scaling-stroke" />
              </svg>
            </p>
          </div>
        )}

        <div className="hidden lg:block lg:pt-[57px]">
          <h2 className="font-display text-[44px] lg:text-[64px]">{f.col1_title}</h2>
          <FooterLinks links={f.col1_links} className="mt-5 space-y-[6px] pl-[7px] text-[20px] leading-[26px]" />
          <SocialLinks socials={f.socials} className="mt-[17px] flex items-center gap-[20px] pl-[7px]" size="h-[32px] w-[32px]" />
        </div>

        <div className="pr-6 pt-[38px] lg:pr-0 lg:pt-[57px]">
          <h2 className="font-display text-[32px] lg:text-[64px]">{f.col2_title}</h2>
          <FooterLinks
            links={f.col2_links}
            className="mt-[12px] space-y-[4px] pl-[3px] text-[11px] leading-[14px] lg:mt-5 lg:space-y-[6px] lg:pl-[6px] lg:text-[20px] lg:leading-[26px]"
          />
          <SocialLinks socials={f.socials} className="mt-[16px] flex items-center gap-[10px] lg:hidden" size="h-[16px] w-[16px]" />
        </div>
      </div>
    </footer>
  )
}
