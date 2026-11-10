import crypto from "node:crypto"
import { AbstractPaymentProvider, BigNumber, MedusaError, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils"
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
import { storeUrl } from "../../lib/emails"
import { notePayuWebhook } from "../../lib/payu-status"
import { getServiceKeys, type PayuCreds } from "../../lib/service-keys"
import { clean, isFailed, isPaid, type Mode, newTxnId, type PayFields, payuCommand, payuUrls, requestHash, responseHash, sameHash, toAmount, verifyPayments } from "./payu"

// PayU (UPI, cards, net banking, wallets) for The 64 Squares, with PayU's hosted payment page.
//
// How a payment goes:
// 1. Checkout makes a payment session → initiatePayment prepares PayU's form (amount,
//    shopper's name, email and phone, return address) and signs it with the Salt. The Salt
//    never leaves the server; only the signature goes to the browser.
// 2. The browser posts the form to PayU, where the shopper pays.
// 3. PayU sends the shopper back to the website (/checkout/payu/return), which completes the
//    cart → authorizePayment asks PayU directly (Verify Payment API) whether it was paid.
// 4. If the shopper closes the page after paying: PayU's webhook (if set up) or the
//    re-check job (every few minutes) confirms the payment and the order is created anyway.
//
// Keys (Merchant Key and Salt, Test and Live) come from the admin: Settings → Payments &
// delivery → Keys. Each payment remembers the mode it was made in.

type Options = Record<string, never>

const toRupees = (amount: unknown) => {
  const value = typeof amount === "number" ? amount : new BigNumber(amount as never).numeric
  if (!Number.isFinite(value) || value <= 0) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid amount: ${String(amount)}`)
  return value
}

class PayuProviderService extends AbstractPaymentProvider<Options> {
  static identifier = "payu"

  constructor(cradle: Record<string, unknown>, options: Options) {
    super(cradle, options)
  }

  private async creds(mode?: unknown): Promise<PayuCreds> {
    const keys = await getServiceKeys()
    const creds = mode === "test" || mode === "live" ? keys.payuFor(mode) : keys.payu
    if (!creds) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "PayU is not set up yet. Please choose another way to pay.")
    return creds
  }

  // PayU's form for this payment, signed.
  private async prepare(amount: unknown, data: Record<string, unknown> | undefined) {
    const creds = await this.creds()
    const back = `${storeUrl()}/checkout/payu/return`
    const fields: PayFields = {
      key: creds.key,
      txnid: newTxnId(),
      amount: toAmount(toRupees(amount)),
      productinfo: "The 64 Squares order",
      firstname: clean(data?.firstname, 60) || "Customer",
      email: clean(data?.email, 100),
      phone: clean(data?.phone, 15).replace(/\D/g, ""),
      surl: back,
      furl: back,
      udf1: clean(data?.session_id, 60),
      udf2: clean(data?.cart_id, 60),
      udf3: "",
      udf4: "",
      udf5: "",
    }
    return {
      txnid: fields.txnid,
      amount: fields.amount,
      mode: creds.mode as Mode,
      session_id: data?.session_id,
      cart_id: data?.cart_id,
      firstname: fields.firstname,
      email: fields.email,
      phone: fields.phone,
      // What the browser posts to PayU.
      action: payuUrls(creds.mode).pay,
      form: { ...fields, hash: requestHash(fields, creds.salt) },
    }
  }

  private async status(data: Record<string, unknown> | undefined): Promise<GetPaymentStatusOutput> {
    const txnid = data?.txnid as string | undefined
    if (!txnid) return { status: PaymentSessionStatus.PENDING, data }
    const t = (await verifyPayments(await this.creds(data?.mode), [txnid])).get(txnid)
    const next = { ...data, mihpayid: t?.mihpayid && t.mihpayid !== "Not Found" ? t.mihpayid : data?.mihpayid, method: t?.mode ?? data?.method, payu_status: t?.unmappedstatus ?? t?.status }
    // The amount paid must match this payment.
    if (isPaid(t) && t?.amt && Math.abs(Number(t.amt) - Number(data?.amount)) > 0.009) {
      return { status: PaymentSessionStatus.ERROR, data: { ...next, problem: `PayU amount ${t.amt} differs from ${String(data?.amount)}` } }
    }
    if (isPaid(t)) return { status: PaymentSessionStatus.CAPTURED, data: next }
    if (isFailed(t)) return { status: PaymentSessionStatus.ERROR, data: next }
    return { status: PaymentSessionStatus.PENDING, data: next }
  }

  async initiatePayment({ amount, data }: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const prepared = await this.prepare(amount, data)
    return { id: prepared.txnid, data: prepared, status: PaymentSessionStatus.PENDING }
  }

  async updatePayment({ amount, data }: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // Same amount: keep the transaction. Otherwise a new one (a PayU form can't change).
    if (data?.txnid && data.amount === toAmount(toRupees(amount))) return { data, status: PaymentSessionStatus.PENDING }
    return { data: await this.prepare(amount, data), status: PaymentSessionStatus.PENDING }
  }

  async authorizePayment({ data }: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const result = await this.status(data)
    if (result.status === PaymentSessionStatus.PENDING) return { status: PaymentSessionStatus.REQUIRES_MORE, data: result.data }
    return result
  }

  async getPaymentStatus({ data }: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    return this.status(data)
  }

  // PayU captures payments by itself.
  async capturePayment({ data }: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data }
  }

  async refundPayment({ amount, data }: RefundPaymentInput): Promise<RefundPaymentOutput> {
    let mihpayid = data?.mihpayid as string | undefined
    if (!mihpayid && data?.txnid) mihpayid = (await verifyPayments(await this.creds(data?.mode), [data.txnid as string])).get(data.txnid as string)?.mihpayid
    if (!mihpayid || mihpayid === "Not Found") throw new MedusaError(MedusaError.Types.NOT_FOUND, "No PayU payment found to refund.")
    const token = `r${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`
    const json = await payuCommand(await this.creds(data?.mode), "cancel_refund_transaction", [mihpayid, token, toAmount(toRupees(amount))])
    if (Number(json.status) !== 1) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `PayU didn't accept the refund: ${String(json.msg ?? json.error_code ?? "unknown reason")}`)
    }
    const refunds = Array.isArray(data?.refunds) ? (data.refunds as unknown[]) : []
    return { data: { ...data, mihpayid, refunds: [...refunds, { token, request_id: json.request_id ?? null, amount: toAmount(toRupees(amount)), at: new Date().toISOString() }] } }
  }

  async cancelPayment({ data }: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data }
  }

  async deletePayment({ data }: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data }
  }

  async retrievePayment({ data }: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data }
  }

  // PayU's webhook (Successful / Failed payment), a form post signed with the Salt.
  async getWebhookActionAndData(payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    let p = (payload.data ?? {}) as Record<string, string>
    if (!p.txnid && payload.rawData) p = Object.fromEntries(new URLSearchParams(String(payload.rawData)))
    if (!p.txnid || !p.hash || !p.key) return { action: PaymentActions.NOT_SUPPORTED }
    const keys = await getServiceKeys()
    const creds = (["live", "test"] as Mode[]).map((m) => keys.payuFor(m)).find((c) => c?.key === p.key)
    if (!creds) return { action: PaymentActions.NOT_SUPPORTED }
    if (!sameHash(responseHash(p, creds.salt), p.hash)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "PayU webhook signature does not match")
    }
    await notePayuWebhook(creds.mode)
    const sessionId = p.udf1
    // Payments without our session id weren't made by this store's checkout.
    if (!sessionId) return { action: PaymentActions.NOT_SUPPORTED }
    // Trust, but check: ask PayU directly before creating an order.
    const t = (await verifyPayments(creds, [p.txnid])).get(p.txnid)
    const amount = Number(t?.amt ?? p.amount)
    if (isPaid(t)) return { action: PaymentActions.SUCCESSFUL, data: { session_id: sessionId, amount } }
    if (isFailed(t)) return { action: PaymentActions.FAILED, data: { session_id: sessionId, amount } }
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

export default PayuProviderService
