import { Suspense } from "react"
import type { Metadata } from "next"
import "@fontsource/inter/400.css"
import "@fontsource/inter/500.css"
import "@fontsource/inter/600.css"
import "@fontsource-variable/fraunces/full.css"
import "./globals.css"
import { ColoursProvider } from "@/components/colours-provider"
import { Analytics } from "@/components/analytics"
import { getColourPalette, getSiteConfig } from "@/lib/data"
import { ListProvider } from "@/lib/list"
import { SITE_URL } from "@/lib/site"

const DESCRIPTION = "Premium chess sets, boards, pieces and clocks, made in India. Play online and join tournaments."

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSiteConfig()
  const description = config.default_description.trim() || DESCRIPTION
  return {
    ...BASE_METADATA,
    description,
    openGraph: { ...BASE_METADATA.openGraph, description },
    ...(config.google_verification ? { verification: { google: config.google_verification } } : {}),
  }
}

const BASE_METADATA: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "The 64 Squares | Premium chess sets, boards & tournaments", template: "%s | The 64 Squares" },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "The 64 Squares",
    title: "The 64 Squares | Premium chess sets, boards & tournaments",
    description: DESCRIPTION,
    locale: "en_IN",
  },
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [palette, config] = await Promise.all([getColourPalette(), getSiteConfig()])
  return (
    <html lang="en-IN" className="antialiased">
      <body className="flex min-h-screen flex-col">
        <ColoursProvider palette={palette}>
        <ListProvider>
          {children}
        </ListProvider>
        </ColoursProvider>
        {(config.ga4_id || config.meta_pixel_id) && (
          <Suspense fallback={null}>
            <Analytics ga4={config.ga4_id} pixel={config.meta_pixel_id} />
          </Suspense>
        )}
      </body>
    </html>
  )
}
