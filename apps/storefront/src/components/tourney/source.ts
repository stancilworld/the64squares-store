// Where a visitor came from, for the organisers' funnel report: the utm_source on the link,
// else the site that sent them, else "direct". Kept for the visit so registering later on
// another page still counts for the same source. No personal data: a random visitor id.

const SOURCE_KEY = "t64:src"
const VISITOR_KEY = "t64:visitor"

export const trafficSource = () => {
  try {
    const utm = new URLSearchParams(location.search).get("utm_source")
    if (utm) {
      sessionStorage.setItem(SOURCE_KEY, utm.toLowerCase().slice(0, 60))
    } else if (!sessionStorage.getItem(SOURCE_KEY)) {
      const ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""
      sessionStorage.setItem(SOURCE_KEY, ref && ref !== location.hostname.replace(/^www\./, "") ? ref : "direct")
    }
    return sessionStorage.getItem(SOURCE_KEY) || "direct"
  } catch {
    return "direct"
  }
}

export const visitorId = () => {
  try {
    let id = localStorage.getItem(VISITOR_KEY)
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "")
      localStorage.setItem(VISITOR_KEY, id)
    }
    return id
  } catch {
    return null
  }
}
