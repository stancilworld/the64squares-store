import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// GET /admin/site-info: the public store address, for "View on website" buttons in the admin.
export const GET = async (_req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const fromCors = (process.env.STORE_CORS || "").split(",")[0]?.trim()
  const store_url = (process.env.STORE_URL || fromCors || "https://the64squares.in").replace(/\/$/, "")
  res.json({ store_url })
}
