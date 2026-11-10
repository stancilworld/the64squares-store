# PayU

Online payments through PayU's hosted payment page (UPI, cards, net banking, wallets),
set up entirely from the admin. Razorpay keeps working; both can be on.

## Setting it up (admin)

1. PayU Dashboard → switch to **Test mode** → Developers → API Keys: copy the **Key** and the **Salt**.
2. Admin → Settings → **Payments & delivery** → Keys (main admin only) → **PayU** → paste the
   Test Merchant Key and Test Salt → **Save keys** (asks for your password) → **Test the Test keys**.
   ✓ means PayU accepted them; ✗ says why (wrong key/salt, or Live keys in the Test fields).
3. In the top part of the same page, **Online payment (PayU)** shows "Test mode" and is on.
   Place a test order with PayU's test card / UPI details.
4. Going live: paste the Live Merchant Key and Live Salt, Test them, set **Mode → Live**, Save.
5. Optional: PayU Dashboard → Developers → Webhooks → add the **Webhook URL** shown on the Keys
   page (`https://api.the64squares.in/hooks/payment/payu_payu`) for *Successful payment* and
   *Failed payment*. The Payments row then says "Webhook working".

Nothing else is set in PayU: the return address (`/checkout/payu/return`) is sent with every payment.

## How a payment is confirmed

- Checkout makes a payment session; the server prepares PayU's form and signs it
  (`sha512(key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||salt)`; udf1 = payment
  session, udf2 = cart). The Salt never leaves the server.
- The shopper pays on PayU and comes back. The return page completes the checkout; the server
  asks PayU directly (`verify_payment`) before the order is made, and the paid amount must match.
- Closed the page after paying? The webhook (signature checked with the reverse hash, then
  verified with PayU again) or the **re-check job** (every 5 minutes, PayU payments waiting from
  the last 2 days, after 3 minutes) makes the order anyway.
- Refunds from an order in the admin go to PayU (`cancel_refund_transaction`, full or partial).
- Cancelled or failed: the shopper is back at checkout with a clear message and can try again.

## Settings and data

- Keys: `PAYU_TEST_KEY`, `PAYU_TEST_SALT`, `PAYU_LIVE_KEY`, `PAYU_LIVE_SALT` (admin, encrypted;
  or the server's .env). Mode: saved with the keys (`payu_mode`).
- Switch: `payu_enabled` in the checkout settings. When both Razorpay and PayU are on, checkout
  shows "Pay with Razorpay" and "Pay with PayU"; with one, it's "Pay online".
- Provider id `pp_payu_payu`; added to every region by the `payu-v1` migration script.
- Code: `apps/backend/src/modules/payu` (provider and PayU calls), `jobs/payu-recheck.ts`,
  `lib/payu-status.ts`, storefront `app/(site)/checkout/payu/return/route.ts`.
- Testing only: `PAYU_API_BASE` sends everything to a stand-in server.

## Tested

Unit tests for the hashes (as documented by PayU), amounts, ids and statuses. End to end against a
stand-in that checks PayU's hashes: pay and return → order (captured), refund from the admin,
cancel → back to checkout, paid-and-closed → order by webhook, forged webhook refused,
paid-and-closed without webhook → order by the re-check job, right and wrong keys in the key test.
Not yet tried against PayU's real test environment (needs your Test Key and Salt).
