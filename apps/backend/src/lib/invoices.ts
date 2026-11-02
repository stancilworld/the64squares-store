import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"
import { saveSettingWorkflow } from "../workflows/setting"

// GST tax invoices for orders. The seller is the GST-registered company (Rural Routes);
// Stancil is its brand. Details are edited in the admin (Settings → Invoices).
//
// Each order gets one invoice number when it's placed (e.g. STN/2026-27/0001, counted per
// financial year, April–March). The seller details, GST rate and number are frozen on the
// order at that moment, so an invoice never changes later even if the settings do.
// Prices on the website include GST; the invoice shows the taxable value and the tax:
// CGST + SGST when delivering inside the seller's state, IGST otherwise.

export const INVOICE_SETTINGS_KEY = "invoice_settings"
const COUNTER_KEY = "invoice_counter"

export type InvoiceSettings = {
  enabled: boolean
  legal_name: string
  brand_line: string
  gstin: string
  pan: string
  address: string
  state: string
  email: string
  phone: string
  prefix: string
  gst_rate: number
  default_hsn: string
  signatory: string
  footer: string
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  enabled: false,
  legal_name: "Rural Routes",
  brand_line: "Stancil · a brand of Rural Routes",
  gstin: "",
  pan: "",
  address: "",
  state: "",
  email: "",
  phone: "",
  prefix: "STN",
  gst_rate: 18,
  default_hsn: "9403",
  signatory: "Authorised Signatory",
  footer: "Thank you for shopping with Stancil. This is a computer-generated invoice.",
}

// GST state codes (first two digits of a GSTIN).
export const STATE_CODES: Record<string, string> = {
  "Jammu and Kashmir": "01", "Himachal Pradesh": "02", Punjab: "03", Chandigarh: "04", Uttarakhand: "05",
  Haryana: "06", Delhi: "07", Rajasthan: "08", "Uttar Pradesh": "09", Bihar: "10", Sikkim: "11",
  "Arunachal Pradesh": "12", Nagaland: "13", Manipur: "14", Mizoram: "15", Tripura: "16", Meghalaya: "17",
  Assam: "18", "West Bengal": "19", Jharkhand: "20", Odisha: "21", Chhattisgarh: "22", "Madhya Pradesh": "23",
  Gujarat: "24", "Dadra and Nagar Haveli and Daman and Diu": "26", Maharashtra: "27", Karnataka: "29", Goa: "30",
  Lakshadweep: "31", Kerala: "32", "Tamil Nadu": "33", Puducherry: "34", "Andaman and Nicobar Islands": "35",
  Telangana: "36", "Andhra Pradesh": "37", Ladakh: "38",
}

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "")

export const stateCode = (state: string | null | undefined) => {
  const n = norm(state)
  const hit = Object.keys(STATE_CODES).find((k) => norm(k) === n)
  return hit ? STATE_CODES[hit] : null
}

type Row = Record<string, any>

const content = (c: MedusaContainer): ContentModuleService => c.resolve(CONTENT_MODULE)

export const loadInvoiceSettings = async (container: MedusaContainer): Promise<InvoiceSettings> => ({
  ...DEFAULT_INVOICE_SETTINGS,
  ...(((await content(container).getSettingValue(INVOICE_SETTINGS_KEY)) ?? {}) as Partial<InvoiceSettings>),
})

// What's still missing before invoices can be issued.
export const missingFields = (s: InvoiceSettings) =>
  [
    !s.legal_name.trim() && "company name",
    !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s.gstin.trim()) && "GSTIN",
    !s.address.trim() && "address",
    !stateCode(s.state) && "state",
  ].filter((x): x is string => !!x)

// "2026-27" for dates from April 2026 to March 2027 (in India time).
export const financialYear = (date: Date) => {
  const ist = new Date(date.getTime() + 330 * 60_000)
  const y = ist.getUTCFullYear()
  const start = ist.getUTCMonth() >= 3 ? y : y - 1
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`
}

export type FrozenInvoice = {
  number: string
  date: string
  seller: Omit<InvoiceSettings, "enabled" | "prefix">
}

const loadOrder = async (container: MedusaContainer, id: string) => {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "created_at",
      "status",
      "email",
      "currency_code",
      "metadata",
      "total",
      "shipping_total",
      "discount_total",
      "items.id",
      "items.product_title",
      "items.title",
      "items.variant_title",
      "items.quantity",
      "items.unit_price",
      "items.total",
      "items.product.hs_code",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.company",
      "shipping_address.address_1",
      "shipping_address.address_2",
      "shipping_address.city",
      "shipping_address.province",
      "shipping_address.postal_code",
      "shipping_address.phone",
      "billing_address.first_name",
      "billing_address.last_name",
      "billing_address.address_1",
      "billing_address.address_2",
      "billing_address.city",
      "billing_address.province",
      "billing_address.postal_code",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.captured_at",
    ],
    filters: { id },
  })
  return data[0] as Row | undefined
}

// Gives the order its invoice number (once) and freezes the seller details on it.
// Returns null while invoices are switched off or the company details are incomplete.
export const ensureInvoice = async (container: MedusaContainer, orderId: string): Promise<FrozenInvoice | null> => {
  const order = await loadOrder(container, orderId)
  if (!order || order.status === "draft") {
    return null
  }
  const existing = (order.metadata ?? {}).invoice as FrozenInvoice | undefined
  if (existing?.number) {
    return existing
  }
  const settings = await loadInvoiceSettings(container)
  if (!settings.enabled || missingFields(settings).length) {
    return null
  }
  const locking = container.resolve(Modules.LOCKING)
  return locking.execute(`invoice-number`, async () => {
    // Someone else may have numbered it while we waited for the lock.
    const fresh = await loadOrder(container, orderId)
    const again = (fresh?.metadata ?? {}).invoice as FrozenInvoice | undefined
    if (again?.number) {
      return again
    }
    const date = new Date(order.created_at)
    const fy = financialYear(date)
    const counters = ((await content(container).getSettingValue(COUNTER_KEY)) ?? {}) as Record<string, number>
    const next = (counters[fy] ?? 0) + 1
    await saveSettingWorkflow(container).run({ input: { key: COUNTER_KEY, value: { ...counters, [fy]: next } } })
    const { enabled: _e, prefix, ...seller } = settings
    const invoice: FrozenInvoice = {
      number: `${prefix.trim() || "INV"}/${fy}/${String(next).padStart(4, "0")}`,
      date: date.toISOString(),
      seller,
    }
    await container.resolve(Modules.ORDER).updateOrders(orderId, {
      metadata: { ...(fresh?.metadata ?? {}), invoice },
    })
    return invoice
  })
}

// ---------------------------------------------------------------- the invoice itself

const r2 = (n: number) => Math.round(n * 100) / 100

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

// Indian-style amount in words, e.g. "Four Thousand Four Hundred Ninety-Nine Rupees Only".
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
const two = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ""}`)
const three = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : "", two(n % 100)].filter(Boolean).join(" ")
export const inWords = (amount: number) => {
  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)
  const parts: string[] = []
  let n = rupees
  const crore = Math.floor(n / 1e7)
  n %= 1e7
  const lakh = Math.floor(n / 1e5)
  n %= 1e5
  const thousand = Math.floor(n / 1e3)
  n %= 1e3
  if (crore) parts.push(`${three(crore)} Crore`)
  if (lakh) parts.push(`${two(lakh)} Lakh`)
  if (thousand) parts.push(`${two(thousand)} Thousand`)
  if (n) parts.push(three(n))
  const words = `${parts.join(" ") || "Zero"} Rupees`
  return paise ? `${words} and ${two(paise)} Paise Only` : `${words} Only`
}

export type InvoiceLine = {
  description: string
  hsn: string
  qty: number
  rate: number // taxable value per unit
  taxable: number
  gst_rate: number
  cgst: number
  sgst: number
  igst: number
  total: number // what the shopper paid for the line, GST included
}

export const computeLines = (order: Row, inv: FrozenInvoice, intraState: boolean) => {
  const rate = Number(inv.seller.gst_rate) || 0
  const lines: InvoiceLine[] = ((order.items ?? []) as Row[]).map((i) => {
    const total = r2(Number(i.total ?? Number(i.unit_price) * Number(i.quantity)))
    const taxable = r2(total / (1 + rate / 100))
    const tax = r2(total - taxable)
    const half = r2(tax / 2)
    return {
      description: [i.product_title ?? i.title, i.variant_title && i.variant_title !== "Default" ? i.variant_title : ""]
        .filter(Boolean)
        .join(" — "),
      hsn: i.product?.hs_code || inv.seller.default_hsn,
      qty: Number(i.quantity),
      rate: r2(taxable / Number(i.quantity)),
      taxable,
      gst_rate: rate,
      cgst: intraState ? half : 0,
      sgst: intraState ? r2(tax - half) : 0,
      igst: intraState ? 0 : tax,
      total,
    }
  })
  const shipping = r2(Number(order.shipping_total ?? 0))
  if (shipping > 0) {
    const taxable = r2(shipping / (1 + rate / 100))
    const tax = r2(shipping - taxable)
    const half = r2(tax / 2)
    lines.push({
      description: "Delivery charges",
      hsn: "996812",
      qty: 1,
      rate: taxable,
      taxable,
      gst_rate: rate,
      cgst: intraState ? half : 0,
      sgst: intraState ? r2(tax - half) : 0,
      igst: intraState ? 0 : tax,
      total: shipping,
    })
  }
  const sum = (k: keyof InvoiceLine) => r2(lines.reduce((s, l) => s + Number(l[k]), 0))
  return {
    lines,
    totals: { taxable: sum("taxable"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), total: sum("total") },
  }
}

const paymentLabel = (order: Row) => {
  const payments = ((order.payment_collections ?? []) as Row[]).flatMap((c) => c?.payments ?? [])
  const online = payments.some((p: Row) => p?.provider_id === "pp_razorpay_razorpay")
  const paid = payments.some((p: Row) => p?.captured_at)
  return online ? "Paid online" : paid ? "Cash on Delivery (paid)" : "Cash on Delivery"
}

export const renderInvoiceHtml = (order: Row, inv: FrozenInvoice, opts: { logoUrl?: string } = {}) => {
  const s = inv.seller
  const ship = order.shipping_address ?? {}
  const bill = order.billing_address?.address_1 ? order.billing_address : ship
  const sellerCode = stateCode(s.state)
  const buyerCode = stateCode(ship.province)
  const intra = !!sellerCode && sellerCode === buyerCode
  const { lines, totals } = computeLines(order, inv, intra)
  const date = new Date(inv.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
  const addr = (a: Row) =>
    [
      [a.first_name, a.last_name].filter(Boolean).join(" "),
      a.company,
      a.address_1,
      a.address_2,
      [a.city, a.province, a.postal_code].filter(Boolean).join(", "),
      a.phone ? `Phone: ${a.phone}` : "",
    ]
      .filter(Boolean)
      .map(esc)
      .join("<br>")
  const taxCols = intra
    ? `<th>CGST</th><th>SGST</th>`
    : `<th>IGST</th>`
  const row = (l: InvoiceLine, i: number) => `<tr>
<td>${i + 1}</td><td class="desc">${esc(l.description)}</td><td>${esc(l.hsn)}</td><td class="n">${l.qty}</td>
<td class="n">${inr(l.rate)}</td><td class="n">${inr(l.taxable)}</td>
${intra ? `<td class="n">${inr(l.cgst)}<small>${l.gst_rate / 2}%</small></td><td class="n">${inr(l.sgst)}<small>${l.gst_rate / 2}%</small></td>` : `<td class="n">${inr(l.igst)}<small>${l.gst_rate}%</small></td>`}
<td class="n">${inr(l.total)}</td></tr>`
  return `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tax Invoice ${esc(inv.number)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f4f2;font:13px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111}
.page{max-width:820px;margin:24px auto;background:#fff;padding:36px 40px;border-radius:10px}
.bar{max-width:820px;margin:16px auto 0;display:flex;justify-content:flex-end;gap:8px}
.bar button{font:inherit;padding:8px 16px;border-radius:999px;border:1px solid #111;background:#111;color:#fff;cursor:pointer}
h1{font-size:20px;margin:0;letter-spacing:.04em}.muted{color:#666}.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}
.logo{height:56px}.meta td{padding:1px 0 1px 12px;text-align:right}.meta td:first-child{color:#666;text-align:left;padding-left:0}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}.box h3{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#666}
table.items{width:100%;border-collapse:collapse;margin-top:8px}table.items th{background:#f4f4f2;font-size:11px;text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:8px 6px}
table.items td{padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top}.n{text-align:right;white-space:nowrap}td small{display:block;color:#888;font-size:10px}
.desc{width:34%}.sum{margin-left:auto;width:320px;margin-top:14px;border-collapse:collapse}.sum td{padding:4px 6px}.sum tr.grand td{border-top:2px solid #111;font-weight:700;font-size:15px;padding-top:8px}
.words{margin-top:10px}.foot{display:flex;justify-content:space-between;gap:24px;margin-top:36px;align-items:flex-end}.sign{text-align:right;min-width:200px}
.sign div{margin-top:42px;border-top:1px solid #111;padding-top:4px}
@media print{body{background:#fff}.page{margin:0;max-width:none;border-radius:0;padding:12mm}.bar{display:none}}
@media(max-width:640px){.page{padding:20px}.cols{grid-template-columns:1fr}.top{flex-direction:column}table.items{font-size:11px}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="page">
<div class="top">
<div>${opts.logoUrl ? `<img class="logo" src="${esc(opts.logoUrl)}" alt="Stancil">` : ""}
<p style="margin:8px 0 0"><strong>${esc(s.legal_name)}</strong><br><span class="muted">${esc(s.brand_line)}</span><br>${esc(s.address).replace(/\n/g, "<br>")}<br>${esc(s.state)}${sellerCode ? ` (State code ${sellerCode})` : ""}</p>
<p style="margin:6px 0 0">GSTIN: <strong>${esc(s.gstin)}</strong>${s.pan ? ` · PAN: ${esc(s.pan)}` : ""}${s.email ? `<br>${esc(s.email)}` : ""}${s.phone ? ` · ${esc(s.phone)}` : ""}</p></div>
<div style="text-align:right"><h1>TAX INVOICE</h1><table class="meta" style="margin-top:8px;margin-left:auto">
<tr><td>Invoice no.</td><td><strong>${esc(inv.number)}</strong></td></tr>
<tr><td>Invoice date</td><td>${esc(date)}</td></tr>
<tr><td>Order no.</td><td>#${esc(order.display_id)}</td></tr>
<tr><td>Payment</td><td>${esc(paymentLabel(order))}</td></tr>
<tr><td>Place of supply</td><td>${esc(ship.province || "-")}${buyerCode ? ` (${buyerCode})` : ""}</td></tr>
</table></div></div>
<div class="cols"><div class="box"><h3>Bill to</h3>${addr(bill)}<br>${esc(order.email)}</div><div class="box"><h3>Ship to</h3>${addr(ship)}</div></div>
<table class="items"><thead><tr><th>#</th><th>Item</th><th>HSN/SAC</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Taxable value</th>${taxCols}<th class="n">Amount</th></tr></thead>
<tbody>${lines.map(row).join("")}</tbody></table>
<table class="sum">
<tr><td>Taxable value</td><td class="n">₹ ${inr(totals.taxable)}</td></tr>
${intra ? `<tr><td>CGST</td><td class="n">₹ ${inr(totals.cgst)}</td></tr><tr><td>SGST</td><td class="n">₹ ${inr(totals.sgst)}</td></tr>` : `<tr><td>IGST</td><td class="n">₹ ${inr(totals.igst)}</td></tr>`}
${Number(order.shipping_total ?? 0) > 0 ? "" : `<tr><td>Delivery</td><td class="n">Free</td></tr>`}
<tr class="grand"><td>Total (GST included)</td><td class="n">₹ ${inr(totals.total)}</td></tr>
</table>
<p class="words"><span class="muted">Amount in words:</span> ${esc(inWords(totals.total))}</p>
${order.status === "canceled" ? `<p style="color:#b00;font-weight:700">This order was cancelled.</p>` : ""}
<div class="foot"><p class="muted" style="max-width:420px;margin:0">${esc(s.footer)}<br>Whether tax is payable under reverse charge: No.</p>
<div class="sign">For ${esc(s.legal_name)}<div>${esc(s.signatory)}</div></div></div>
</div></body></html>`
}

// The invoice page for an order, or null if it has no invoice yet.
export const invoiceHtmlFor = async (container: MedusaContainer, orderId: string) => {
  const inv = await ensureInvoice(container, orderId)
  if (!inv) {
    return null
  }
  const order = await loadOrder(container, orderId)
  const storeUrl = (process.env.STORE_URL || (process.env.STORE_CORS || "").split(",")[0] || "").replace(/\/$/, "")
  return renderInvoiceHtml(order!, inv, { logoUrl: storeUrl ? `${storeUrl}/brand/logo-header.png` : undefined })
}

export const saveInvoiceSettings = async (container: MedusaContainer, value: InvoiceSettings) => {
  await saveSettingWorkflow(container).run({ input: { key: INVOICE_SETTINGS_KEY, value: value as unknown as Record<string, unknown> } })
}
