"use client"

import { usePathname } from "next/navigation"
import Script from "next/script"
import { useEffect, useRef } from "react"

// Google Analytics 4 and the Meta Pixel, loaded only when their ids are set in the admin.
export function Analytics({ ga4, pixel }: { ga4: string; pixel: string }) {
  const path = usePathname()
  const first = useRef(true)
  // The pixel counts the first page itself; later page changes inside the site are sent here.
  // (Google Analytics notices them on its own.)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    ;(window as Window & { fbq?: (...a: unknown[]) => void }).fbq?.("track", "PageView")
  }, [path])

  return (
    <>
      {ga4 && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(ga4)});`}
          </Script>
        </>
      )}
      {pixel && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(pixel)});fbq('track','PageView');`}
        </Script>
      )}
    </>
  )
}
