import type { Metadata } from "next"
import { Suspense } from "react"
import "@fontsource/inter/400.css"
import "@fontsource/inter/500.css"
import "@fontsource/inter/600.css"
import "./globals.css"
import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { ColoursProvider } from "@/components/colours-provider"
import { AnnouncementBar } from "@/components/announcement-bar"
import { PreviewBar } from "@/components/preview-bar"
import { ChatWidget } from "@/components/chat-widget"
import { getChatbot, getColourPalette, getSiteNavigation } from "@/lib/data"
import { ListProvider } from "@/lib/list"
import { SITE_URL } from "@/lib/site"

const DESCRIPTION = "Premium chess sets, boards, pieces and clocks, made in India. Play online and join tournaments."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Stancil | Furniture for little stories", template: "%s | Stancil" },
  description: DESCRIPTION,
  icons: { icon: "/brand/logo-header.png" },
  openGraph: {
    type: "website",
    siteName: "Stancil",
    title: "Stancil | Furniture for little stories",
    description: DESCRIPTION,
    locale: "en_IN",
  },
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [palette, nav, chatbot] = await Promise.all([getColourPalette(), getSiteNavigation(), getChatbot()])
  return (
    <html lang="en-IN" className="antialiased">
      <body className="flex min-h-screen flex-col">
        <ColoursProvider palette={palette}>
        <ListProvider>
          <PreviewBar />
          <AnnouncementBar a={nav.announcement} />
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          {chatbot && (
            <Suspense fallback={null}>
              <ChatWidget config={chatbot} />
            </Suspense>
          )}
        </ListProvider>
        </ColoursProvider>
      </body>
    </html>
  )
}
