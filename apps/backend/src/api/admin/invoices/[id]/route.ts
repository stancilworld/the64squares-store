import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ensureInvoice, loadInvoiceSettings, missingFields } from "../../../../lib/invoices"

const current = async (req: AuthenticatedMedusaRequest) => {
  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "metadata"],
    filters: { id: req.params.id },
  })
  return ((data[0] as { metadata?: Record<string, any> } | undefined)?.metadata?.invoice ?? null) as {
    number: string
    date: string
  } | null
}

// GET /admin/invoices/:orderId: the order's invoice number, and what's missing if none.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const settings = await loadInvoiceSettings(req.scope)
  res.json({ invoice: await current(req), enabled: settings.enabled, missing: missingFields(settings) })
}

// POST /admin/invoices/:orderId: create the invoice for an order that has none yet
// (e.g. placed before invoices were switched on).
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const invoice = await ensureInvoice(req.scope, req.params.id)
  const settings = await loadInvoiceSettings(req.scope)
  res.json({ invoice, enabled: settings.enabled, missing: missingFields(settings) })
}
