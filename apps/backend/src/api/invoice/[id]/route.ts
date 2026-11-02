import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { invoiceHtmlFor } from "../../../lib/invoices"

// GET /invoice/:orderId: the printable GST invoice ("Print / Save as PDF"). Linked from the
// confirmation email, the order page, the customer's account and the admin. Order ids are
// long and random, so the id itself is the key (like the order page).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const html = await invoiceHtmlFor(req.scope, req.params.id).catch(() => null)
  res.set("Cache-Control", "private, no-store")
  res.set("X-Robots-Tag", "noindex")
  if (!html) {
    res
      .status(404)
      .type("html")
      .send(
        `<!doctype html><meta charset="utf-8"><title>Invoice</title><body style="font:16px sans-serif;padding:40px;text-align:center"><p>This invoice isn't available yet. Please contact us and we'll send it to you.</p></body>`
      )
    return
  }
  res.type("html").send(html)
}
