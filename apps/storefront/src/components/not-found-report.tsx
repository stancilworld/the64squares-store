"use client"

import { useEffect } from "react"

// Tells the admin someone reached a missing address (SEO → Not found), so it can be redirected.
export function NotFoundReport() {
  useEffect(() => {
    const ref = document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : document.referrer ? new URL(document.referrer).pathname : ""
    void fetch("/api/seo/not-found", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: location.pathname, referrer: ref }),
      keepalive: true,
    }).catch(() => {})
  }, [])
  return null
}
