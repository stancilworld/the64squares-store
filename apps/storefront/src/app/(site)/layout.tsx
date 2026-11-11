import { Suspense } from "react"
import { AnnouncementBar } from "@/components/announcement-bar"
import { ChatWidget } from "@/components/chat-widget"
import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { LiveGameBanner } from "@/components/play/live-game-banner"
import { PreviewBar } from "@/components/preview-bar"
import { PushPrompt } from "@/components/push-prompt"
import { SitePopup } from "@/components/site-popup"
import { getChatbot, getSiteFeatures, getSiteNavigation } from "@/lib/data"

// The shop and content pages: header, footer, chat. (Play has its own full-screen layout.)
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [nav, chatbot, features] = await Promise.all([getSiteNavigation(), getChatbot(), getSiteFeatures()])
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
      {/* Both read the page address, so they load after the page itself. */}
      <Suspense fallback={null}>
        {features.popup.enabled && <SitePopup popup={features.popup} />}
        {features.push.enabled && <PushPrompt afterSeconds={features.push.prompt_after_seconds} />}
      </Suspense>
      {chatbot && (
        <Suspense fallback={null}>
          <ChatWidget config={chatbot} />
        </Suspense>
      )}
    </>
  )
}
