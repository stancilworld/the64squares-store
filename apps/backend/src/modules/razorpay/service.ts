import crypto from "node:crypto"
import {
  AbstractPaymentProvider,
  BigNumber,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { getServiceKeys, type RazorpayCreds } from "../../lib/service-keys"

// Razorpay (UPI, cards, net banking, wallets) for The 64 Squares.
//
// How a payment goes:
// 1. Checkout asks Medusa for a payment session → initiatePayment creates a Razorpay order
//    (amount in paise) and keeps its id. The session id is saved in the order's notes.
// 2. The website opens Razorpay's payment window for that order.
// 3. After paying, the website completes the cart → authorizePayment asks Razorpay
//    (server to server, so it can't be faked from the browser) whether that order was paid.
// 4. If the shopper closes the window after paying, Razorpay's webhook (order.paid /
//    payment.captured) reaches /hooks/payment/razorpay_razorpay and Medusa creates the
//    order anyway.

// Keys come from the admin (Settings → Payments & delivery → Keys) or the server's .env;
// see lib/service-keys.ts. Each payment remembers the mode (test/live) it was made in.
type Options = {
  // For tests only: a fake Razorpay server.
  api_base?: string
}
type Mode = "test" | "live"

type RzpOrder = { id: string; amount: number; amount_paid: number; currency: string; status: string; notes?: Record<string, string> }
type RzpPayment = { id: string; amount: number; currency: string; status: string; method?: string; order_id: string }

// Medusa passes amounts as plain numbers or as its BigNumber type; Razorpay wants paise.
const toPaise = (amount: unknown) => {
  const value = typeof amount === "number" ? amount : new BigNumber(amount as never).numeric
  if (!Number.isFinite(value)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid amount: ${String(amount)}`)
  }
  return Math.round(value * 100)
}
const fromPaise = (paise: number) => paise / 100

class RazorpayProviderService extends AbstractPaymentProvider<Options> {
  static identifier = "razorpay"
  protected options_: Options

  constructor(cradle: Record<string, unknown>, options: Options) {
    super(cradle, options)
    this.options_ = options
  }

  // The keys for a mode (the payment's own mode, or the store's current one).
  private async creds(mode?: unknown): Promise<RazorpayCreds> {
    const keys = await getServiceKeys()
    const creds = mode === "test" || mode === "live" ? keys.razorpayFor(mode) : keys.razorpay
    if (!creds) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Online payment is not set up yet. Please choose Cash on Delivery.")
    }
    return creds
  }

  private async api<T>(creds: RazorpayCreds, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const base = (this.options_.api_base || "https://api.razorpay.com/v1").replace(/\/$/, "")
    const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")
    const res = await fetch(base + path, {
      method,
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, any>
    if (!res.ok) {
      const msg = json?.error?.description || `Razorpay error (${res.status})`
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, msg)
    }
    return json as T
  }

  private async createOrder(amount: unknown, currency: string, sessionId?: string) {
    const creds = await this.creds()
    const order = await this.api<RzpOrder>(creds, "POST", "/orders", {
      amount: toPaise(amount),
      currency: currency.toUpperCase(),
      receipt: (sessionId || `t64_${Date.now()}`).slice(0, 40),
      notes: sessionId ? { session_id: sessionId } : {},
      payment_capture: 1,
    })
    return {
      razorpay_order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: creds.keyId,
      mode: creds.mode as Mode,
      session_id: sessionId,
    }
  }

  // The best payment made against a Razorpay order, if any.
  private async paymentFor(orderId: string, mode: unknown): Promise<RzpPayment | null> {
    const creds = await this.creds(mode)
    const { items } = await this.api<{ items: RzpPayment[] }>(creds, "GET", `/orders/${orderId}/payments`)
    const rank = (p: RzpPayment) => (p.status === "captured" ? 3 : p.status === "authorized" ? 2 : p.status === "refunded" ? 1 : 0)
    return [...(items ?? [])].sort((a, b) => rank(b) - rank(a))[0] ?? null
  }

  private async status(data: Record<string, unknown> | undefined): Promise<GetPaymentStatusOutput> {
    const orderId = data?.razorpay_order_id as string | undefined
    if (!orderId) {
      return { status: PaymentSessionStatus.PENDING, data }
    }
    const payment = await this.paymentFor(orderId, data?.mode)
    const next = { ...data, razorpay_payment_id: payment?.id, method: payment?.method }
    switch (payment?.status) {
      case "captured":
        return { status: PaymentSessionStatus.CAPTURED, data: next }
      case "authorized":
        return { status: PaymentSessionStatus.AUTHORIZED, data: next }
      case "failed":
        return { status: PaymentSessionStatus.ERROR, data: next }
      default:
        return { status: PaymentSessionStatus.PENDING, data: next }
    }
  }

  async initiatePayment({ amount, currency_code, data }: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const sessionId = data?.session_id as string | undefined
    const created = await this.createOrder(amount, currency_code, sessionId)
    return { id: created.razorpay_order_id, data: created, status: PaymentSessionStatus.PENDING }
  }

  async updatePayment({ amount, currency_code, data }: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // A Razorpay order's amount can't change; make a new order if the total changed.
    if (data?.razorpay_order_id && Number(data.amount) === toPaise(amount)) {
      return { data, status: PaymentSessionStatus.PENDING }
    }
    const created = await this.createOrder(amount, currency_code, data?.session_id as string | undefined)
    return { data: created, status: PaymentSessionStatus.PENDING }
  }

  async authorizePayment({ data }: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const result = await this.status(data)
    if (result.status === PaymentSessionStatus.PENDING) {
      return { status: PaymentSessionStatus.REQUIRES_MORE, data: result.data }
    }
    return result
  }

  async getPaymentStatus({ data }: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    return this.status(data)
  }

  async capturePayment({ data }: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const orderId = data?.razorpay_order_id as string | undefined
    if (!orderId) {
      return { data }
    }
    const payment = await this.paymentFor(orderId, data?.mode)
    if (payment?.status === "authorized") {
      await this.api(await this.creds(data?.mode), "POST", `/payments/${payment.id}/capture`, {
        amount: payment.amount,
        currency: payment.currency,
      })
    }
    return { data: { ...data, razorpay_payment_id: payment?.id } }
  }

  async refundPayment({ amount, data }: RefundPaymentInput): Promise<RefundPaymentOutput> {
    let paymentId = data?.razorpay_payment_id as string | undefined
    if (!paymentId && data?.razorpay_order_id) {
      paymentId = (await this.paymentFor(data.razorpay_order_id as string, data?.mode))?.id
    }
    if (!paymentId) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "No Razorpay payment found to refund.")
    }
    const refund = await this.api<{ id: string }>(await this.creds(data?.mode), "POST", `/payments/${paymentId}/refund`, {
      amount: toPaise(amount),
    })
    return { data: { ...data, razorpay_payment_id: paymentId, last_refund_id: refund.id } }
  }

  async cancelPayment({ data }: CancelPaymentInput): Promise<CancelPaymentOutput> {
    // Unpaid Razorpay orders simply expire; nothing to cancel there.
    return { data }
  }

  async deletePayment({ data }: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data }
  }

  async retrievePayment({ data }: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data }
  }

  async getWebhookActionAndData(payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    // Test and Live mode webhooks each have their own secret; either may sign.
    const keys = await getServiceKeys()
    const signature = String(payload.headers["x-razorpay-signature"] ?? "")
    const raw = payload.rawData
    if (!keys.razorpayWebhookSecrets.length || !signature || !raw) {
      return { action: PaymentActions.NOT_SUPPORTED }
    }
    const ok = keys.razorpayWebhookSecrets.some((secret) => {
      const expected = crypto.createHmac("sha256", secret).update(raw as Buffer | string).digest("hex")
      return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    })
    if (!ok) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Razorpay webhook signature does not match")
    }

    const body = payload.data as { event?: string; payload?: Record<string, { entity: Record<string, any> }> }
    const payment = body.payload?.payment?.entity as RzpPayment | undefined
    let order = body.payload?.order?.entity as RzpOrder | undefined
    if (!order && payment?.order_id) {
      // Try the current mode first, then the other one.
      const mode = keys.razorpayMode
      for (const m of [mode, mode === "live" ? "test" : "live"] as Mode[]) {
        const creds = keys.razorpayFor(m)
        if (!creds) continue
        try {
          order = await this.api<RzpOrder>(creds, "GET", `/orders/${payment.order_id}`)
          break
        } catch {
          // Not this mode's order; try the other.
        }
      }
    }
    const sessionId = order?.notes?.session_id
    // Orders without our session id weren't made by this store.
    if (!sessionId) {
      return { action: PaymentActions.NOT_SUPPORTED }
    }
    const amount = fromPaise(payment?.amount ?? order?.amount_paid ?? order?.amount ?? 0)
    switch (body.event) {
      case "order.paid":
      case "payment.captured":
        return { action: PaymentActions.SUCCESSFUL, data: { session_id: sessionId, amount } }
      case "payment.authorized":
        return { action: PaymentActions.AUTHORIZED, data: { session_id: sessionId, amount } }
      case "payment.failed":
        return { action: PaymentActions.FAILED, data: { session_id: sessionId, amount } }
      default:
        return { action: PaymentActions.NOT_SUPPORTED }
    }
  }
}

export default RazorpayProviderService
