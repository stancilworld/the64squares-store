import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { STATE_CODES, loadInvoiceSettings, missingFields, saveInvoiceSettings } from "../../../lib/invoices"
import type { InvoiceSettingsBodyType } from "../validators"

// GET /admin/invoice-settings
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const settings = await loadInvoiceSettings(req.scope)
  res.json({ settings, missing: missingFields(settings), states: Object.keys(STATE_CODES).sort() })
}

// POST /admin/invoice-settings
export const POST = async (req: AuthenticatedMedusaRequest<InvoiceSettingsBodyType>, res: MedusaResponse) => {
  const next = { ...(await loadInvoiceSettings(req.scope)), ...req.validatedBody }
  next.gstin = next.gstin.trim().toUpperCase()
  next.pan = next.pan.trim().toUpperCase()
  const missing = missingFields(next)
  if (next.enabled && missing.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Fill in the ${missing.join(", ")} before switching invoices on.`)
  }
  await saveInvoiceSettings(req.scope, next)
  res.json({ settings: next, missing, states: Object.keys(STATE_CODES).sort() })
}
