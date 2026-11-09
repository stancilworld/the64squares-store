# Marketing & integrations

Admin → **Settings → Marketing & integrations**. Ad and analytics tools are connected,
tested and switched on from there, with no code changes. Every shop event goes through one
engine, so a new platform is one more adapter, not a rewrite.

## 1. Architecture

```
Visitor's browser                         Store server (Medusa)                     Platforms
─────────────────                         ─────────────────────                     ─────────
track("AddToCart", …)  ──tags (if allowed)──────────────────────────────────────▶ Meta Pixel, GA4,
  same event_id                                                                     Google Ads, GTM, Clarity
        │
        └── POST /api/t/events (same site only) ─▶ POST /store/marketing/events
                                                     validate (zod) · origin check · 240/min per IP
                                                     record event (Event Manager, no personal data)
                                                     consent check
                                                     queue server copy ─▶ marketing_delivery (pending)
                                                                              │ first try at once, in the background
                                                                              │ then job every minute, backoff
                                                                              ▼ 1m, 5m, 30m, 2h, 6h → failed
order.placed / payment.refunded / customer.created                          Meta Conversions API
   (subscriber) ─▶ Purchase / Refund / CompleteRegistration ─▶ queue ──────▶ GA4 Measurement Protocol
```

- **Purchase is made by the server** from `order.placed`, i.e. after Razorpay confirmed the payment or a
  Cash on Delivery order was placed. Browsers can't create purchases (the collector refuses them).
- **Deduplication.** Browser tag and server copy share one `event_id` (`purchase_<order id>` for orders),
  so Meta counts them once. GA4: when the server copy is on, the website doesn't send `purchase` at all.
  Events are stored once per `event_id`, deliveries once per `event_id` + platform (unique indexes).
  The order page sends the Pixel purchase once per browser.
- **Consent.** Nothing loads before the visitor chooses (default "Ask first"). Google gets Consent
  Mode v2 (`analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`), Meta
  `fbq('consent')`, Clarity `consentv2`. Meta's server copy needs marketing consent, GA4's analytics
  consent. Withdrawing consent deletes the tags' cookies and reloads the page.
- **Personal data.** The Event Manager stores product ids, amounts, page paths, campaign tags, order id
  and a salted hash of the email (for deletion). Contact details are hashed (SHA-256, normalised) before
  they go to Meta, only with marketing consent and "Send hashed customer details" on. IP address and
  browser are kept only for checkout→order matching (`marketing_context`, deleted when the purchase is
  queued, or after 7 days), and removed from stored payloads once delivered.

## 2. Integrations

| Integration | Browser | Server | Test |
|---|---|---|---|
| Meta Pixel | PageView, ViewContent, Search, AddToCart, RemoveFromCart*, ViewCart*, InitiateCheckout, AddPaymentInfo, Purchase, Lead | – | website tab loads the Pixel |
| Meta Conversions API | – | all of the above + CompleteRegistration, with hashed matching, fbp/fbc, IP, UA, external_id, test event code | token checked on the Pixel; test event sent when a test code is set |
| Google Analytics 4 | page_view, view_item, search, add_to_cart, remove_from_cart, view_cart, begin_checkout, add_payment_info, purchase, generate_lead (items, value, currency, transaction_id) | optional: purchase, refund, sign_up (Measurement Protocol) | website tab loads gtag; server option validated by Google's debug endpoint |
| Google Ads | purchase and lead conversions with value, currency, transaction_id; enhanced conversions (email/phone, hashed by Google's tag) | – | website tab loads the tag |
| Google Tag Manager | every event pushed to `dataLayer` in GA4 ecommerce format, with `event_id` | – | website tab loads the container (a wrong ID fails) |
| Microsoft Clarity | recordings, key events marked | – | website tab loads Clarity |

\* sent as custom events (Meta has no standard event for them). Meta has no refund event.

**Awaiting credentials (all of them).** Built and tested against a stand-in server that checks Meta's
and Google's documented formats; not yet verified against the real accounts. Each one shows
"Not connected" / "Configuration required" until its IDs are entered and its test passes.

**Not built yet** (listed in the admin as "Not available yet"): Pinterest, Snapchat, Microsoft
Advertising (UET), LinkedIn, WhatsApp Business, Brevo / Mailchimp / Klaviyo, webhooks. TikTok is not
planned: it is blocked in India.

## 3. Database (module `marketing`, migration `Migration20261109211432`, new tables only)

- `marketing_event`: one row per event (`event_id` unique, name, source, page, order_id, customer_hash, value, currency, data, consent).
- `marketing_delivery`: one row per event and platform (unique), channel browser/server, status
  `browser | pending | success | failed | skipped`, attempts, next_attempt_at, response_code, last_error, payload.
- `marketing_context`: checkout visit details by cart id (see above).
- Settings: `marketing_settings` in the content module's settings. Secrets `META_CAPI_TOKEN`,
  `GA4_API_SECRET` in the encrypted service keys (AES-256-GCM, key from JWT_SECRET + COOKIE_SECRET).

## 4. API

Store (website):
- `GET /store/marketing/config`: public ids and banner settings (never a secret).
- `POST /store/marketing/events`: the collector.
- `POST /store/marketing/check`: result of a tag test (one-time code, 10 minutes).
- Website relays: `POST /api/t/events`, `POST /api/t/check`, `GET /api/t/config?check=` (same-site only;
  pass the visitor's IP and browser on).

Admin (permission "Marketing & integrations"; secret keys need the main admin and password via `POST /admin/service-keys`):
- `GET|POST /admin/marketing`: settings and integration states. Switching on requires a passing test with the current settings.
- `POST /admin/marketing/test`, `GET /admin/marketing/events` (filters: from, to, platform, name, status, order_id, event_id),
  `GET /admin/marketing/events/:id` (customer details shown only as "sent, hashed"), `POST /admin/marketing/retry`,
  `POST /admin/marketing/delete-data`.
- Changed: `/store/order-status` items now include product_id, variant_id, sku, unit_price.

All admin changes are written to the Activity log.

## 5. Background work

- Subscriber `marketing-events` (order.placed, payment.refunded, customer.created).
- Job `marketing-dispatch` every minute: sends what's due (runs in the worker).
- Job `marketing-prune` nightly: keeps events for the retention set in Advanced (30 days by default).
- Uses Medusa's existing event bus, worker and jobs; no new infrastructure.

## 6. Tests

- Unit: `npm run test:unit -- src/lib/marketing` (25 tests: hashing and normalisation, Meta and GA4
  payloads, product id mapping, statuses, consent rules, idempotency, exclusions, retry with backoff,
  Retry-After, wrong token, giving up).
- End to end (local, stand-in Meta/Google server): shopper visit with consent banner, product view,
  search, add/remove, cart, checkout, payment step, COD order with two products, order page reloaded,
  refund, essential-cookies-only visit, changing consent later, made-up and cross-site events, Meta
  down then retried, wrong token, data deletion.

## 7. Manual checklist after adding real keys

1. Meta Pixel: enter Pixel ID → Save and test → switch on. Meta Events Manager → Test events: browse the shop.
2. Meta Conversions API: paste token (main admin) → add the test code from Test events → Save and test →
   switch on → place a test order → the Purchase shows twice in Test events, marked "Deduplicated".
   Then remove the test code.
3. GA4: Measurement ID → Save and test → switch on → Reports → Realtime. Optional server copy: API secret → test.
4. Google Ads: Conversion ID and labels → test → switch on. Turn on enhanced conversions in Google Ads too.
5. Check Event Manager: no failed deliveries.

## 8. Environment variables

Nothing new is required. Optional, instead of the admin: `META_CAPI_TOKEN`, `GA4_API_SECRET` in
`apps/backend/.env`. For local testing only: `MARKETING_META_BASE`, `MARKETING_GA_BASE` (send to a
stand-in server instead of graph.facebook.com / google-analytics.com).

## 9. Deploy

`bash /opt/the64squares/app/deploy/update.sh` (runs the migration and restarts the API and worker).

## 10. Known limits

- Multi-store: each store (The 64 Squares, Stancil) is its own server, database and admin, so settings,
  keys and logs are separate by design; there is no shared multi-tenant admin.
- Tag tests confirm the tag loads with that ID; Google and Meta don't confirm a browser ID is yours
  (check Realtime / Test events). GA4's API secret can't be checked by Google's debug endpoint.
- CompleteRegistration is sent only in "Notice only" mode (the browser's choice isn't known at sign-up).
- Failed online payments create no order, so no Purchase; abandoned checkouts stay InitiateCheckout.
- No custom script / HTML tag box (on purpose: arbitrary scripts are a security risk).
- Settings reach the website within about a minute (cached).

## 11. Roadmap

Pinterest Tag + Conversions API, Snapchat Pixel + CAPI, Microsoft UET, LinkedIn Insight Tag (same
adapter pattern: one sender in `src/lib/marketing`, one browser block in the website engine);
WhatsApp Business (order updates, abandoned carts); one email platform (customer sync, abandoned-cart
emails); signed outgoing webhooks.
