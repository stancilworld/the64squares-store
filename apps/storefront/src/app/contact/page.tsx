import type { Metadata } from "next"
import type { ReactNode } from "react"
import { ContactForm } from "@/components/contact-form"
import { ClockIcon, InfoIcon, InstagramIcon, LinkIcon, MailIcon, PhoneIcon, PinIcon, WhatsAppIcon } from "@/components/icons"
import { PlaceholderPage } from "@/components/placeholder-page"
import { getContactPage } from "@/lib/data"
import type { ContactPanelItem } from "@/lib/types"

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with The 64 Squares: email, WhatsApp or send us a message.",
}

const ICONS: Record<ContactPanelItem["type"], (p: { className?: string }) => ReactNode> = {
  email: MailIcon,
  phone: PhoneIcon,
  whatsapp: WhatsAppIcon,
  instagram: InstagramIcon,
  hours: ClockIcon,
  address: PinIcon,
  link: LinkIcon,
  text: InfoIcon,
}

const digits = (v: string) => {
  const d = v.replace(/\D/g, "")
  return d.length === 10 ? `91${d}` : d
}

const instagram = (v: string) => {
  const t = v.trim()
  if (/^https?:\/\//i.test(t)) {
    const handle = t.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "")
    return { href: t, text: handle ? `@${handle}` : t }
  }
  const handle = t.replace(/^@/, "")
  return { href: `https://www.instagram.com/${handle}`, text: `@${handle}` }
}

function PanelItem({ item }: { item: ContactPanelItem }) {
  const Icon = ICONS[item.type]
  const v = item.value.trim()
  let body: ReactNode
  if (item.type === "email") {
    body = (
      <a href={`mailto:${v}`} className="break-all text-[18px] underline-offset-4 hover:underline">
        {v}
      </a>
    )
  } else if (item.type === "phone") {
    body = (
      <a href={`tel:+${digits(v)}`} className="text-[18px] underline-offset-4 hover:underline">
        {v}
      </a>
    )
  } else if (item.type === "whatsapp") {
    const text = item.message.trim() ? `?text=${encodeURIComponent(item.message.trim())}` : ""
    body = (
      <a
        href={`https://wa.me/${digits(v)}${text}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex h-[46px] items-center gap-[10px] rounded-full bg-[#25d366] px-6 text-[16px] font-semibold text-white hover:bg-[#1ebe5a]"
      >
        <WhatsAppIcon className="h-[20px] w-[20px]" />
        {item.button_label || "Chat on WhatsApp"}
      </a>
    )
  } else if (item.type === "instagram") {
    const ig = instagram(v)
    body = (
      <a href={ig.href} target="_blank" rel="noopener noreferrer" className="text-[18px] underline-offset-4 hover:underline">
        {ig.text} ↗
      </a>
    )
  } else if (item.type === "link") {
    const external = /^https?:\/\//i.test(v)
    body = (
      <a
        href={v}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="mt-1 btn btn-outline"
      >
        {item.button_label || "Open"}
      </a>
    )
  } else {
    body = <p className="whitespace-pre-line text-[17px] leading-[27px]">{v}</p>
  }
  return (
    <li className="flex flex-col gap-[8px]">
      {item.label && (
        <span className="flex items-center gap-[8px] text-[13px] font-medium text-muted">
          <Icon className="h-[18px] w-[18px]" />
          {item.label}
        </span>
      )}
      <div>{body}</div>
    </li>
  )
}

export default async function ContactPage() {
  const page = await getContactPage()
  if (!page) {
    return <PlaceholderPage title="Say hello" text="Our contact details are on their way." />
  }
  return (
    <div className="mx-auto mb-[96px] max-w-[1440px] px-5 pt-[48px] lg:mb-[150px] lg:px-[128px] lg:pt-[63px]">
      <h1 className="font-display h-page">{page.title}</h1>
      {page.intro && <p className="mt-[16px] max-w-[760px] text-[17px] leading-[27px] lg:mt-[20px] lg:text-[20px] lg:leading-[31px]">{page.intro}</p>}
      <div className="mt-[40px] grid grid-cols-1 gap-[24px] lg:mt-[56px] lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-[40px]">
        {page.panel.length > 0 && (
          <section aria-labelledby="contact-panel" className="self-start rounded-md bg-pill px-[28px] py-[32px] lg:px-[40px] lg:py-[44px]">
            <h2 id="contact-panel" className="font-display h-section">
              {page.panel_title}
            </h2>
            <ul className="mt-[28px] flex flex-col gap-[26px]">
              {page.panel.map((i) => (
                <PanelItem key={i.id} item={i} />
              ))}
            </ul>
          </section>
        )}
        <section aria-label="Send us a message" className="rounded-md border border-black px-[22px] py-[30px] lg:px-[48px] lg:py-[44px]">
          <ContactForm page={page} />
        </section>
      </div>
    </div>
  )
}
