# Marketing & integrations

Admin → **Settings → Marketing & integrations**. Ad and analytics tools, WhatsApp, email tools and
webhooks are connected, tested and switched on from there, with no code changes. Every shop event goes
through one engine, so a new platform is one more entry in `src/lib/marketing/senders.ts` (plus, for a
website tag, one block in the website's tracking engine), not a rewrite.

## 1. Architecture

```
Visitor's browser                         Store server (Medusa)                     Platforms
─────────────────                         ─────────────────────                     ─────────
track("AddToCart", …)  ──tags (if allowed)──────────────────────────────────────▶ Meta Pixel, GA4, Google Ads,
  same event_id                                                                     GTM, Clarity, Pinterest Tag,
                                                                                    Snap Pixel, UET, LinkedIn
        │
        └── POST /api/t/events (same site only) ─▶ POST /store/marketing/events
                                                     validate (zod) · origin check · 240/min per IP
                                                     record event (Event Manager, no personal data)
                                                     consent check
                                                     queue server copy ─▶ marketing_delivery (pending)
                                                                              │ first try at once, in the background
                                                                              │ then job every minute, backoff
                                                                              ▼ 1m, 5m, 30m, 2h, 6h → failed
order.placed / payment.refunded / customer.created / shipment.created       Meta CAPI, GA4 MP, Pinterest,
newsletter sign-up · unfinished-checkout job (every 15 min)                  Snapchat, Microsoft, LinkedIn,
   ─▶ Purchase / Refund / CompleteRegistration / OrderShipped /              WhatsApp, Brevo, Mailchimp,
      Subscribe / AbandonedCart ─▶ queue ─────────────────────────────────▶ Klaviyo, webhooks
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
- **Messages and emails need an explicit opt-in**, separate from cookies: checkout shows "Send me order
  updates on WhatsApp" and "Email me news and offers" (only when such an integration is on), saved in the
  cart/order metadata `t64_optin {email, whatsapp, at}`. WhatsApp needs the WhatsApp tick and a mobile
  number; Brevo, Mailchimp and Klaviyo need the email tick (or a newsletter sign-up). Webhooks get what
  they subscribe to, including the opt-in flags, so the receiving tool can respect them.
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
| Pinterest Tag + API for Conversions | `page`, pagevisit, search, addtocart, checkout, lead with `event_id`, line_items | optional: same + signup (`POST /v5/ad_accounts/{id}/events`), hashed em/ph/external_id, IP, UA, `_epik` click id; test mode switch (`?test=true`) | server: test event in test mode (not recorded); website tab loads the tag |
| Snap Pixel + Conversions API | PAGE_VIEW, VIEW_CONTENT, SEARCH, ADD_CART, START_CHECKOUT, ADD_BILLING, PURCHASE (`client_dedup_id` = event id, `transaction_id`) | optional: same + SIGN_UP (`POST tr.snapchat.com/v3/{pixel}/events`, action_source WEB), `ScCid` click id, `_scid` | server: `/events/validate` (not recorded); website tab loads the Pixel |
| Microsoft Advertising (UET + Conversions API) | UET with SPA page loads, view_item, search, add_to_cart, begin_checkout, add_payment_info, purchase, generate_lead | optional: pageLoad + same (`POST capi.uet.microsoft.com/v1/{tag}/events`), email normalised Microsoft's way, E.164 phone, `msclkid`; only sent with something to match on | server: test event marked `adStorageConsent: "D"` (never used for ads); website tab loads UET |
| LinkedIn (Insight Tag + Conversions API) | Insight Tag; order and lead conversions via `lintrk` with `event_id` | optional: order/lead (`POST /rest/conversionEvents`, Linkedin-Version 202609), hashed email, `li_fat_id`, IP | server: token + conversion IDs looked up in the ad account (unknown ID fails); website tab loads the tag |
| WhatsApp Business (Cloud API) | – | order confirmation, shipped (with tracking), unfinished-checkout reminder (with cart link), as approved templates | phone number ID + token checked; optional `hello_world` to a test number |
| Brevo | – | contact to list, events order_placed / cart_abandoned (cart_url) / order_shipped / subscribed | API key + list checked |
| Mailchimp | – | member upsert (MD5 of email), tags `customer` / `abandoned-cart` / `newsletter`, CARTURL merge field when it exists | API key + audience checked; tip if CARTURL is missing |
| Klaviyo | – | Placed Order / Abandoned Cart (CheckoutURL) / Fulfilled Order events, email subscription to the list | API key + list checked |
| Webhooks (up to 10) | – | any events, JSON, signed `X-T64-Signature: t=…,v1=HMAC-SHA256(secret, t + "." + body)`, `X-T64-Event-Id` stable across retries | signed test call; https only |

\* sent as custom events (Meta has no standard event for them). Meta has no refund event.

**Awaiting credentials (all of them).** Built and tested against a stand-in server that checks each
platform's documented request format; **none is verified against a real account yet.** Each shows
"Not connected" / "Configuration required" until its IDs and keys are entered and its test passes, and
it can't be switched on before that. TikTok is not included: it is blocked in India.

### WhatsApp setup

1. Meta for Developers → app → WhatsApp → API Setup: copy the **Phone number ID**; create a permanent
   System User token with `whatsapp_business_messaging`. App settings → Basic → **App secret**.
2. WhatsApp Manager → Message templates: create and get approved (language as set in the admin):
   - order confirmation (Utility): `{{1}}` first name, `{{2}}` order number (#1042), `{{3}}` total (₹2,499)
   - shipped (Utility): `{{1}}` first name, `{{2}}` order number, `{{3}}` tracking number or link
   - unfinished checkout (Marketing): `{{1}}` first name, `{{2}}` link back to the cart
3. Configuration → Webhook: URL and verify token are shown in the admin (`https://api.<domain>/webhooks/whatsapp`);
   subscribe to `messages`. Delivery updates (delivered, read, failed) then show in the Event Manager.
   Calls without a valid `X-Hub-Signature-256` are refused.

### Unfinished checkouts

A checkout that reached the address step (email given) and wasn't ordered becomes one `AbandonedCart`
event after the wait set in Advanced (2 hours by default, up to 3 days back), once per cart and at most
once a day per customer, and never if the same email has ordered since. The link
`/cart/recover/<cart id>.<HMAC>` puts the same items back in the visitor's cart; a changed link does nothing.

## 3. Database (module `marketing`, migrations `Migration20261109211432` (new tables) and `Migration20261109221610` (added columns))

- `marketing_event`: one row per event (`event_id` unique, name, source, page, order_id, customer_hash, value, currency, data, consent).
- `marketing_delivery`: one row per event and platform (unique), channel browser/server, status
  `browser | pending | success | failed | skipped`, attempts, next_attempt_at, response_code, last_error, payload,
  external_id / external_status (WhatsApp message id and its delivery status).
- `marketing_context`: checkout visit details by cart id (see above), plus ad click ids (marketing consent only).
- Settings: `marketing_settings` in the content module's settings (webhook secrets inside it are encrypted).
  Secrets in the encrypted service keys (AES-256-GCM, key from JWT_SECRET + COOKIE_SECRET), see section 8.

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
- Webhooks: `POST /admin/marketing/webhooks` (answer includes the secret, once), `POST|DELETE /admin/marketing/webhooks/:id`,
  `POST /admin/marketing/webhooks/:id/test`, `POST /admin/marketing/webhooks/:id/rotate`.

Public:
- `GET|POST /webhooks/whatsapp`: Meta's verification and delivery updates (signature checked with the app secret).
- `GET /store/marketing/recover/:token`: items of an unfinished checkout for the recovery link.
- Changed: `/store/order-status` items now include product_id, variant_id, sku, unit_price.

All admin changes are written to the Activity log.

## 5. Background work

- Subscriber `marketing-events` (order.placed, payment.refunded, customer.created, shipment.created).
- Job `marketing-abandoned` every 15 minutes: unfinished checkouts (see above).
- Job `marketing-dispatch` every minute: sends what's due (runs in the worker).
- Job `marketing-prune` nightly: keeps events for the retention set in Advanced (30 days by default).
- Uses Medusa's existing event bus, worker and jobs; no new infrastructure.

## 6. Tests

- Unit: `npm run test:unit -- src/lib/marketing` (44 tests: hashing and normalisation, Meta and GA4
  payloads, product id mapping, statuses, consent rules, idempotency, exclusions, retry with backoff,
  Retry-After, wrong token, giving up; Pinterest, Snapchat, Microsoft, LinkedIn, WhatsApp, Brevo,
  Mailchimp, Klaviyo payloads; opt-in rules; webhook signing; recovery links; personal data removal).
- End to end (local, stand-in Meta/Google server): shopper visit with consent banner, product view,
  search, add/remove, cart, checkout, payment step, COD order with two products, order page reloaded,
  refund, essential-cookies-only visit, changing consent later, made-up and cross-site events, Meta
  down then retried, wrong token, data deletion. Phase 2: every new integration's test (including a wrong
  key and an unknown LinkedIn conversion ID), switch-on refused before a test, checkout opt-ins, all four
  new browser tags with shared event ids, all server copies with click ids, WhatsApp order message and
  signed delivery updates (delivered → read, never backwards; unsigned refused), unfinished-checkout
  reminder on every channel plus the recovery link (and a changed link refused), shipment, newsletter,
  a webhook with signature checking, and a 503 retried a minute later.

## 7. Manual checklist after adding real keys

1. Meta Pixel: enter Pixel ID → Save and test → switch on. Meta Events Manager → Test events: browse the shop.
2. Meta Conversions API: paste token (main admin) → add the test code from Test events → Save and test →
   switch on → place a test order → the Purchase shows twice in Test events, marked "Deduplicated".
   Then remove the test code.
3. GA4: Measurement ID → Save and test → switch on → Reports → Realtime. Optional server copy: API secret → test.
4. Google Ads: Conversion ID and labels → test → switch on. Turn on enhanced conversions in Google Ads too.
5. Pinterest / Snapchat / Microsoft / LinkedIn: IDs → test → switch on; server copies need the token
   (Pinterest: keep "Test mode" on for the first test order, then off). LinkedIn: conversions must use the
   "Conversions API" method; renew the token before its 60 days run out.
6. WhatsApp: see "WhatsApp setup"; test with your own number; place a test order with the WhatsApp tick.
7. Brevo / Mailchimp / Klaviyo: key + list → test → switch on; build the automation/journey/flow on the
   events or tags above; place a test order with the email tick.
8. Webhooks: add the address, copy the secret, Send test.
9. Check Event Manager: no failed deliveries.

## 8. Environment variables

Nothing new is required: keys are pasted in the admin. Optional, instead of the admin, in
`apps/backend/.env`: `META_CAPI_TOKEN`, `GA4_API_SECRET`, `PINTEREST_TOKEN`, `SNAPCHAT_TOKEN`,
`MICROSOFT_CAPI_TOKEN`, `LINKEDIN_TOKEN`, `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `BREVO_API_KEY`,
`MAILCHIMP_API_KEY`, `KLAVIYO_API_KEY`. `MEDUSA_BACKEND_URL` gives the WhatsApp webhook address and
`STORE_URL` the recovery link's domain (both already set by the deploy).

For local testing only, `MARKETING_<NAME>_BASE` sends a platform to a stand-in server: `META`
(also WhatsApp), `GA`, `PINTEREST`, `SNAP`, `UET`, `LINKEDIN`, `BREVO`, `MAILCHIMP`, `KLAVIYO`.

## 9. Deploy

`bash /opt/the64squares/app/deploy/update.sh` (runs the migration and restarts the API and worker).

## 10. Known limits

- Multi-store: each store (The 64 Squares, Stancil) is its own server, database and admin, so settings,
  keys and logs are separate by design; there is no shared multi-tenant admin.
- Tag tests confirm the tag loads with that ID; Google and Meta don't confirm a browser ID is yours
  (check Realtime / Test events). GA4's API secret can't be checked by Google's debug endpoint.
- CompleteRegistration is sent only in "Notice only" mode (the browser's choice isn't known at sign-up).
- Failed online payments create no order, so no Purchase. Unfinished checkouts are only known once an
  email is given at the address step.
- WhatsApp templates must be approved by Meta and match the variables above; message content is set
  in WhatsApp Manager, not here. Marketing templates to Indian numbers may be limited by Meta.
- LinkedIn access tokens expire after 60 days (no refresh flow built: paste a new one).
- Mailchimp: "Abandoned cart" uses a tag-triggered Customer Journey, not Mailchimp's e-commerce store
  sync (which needs a full product catalogue sync).
- A refund doesn't remove the customer tag or send a refund to the email tools.
- No custom script / HTML tag box (on purpose: arbitrary scripts are a security risk).
- Settings reach the website within about a minute (cached).

## 11. Not included

TikTok (blocked in India). HubSpot, Omnisend and the other "additional e-commerce" connectors from the
brief: other tools can be reached through webhooks.
