# Stancil store

Stancil's ecommerce website: a **Medusa v2** commerce engine with a Shopify-like admin, and a **Next.js** storefront built from the Stancil designs.

```
apps/
  backend/      Medusa server + admin (http://localhost:9000, admin at /app)
  storefront/   Next.js website (http://localhost:8000)
```

## What is built so far

| Area | Status |
| --- | --- |
| Store setup | India region, INR, prices include 18% GST, warehouse, free standard delivery |
| Catalogue | Categories (Chairs, Tables, Storage, Shelves), Colour and Material options, Bella collection, 6 **sample** products |
| Characters | Custom module: Bella (live), Ollie and Stella (coming soon), linked to products |
| Homepage content | Custom module: slider, Why Stancil, featured collection, product row, newsletter |
| Newsletter | Custom module + signup on the homepage, Subscribers page with CSV download |
| Admin screens | Characters, Homepage, Subscribers, and a Character picker on every product |
| Storefront | Header, footer, Home, Shop (filters, See More), Meet the gang, character pages, product page, cart |
| Checkout | Razorpay + Cash on Delivery, pincode check (Delhivery when its token is set), order emails via Resend, customer accounts (email code, password, Google) |
| Keys | Razorpay (test + live), Resend, Google, Delhivery keys: main admin enters them in Settings → Payments & delivery → Keys (encrypted with the server's JWT_SECRET + COOKIE_SECRET; changing those secrets means re-entering the keys), or on the server with deploy/set-keys.sh |
| Not yet | Delhivery shipment booking from the admin, GST invoices |

## Run it locally

Needs Node 22+, PostgreSQL 15+ and Redis.

```bash
npm install

# Backend
cp apps/backend/.env.template apps/backend/.env      # then edit DATABASE_URL etc.
createdb stancil
cd apps/backend
npx medusa db:migrate                                 # also runs the first-time Stancil setup
npx medusa user -e you@stancil.in -p 'a-strong-password'
npm run dev                                           # http://localhost:9000/app

# Storefront (new terminal)
cd apps/storefront
cp .env.template .env.local                           # paste the publishable key from
                                                      # Admin > Settings > Publishable API Keys
npm run dev                                           # http://localhost:8000
```

## The heading font

Headings use **LaiatheGreatBlondie**. Put the licensed file at
`apps/storefront/public/fonts/LaiatheGreatBlondie.woff2` (or `.ttf`). Until it is there, a scaled
stand-in font is shown.

## How content flows

- Products, prices, stock, orders, discounts: Medusa admin.
- Characters, homepage sections, subscribers: the Stancil pages in the admin sidebar.
- The website caches store data for about a minute, so admin changes appear within a minute or two.

## Custom code map

| Path | What it is |
| --- | --- |
| `apps/backend/src/modules/character` | Character data model + service |
| `apps/backend/src/modules/content` | Homepage content blocks |
| `apps/backend/src/modules/newsletter` | Newsletter subscribers |
| `apps/backend/src/links/character-product.ts` | Character has many products |
| `apps/backend/src/workflows/*` | Create / update / delete logic with automatic rollback |
| `apps/backend/src/api/store/*` | Public routes: characters, content, newsletter |
| `apps/backend/src/api/admin/*` | Admin routes + validation |
| `apps/backend/src/admin/*` | Admin pages and the product Character widget |
| `apps/backend/src/migration-scripts/initial-data-seed.ts` | First-run store setup and sample data |
| `apps/storefront/src/lib/data.ts` | All storefront data fetching (cached) |
| `apps/storefront/src/lib/cart.ts` | Cart server actions |

## Deploying to the VPS

Hostinger KVM 1, Ubuntu 24.04. Staging: https://staging.stancil.in, admin at https://api-staging.stancil.in/app.

First time (as root on the server, after adding the deploy key on GitHub):

```bash
git clone git@github.com:<user>/stancil-store.git /opt/stancil/app
SSL_EMAIL=you@example.com bash /opt/stancil/app/deploy/setup-vps.sh
```

The setup script installs Node 22, PostgreSQL, Redis, nginx and certbot. It creates the database and secrets, builds everything, runs three services and sets up HTTPS and nightly backups. It prints the admin password at the end. The services are `stancil-backend` (API + admin), `stancil-worker` (background jobs) and `stancil-storefront`.

To update after pushing to GitHub: `bash /opt/stancil/app/deploy/update.sh`

- Logs: `journalctl -u stancil-backend -f` (same for the worker and storefront)
- Uploaded images: `/opt/stancil/uploads`
- Backups: `/opt/stancil/backups`
- Secrets: `/opt/stancil/secrets.env` (root only)

## Editing the website (admin)

Everything on the content pages is edited in the admin (api-staging.stancil.in/app):

- **Homepage**: banner, Why Stancil points, featured collection text and carousel pictures, newsletter.
- **About us**: Who are we?, Meet our team photo, the Get in touch block.
- **Blog**: Letters from Stancil posts (draft or published, pictures, author, date).
- **Help pages**: Delivery & assembly, Returns & warranty, FAQs, Privacy, Terms, Contact.
- **Characters** and **Subscribers** as before.

Headings use Laia the Great Blondie, whose capital letters are drawn differently from small
letters, so type headings with the capitalisation you want to see.
