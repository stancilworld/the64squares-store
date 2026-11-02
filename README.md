# The64Squares store

The64Squares' ecommerce website: a **Medusa v2** commerce engine with a Shopify-like admin, and a **Next.js** storefront. It started as a copy of the Stancil store and shares its checkout, accounts, admin and deployment.

```
apps/
  backend/      Medusa server + admin (http://localhost:9000, admin at /app)
  storefront/   Next.js website (http://localhost:8000)
```

## What is built so far

| Area | Status |
| --- | --- |
| Store setup | India region, INR, prices include 18% GST (confirm the rate for HSN 9504), warehouse, free standard delivery |
| Catalogue | Categories (Chess Sets, Boards, Pieces, Clocks, Books, Accessories), Colour and Material options, Signature Collection, 6 **sample** products |
| Content | Homepage, About us, help pages, blog (The64Squares Journal), menu and footer, all edited in the admin |
| Checkout | Razorpay + Cash on Delivery, pincode check (Delhivery when its token is set), order emails via Resend, GST invoices, customer accounts (email code, password, Google) |
| Admin | Staff roles (Admin / Moderator), activity log, scheduled publishing, mailbox, chat bot |
| Keys | Razorpay, Resend, Google and Delhivery keys: the main admin (OWNER_EMAIL) enters them in Settings → Payments & delivery → Keys, or on the server with deploy/set-keys.sh |
| Next | The64Squares design for the storefront, real products, then tournaments |

## Run it locally

Needs Node 22+, PostgreSQL 15+ and Redis.

```bash
npm install

# Backend
cp apps/backend/.env.template apps/backend/.env      # then edit DATABASE_URL, OWNER_EMAIL etc.
createdb the64squares
cd apps/backend
npx medusa db:migrate                                 # also runs the first-time store setup
npx medusa user -e you@example.com -p 'a-strong-password'
npm run dev                                           # http://localhost:9000/app

# Storefront (new terminal)
cd apps/storefront
# .env.local needs MEDUSA_BACKEND_URL=http://localhost:9000 and the publishable key from
# Admin > Settings > Publishable API Keys
npm run dev                                           # http://localhost:8000
```

## Deploying to the VPS

The store runs on the same Hostinger VPS as Stancil (KVM 2: 2 CPU, 8 GB), fully separated from it:

| | Stancil | The64Squares |
| --- | --- | --- |
| Folder and Linux user | `/opt/stancil`, `stancil` | `/opt/the64squares`, `the64squares` |
| Services | backend + worker + storefront | `the64squares-backend`, `the64squares-worker`, `the64squares-storefront` |
| Ports | 9000, 9001, 8000 | 9100, 9101, 8100 |
| Database | PostgreSQL `stancil` | PostgreSQL `the64squares` |
| Redis | database 0 | database 1 |
| Web server file | `stancil.conf` | `the64squares.conf` |

Memory limits per service: backend 1.5 GB, worker 1 GB, storefront 1.2 GB. Builds run inside a 3.5 GB limit (deploy/build.sh) so a runaway build can never take memory from Stancil.

First time (as root on the server, after adding a deploy key for this repo on GitHub as `/root/.ssh/t64_deploy`):

```bash
git clone git@github.com:stancilworld/the64squares-store.git /opt/the64squares/app
OWNER_EMAIL=you@example.com SSL_EMAIL=you@example.com bash /opt/the64squares/app/deploy/setup-vps.sh
```

It runs first on staging addresses (https://staging.the64squares.in, admin at https://api-staging.the64squares.in/app), which need A records pointing at the server. It prints the admin password at the end.

- Go live on the64squares.in: `bash /opt/the64squares/app/deploy/go-live.sh`
- Update after pushing to GitHub: `bash /opt/the64squares/app/deploy/update.sh`
- Keys: `bash /opt/the64squares/app/deploy/set-keys.sh`
- Logs: `journalctl -u the64squares-backend -f` (same for the worker and storefront)
- Uploaded images: `/opt/the64squares/uploads`
- Backups (nightly, 14 days): `/opt/the64squares/backups`
- Secrets: `/opt/the64squares/secrets.env` (root only)

## Custom code map

| Path | What it is |
| --- | --- |
| `apps/backend/src/modules/content` | Page content blocks, help pages, chat and mailbox records |
| `apps/backend/src/modules/blog` | Blog posts |
| `apps/backend/src/modules/newsletter` | Newsletter subscribers |
| `apps/backend/src/modules/razorpay`, `resend`, `otp-auth`, `google-auth` | Payments, email, sign-in |
| `apps/backend/src/workflows/*` | Create / update / delete logic with automatic rollback |
| `apps/backend/src/api/store/*`, `api/admin/*` | Public and admin routes |
| `apps/backend/src/admin/*` | Admin pages and widgets |
| `apps/backend/src/migration-scripts/initial-data-seed.ts` | First-run store setup and sample data |
| `apps/storefront/src/lib/data.ts` | All storefront data fetching (cached) |
| `apps/storefront/src/lib/cart.ts` | Cart server actions |
