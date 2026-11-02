import { Suspense } from "react"
import { AnnouncementBar } from "@/components/announcement-bar"
import { ChatWidget } from "@/components/chat-widget"
import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { LiveGameBanner } from "@/components/play/live-game-banner"
import { PreviewBar } from "@/components/preview-bar"
import { getChatbot, getSiteNavigation } from "@/lib/data"

// The shop and content pages: header, footer, chat. (Play has its own full-screen layout.)
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [nav, chatbot] = await Promise.all([getSiteNavigation(), getChatbot()])
  return (
    <>
      <PreviewBar />
      <AnnouncementBar a={nav.announcement} />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <Suspense fallback={null}>
        <LiveGameBanner />
      </Suspense>
      {chatbot && (
        <Suspense fallback={null}>
          <ChatWidget config={chatbot} />
        </Suspense>
      )}
    </>
  )
}
