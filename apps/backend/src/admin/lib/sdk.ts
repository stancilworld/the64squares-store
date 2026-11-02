import Medusa from "@medusajs/js-sdk"

// The address the admin was built for (MEDUSA_BACKEND_URL, e.g. https://api.stancil.in).
// Medusa's own screens use the same one, so the login session is shared even when the admin
// is opened from another address (such as the old api-staging one).
export const BACKEND_URL = (
  (typeof __BACKEND_URL__ !== "undefined" && __BACKEND_URL__) ||
  import.meta.env.VITE_BACKEND_URL ||
  "/"
).replace(/\/$/, "") || "/"

export const sdk = new Medusa({
  baseUrl: BACKEND_URL,
  debug: import.meta.env.DEV,
  auth: { type: "session" },
})
