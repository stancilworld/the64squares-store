import { type NextRequest, NextResponse } from "next/server"
import { placeOrder } from "@/lib/checkout"

// Where PayU sends the shopper back after paying (or not).
//
// PayU posts a form here. Browsers don't send the site's cookies with a post from another
// site, so the post only redirects to the same address as a normal visit (GET), which does
// have them. The GET then completes the checkout: the store's server asks PayU directly
// whether the payment went through before making the order, so nothing in this page's
// address or PayU's post can fake a payment.

const go = (req: NextRequest, path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin), 303)

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const cart = String(form?.get("udf2") ?? "")
  const status = String(form?.get("status") ?? "")
  if (!/^cart_[A-Za-z0-9]{10,40}$/.test(cart)) return go(req, "/checkout?payment=failed")
  return go(req, `/checkout/payu/return?cart=${encodeURIComponent(cart)}&status=${status === "success" ? "success" : status === "pending" ? "pending" : "failure"}`)
}

export async function GET(req: NextRequest) {
  const cart = req.nextUrl.searchParams.get("cart") ?? ""
  const status = req.nextUrl.searchParams.get("status")
  if (!/^cart_[A-Za-z0-9]{10,40}$/.test(cart)) return go(req, "/checkout")
  if (status === "failure") return go(req, "/checkout?payment=failed")
  const res = await placeOrder(cart)
  if (res.ok) return go(req, `/order/${res.orderId}?new=1`)
  // Paid but not confirmed yet (PayU still processing): the re-check makes the order shortly.
  return go(req, `/checkout?payment=${status === "success" ? "checking" : "failed"}`)
}
