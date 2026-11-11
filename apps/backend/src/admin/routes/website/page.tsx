import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  ArrowUpRightOnBox,
  BarsThree,
  ChatBubbleLeftRight,
  ComputerDesktop,
  DocumentText,
  Envelope,
  House,
  Lifebuoy,
  Newspaper,
  Sparkles,
  Swatch,
  Users,
} from "@medusajs/icons"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import type { ComponentType } from "react"
import { Link } from "react-router-dom"
import { useStoreUrl } from "../../lib/site"
import { useMe } from "../../lib/staff"

type Section = {
  title: string
  description: string
  to: string
  sitePath: string
  icon: ComponentType<{ className?: string }>
  permission: string
}

const SECTIONS: Section[] = [
  {
    title: "Homepage",
    description: "Banner slides, featured collection, the gang band and the newsletter box.",
    to: "/website/homepage",
    sitePath: "/",
    icon: House,
    permission: "content.homepage",
  },
  {
    title: "About us",
    description: "Who are we?, the team faces and the Get in touch section.",
    to: "/website/about-us",
    sitePath: "/about",
    icon: Users,
    permission: "content.about",
  },
  {
    title: "Blog",
    description: "The 64 Squares Journal: write drafts and publish posts.",
    to: "/website/blog",
    sitePath: "/blog",
    icon: Newspaper,
    permission: "content.blog",
  },
  {
    title: "News",
    description: "News articles with a full editor: headings, pictures, tables, videos. Shown in the Play area at /play/news.",
    to: "/website/news",
    sitePath: "/play/news",
    icon: DocumentText,
    permission: "content.news",
  },
  {
    title: "Help pages",
    description: "Delivery, Returns & warranty, FAQs, Privacy and Terms.",
    to: "/website/help-pages",
    sitePath: "/help/faqs",
    icon: Lifebuoy,
    permission: "content.help",
  },
  {
    title: "Contact page",
    description: "Ways to reach you (email, WhatsApp, hours…) and the message form's questions.",
    to: "/website/contact",
    sitePath: "/contact",
    icon: Envelope,
    permission: "content.contact",
  },
  {
    title: "Chat bot",
    description: "The help bubble on every page: its answers, buttons, WhatsApp handover, free AI and past chats.",
    to: "/website/chatbot",
    sitePath: "/",
    icon: ChatBubbleLeftRight,
    permission: "content.chatbot",
  },
  {
    title: "Menu & footer",
    description: "Top menu words and links, footer links and social icons, and the announcement bar.",
    to: "/website/navigation",
    sitePath: "/",
    icon: BarsThree,
    permission: "content.footer",
  },
  {
    title: "Footer animation",
    description: "The animation at the bottom of every page.",
    to: "/website/footer",
    sitePath: "/",
    icon: Sparkles,
    permission: "content.footer",
  },
  {
    title: "Branding",
    description: "The logo on the admin sign-in page.",
    to: "/settings/branding",
    sitePath: "",
    icon: Swatch,
    permission: "settings.branding",
  },
]

const WebsitePage = () => {
  const storeUrl = useStoreUrl()
  const { can } = useMe()
  const sections = SECTIONS.filter((s) => can(s.permission))

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex items-start justify-between gap-x-4 px-6 py-4">
        <div>
          <Heading level="h1">Website</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Everything shoppers see on the website, apart from products. Pick a section to edit it. Changes show on the
            website within about a minute.
          </Text>
        </div>
        {storeUrl && (
          <Button size="small" variant="secondary" asChild>
            <a href={storeUrl} target="_blank" rel="noreferrer">
              <ArrowUpRightOnBox />
              View website
            </a>
          </Button>
        )}
      </Container>
      {sections.length === 0 ? (
        <Container className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            You don't have access to any website sections yet. Ask the admin to switch them on for you.
          </Text>
        </Container>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((s) => (
            <Container key={s.to} className="flex flex-col gap-y-3 px-5 py-4">
              <div className="flex items-center gap-x-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-ui-bg-component text-ui-fg-subtle shadow-borders-base">
                  <s.icon />
                </span>
                <Heading level="h2">{s.title}</Heading>
              </div>
              <Text size="small" className="flex-1 text-ui-fg-subtle">
                {s.description}
              </Text>
              <div className="flex items-center gap-x-2">
                <Button size="small" asChild>
                  <Link data-keep to={s.to}>Edit</Link>
                </Button>
                {storeUrl && s.sitePath && (
                  <Button size="small" variant="transparent" asChild>
                    <a href={storeUrl + s.sitePath} target="_blank" rel="noreferrer">
                      View on website
                    </a>
                  </Button>
                )}
              </div>
            </Container>
          ))}
        </div>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Website",
  icon: ComputerDesktop,
  rank: 2,
})

export default WebsitePage
