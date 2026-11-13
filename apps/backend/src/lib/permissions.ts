// Staff roles and permissions (Settings → Staff & permissions in the admin).
//
// Two roles:
// - Admin: can do everything. The main admin (OWNER_EMAIL) is always an admin.
// - Moderator (employees): can do only what the admin switched on for them, one toggle per
//   action below. Each moderator has their own toggles; new moderators start with the
//   defaults the admin set.
//
// Every admin API request is matched to one action here and checked on the server, so a
// moderator cannot get around a toggle by calling the API directly.

export const OWNER_EMAIL = (process.env.OWNER_EMAIL || "").toLowerCase()

export type StaffRole = "admin" | "moderator"

export type Permission = {
  key: string
  group: string
  label: string
  description: string
  // Switched on for new moderators unless the admin changes the defaults.
  default: boolean
}

export const PERMISSIONS: Permission[] = [
  // Orders
  { key: "orders.view", group: "Orders", label: "View orders", description: "See orders, returns, exchanges, claims and draft orders, including customer delivery details.", default: true },
  { key: "orders.fulfil", group: "Orders", label: "Pack & ship orders", description: "Create fulfilments, add tracking, mark as shipped or delivered.", default: true },
  { key: "orders.edit", group: "Orders", label: "Edit orders, returns & exchanges", description: "Change order details and items, handle returns, exchanges and claims, create draft orders.", default: false },
  { key: "orders.cancel", group: "Orders", label: "Cancel or archive orders", description: "Cancel an order or move it to the archive.", default: false },
  { key: "orders.export", group: "Orders", label: "Export orders", description: "Download the order list as a file.", default: false },
  { key: "payments.manage", group: "Orders", label: "Payments & refunds", description: "Capture payments, give refunds, mark orders as paid.", default: false },

  // Products
  { key: "products.edit", group: "Products", label: "Add & edit products", description: "Titles, descriptions, photos, options, variants, categories, collections, tags and types. Not prices.", default: true },
  { key: "products.prices", group: "Products", label: "Change prices", description: "Set or change product prices and price lists (sales).", default: false },
  { key: "products.delete", group: "Products", label: "Delete products", description: "Delete products, variants, categories, collections, tags and types.", default: false },
  { key: "products.import", group: "Products", label: "Import & export products", description: "Bulk import or export products as a spreadsheet file.", default: false },
  { key: "inventory.edit", group: "Products", label: "Update stock", description: "Change stock levels and reservations.", default: true },

  // Customers & marketing
  { key: "customers.view", group: "Customers & marketing", label: "View customers", description: "See customer names, emails, phone numbers and addresses.", default: true },
  { key: "customers.edit", group: "Customers & marketing", label: "Add & edit customers", description: "Change customer details and customer groups.", default: false },
  { key: "customers.delete", group: "Customers & marketing", label: "Delete customers", description: "Remove customers and customer groups.", default: false },
  { key: "promotions.manage", group: "Customers & marketing", label: "Discounts & promotions", description: "See, create and change discount codes, promotions and campaigns.", default: false },
  { key: "messages.view", group: "Customers & marketing", label: "Read contact messages", description: "See messages sent with the Contact page form and mark them as answered.", default: true },
  { key: "mailbox.view", group: "Customers & marketing", label: "Read & answer the email inbox", description: "See every email sent to the shop's mailbox (e.g. info@the64squares.in) and reply from it.", default: false },
  { key: "reviews.manage", group: "Customers & marketing", label: "Product reviews", description: "Approve or hide shoppers' reviews, answer them, and add reviews received elsewhere.", default: true },
  { key: "analytics.view", group: "Customers & marketing", label: "Analytics", description: "See visits, sales by source, campaigns, searches and Play numbers (no customer details).", default: false },
  { key: "subscribers.view", group: "Customers & marketing", label: "View newsletter subscribers", description: "See the newsletter sign-up list.", default: false },

  // Website
  { key: "content.homepage", group: "Website", label: "Edit Homepage", description: "Banner, featured collection and newsletter section.", default: true },
  { key: "content.about", group: "Website", label: "Edit About us & team faces", description: "Who are we?, Faces behind The 64 Squares and Get in touch.", default: true },
  { key: "content.footer", group: "Website", label: "Edit menu, footer & announcement bar", description: "Top-menu words and links, footer links and social links, the announcement strip, and the footer animation.", default: true },
  { key: "content.blog", group: "Website", label: "Write blog posts", description: "Create and edit draft posts.", default: true },
  { key: "content.blog_publish", group: "Website", label: "Publish blog posts", description: "Put posts live, edit live posts, delete posts. Without this, posts stay drafts for the admin to publish.", default: false },
  { key: "content.news", group: "Website", label: "Write news", description: "Create and edit draft news articles.", default: true },
  { key: "content.news_publish", group: "Website", label: "Publish news", description: "Put news live, edit live articles, delete articles. Without this, articles stay drafts for the admin to publish.", default: false },
  { key: "content.contact", group: "Website", label: "Edit Contact page", description: "The ways to reach you, the form's questions, and where messages are emailed.", default: false },
  { key: "content.chatbot", group: "Website", label: "Edit the chat bot", description: "The chat bubble on the website: its answers, buttons, WhatsApp handover and AI.", default: false },
  { key: "content.adverts", group: "Website", label: "Play screen adverts", description: "Adverts in the Play screen's main window: pictures, videos and 3D designs, their buttons, coupons and rewards, and the default screen.", default: false },
  { key: "content.help", group: "Website", label: "Edit help pages", description: "Delivery, Returns & warranty, FAQs, Privacy, Terms.", default: false },

  // Tournaments
  { key: "tournaments.manage", group: "Tournaments", label: "Manage tournaments", description: "Create, edit, publish, cancel and delete tournaments.", default: false },
  { key: "fairplay.review", group: "Tournaments", label: "Fair play review", description: "See players flagged by the anti-cheat checks and clear, warn or ban them.", default: false },
  { key: "tournaments.checkin", group: "Tournaments", label: "Players & check-in", description: "See who registered (names, emails, phones), download the list, check players in at the door, cancel a place.", default: true },

  // Settings
  { key: "settings.branding", group: "Settings", label: "Branding, SEO & upload limits", description: "The admin sign-in logo, SEO & analytics, and the file size limits.", default: false },
  { key: "settings.shipping", group: "Settings", label: "Shipping & locations", description: "Shipping options and profiles, stock locations, delivery areas.", default: false },
  { key: "settings.marketing", group: "Settings", label: "Marketing & integrations", description: "Ad and analytics tags (Meta, Google, Clarity), cookie consent, and the Event Manager. Secret keys still need the main admin.", default: false },
  { key: "settings.store", group: "Settings", label: "Store, payments & tax", description: "Store details, Payments & delivery (Cash on Delivery, online payment), regions, currencies, tax, sales channels, return and refund reasons.", default: false },
]

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as [string, ...string[]]
export const DEFAULT_PERMISSIONS = PERMISSIONS.filter((p) => p.default).map((p) => p.key)

// Shown in the admin as "admin only"; these can never be given to a moderator.
export const ADMIN_ONLY = [
  "Add, remove and invite staff; change roles and permissions",
  "Payment and email keys (main admin only, with password)",
  "Activity log",
  "API keys (secret and publishable)",
  "Workflow logs and system tools",
]

export const DEFAULTS_SETTING_KEY = "moderator_default_permissions"

// What a request needs: a permission key, "admin" (admin only), or "allow" (any staff).
export type Need = string | "admin" | "allow"

type Rule = { methods: "read" | "write" | "any"; pattern: RegExp; need: Need }

const r = (methods: Rule["methods"], pattern: RegExp, need: Need): Rule => ({ methods, pattern, need })

// First match wins. Paths are without the /admin prefix.
const RULES: Rule[] = [
  // Our own staff & permissions endpoints (the guard handles /staff/me itself).
  r("any", /^\/staff(\/|$)/, "admin"),
  // Payment and email keys: admins pass the guard; the route then allows the main admin only.
  r("any", /^\/service-keys(\/|$)/, "admin"),
  r("any", /^\/activity(\/|$)/, "admin"),

  // Always fine for staff: their session, saved table views, notifications, search.
  r("any", /^\/(views|layouts|notifications|feature-flags|search|property-labels)(\/|$)/, "allow"),
  r("read", /^\/users(\/|$)/, "allow"),
  r("any", /^\/(uploads|image-preview)(\/|$)/, "allow"),

  // Admin only.
  r("any", /^\/(api-keys|invites|rbac|workflows-executions|plugins|index)(\/|$)/, "admin"),
  r("write", /^\/search-indexes(\/|$)/, "admin"),
  r("write", /^\/users(\/|$)/, "admin"), // own profile is allowed by the guard

  // Orders & payments.
  r("write", /^\/orders\/export/, "orders.export"),
  r("write", /^\/orders\/[^/]+\/(cancel|archive)$/, "orders.cancel"),
  r("write", /^\/orders\/[^/]+\/fulfillments(\/|$)/, "orders.fulfil"),
  r("write", /^\/fulfillments(\/|$)/, "orders.fulfil"),
  r("write", /^\/(payments|payment-collections)(\/|$)/, "payments.manage"),
  r("write", /^\/orders\/[^/]+\/payment-sessions/, "payments.manage"),
  r("write", /^\/(orders|order-edits|order-changes|returns|claims|exchanges|draft-orders)(\/|$)/, "orders.edit"),
  r("read", /^\/(orders|order-edits|order-changes|returns|claims|exchanges|draft-orders|payments|payment-collections|fulfillments)(\/|$)/, "orders.view"),

  // Customers & marketing.
  r("read", /^\/(customers|customer-groups)(\/|$)/, "customers.view"),
  r("write", /^\/(customers|customer-groups)(\/|$)/, "customers.edit"), // DELETE is upgraded below
  r("any", /^\/(promotions|campaigns)(\/|$)/, "promotions.manage"),
  r("any", /^\/subscribers(\/|$)/, "subscribers.view"),

  // Prices.
  r("any", /^\/price-lists(\/|$)/, "products.prices"),
  // Settings screens read whether prices include tax; only changing it needs the toggle.
  r("write", /^\/price-preferences(\/|$)/, "products.prices"),

  // Products & stock.
  r("write", /^\/products\/(import|imports|export)(\/|$)/, "products.import"),
  r("write", /^\/(products|product-variants|product-options|product-categories|collections|product-tags|product-types)(\/|$)/, "products.edit"),
  // The simple product form; it checks "Change prices" and "Delete products" itself.
  r("write", /^\/store-products(\/|$)/, "products.edit"),
  r("write", /^\/shop-order(\/|$)/, "products.edit"),
  r("write", /^\/(inventory-items|reservations)(\/|$)/, "inventory.edit"),

  // Website (our pages). Content blocks and posts get a closer look in the guard.
  r("write", /^\/team-members(\/|$)/, "content.about"),
  r("write", /^\/site-navigation(\/|$)/, "content.footer"),
  r("write", /^\/contact-page(\/|$)/, "content.contact"),
  r("any", /^\/contact-messages(\/|$)/, "messages.view"),
  r("any", /^\/reviews(\/|$)/, "reviews.manage"),
  r("any", /^\/mailbox(\/|$)/, "mailbox.view"),
  // Past chats hold what shoppers typed: the same people who read contact messages.
  r("any", /^\/chatbot\/chats(\/|$)/, "messages.view"),
  r("write", /^\/chatbot(\/|$)/, "content.chatbot"),
  r("write", /^\/pages(\/|$)/, "content.help"),
  r("any", /^\/showcase(\/|$)/, "content.adverts"),
  r("write", /^\/posts(\/|$)/, "content.blog"),
  r("write", /^\/news(\/|$)/, "content.news"),
  r("any", /^\/content-hub(\/|$)/, "content.blog"),
  r("write", /^\/upload-limits(\/|$)/, "settings.branding"),
  r("write", /^\/seo-settings(\/|$)/, "settings.branding"),
  r("write", /^\/site-features(\/|$)/, "settings.branding"),
  r("write", /^\/seo(\/|$)/, "settings.branding"),
  r("any", /^\/marketing(\/|$)/, "settings.marketing"),
  r("read", /^\/analytics(\/|$)/, "analytics.view"),
  r("any", /^\/automations(\/|$)/, "settings.marketing"),
  r("any", /^\/push(\/|$)/, "settings.marketing"),
  r("write", /^\/checkout-settings(\/|$)/, "settings.store"),
  r("write", /^\/invoice-settings(\/|$)/, "settings.store"),
  r("write", /^\/invoices(\/|$)/, "orders.edit"),
  r("read", /^\/invoices(\/|$)/, "orders.view"),

  // Tournaments: players' details and check-in need their own toggle, even to read.
  r("any", /^\/fair-play(\/|$)/, "fairplay.review"),
  r("any", /^\/tournament-checkin(\/|$)/, "tournaments.checkin"),
  r("write", /^\/tournaments\/[^/]+\/registrations\/[^/]+\/result$/, "tournaments.manage"),
  r("any", /^\/tournament-passes(\/|$)/, "tournaments.manage"),
  r("any", /^\/tournaments\/[^/]+\/registrations(\/|$)/, "tournaments.checkin"),
  r("write", /^\/tournaments(\/|$)/, "tournaments.manage"),

  // Settings.
  r("write", /^\/(shipping-options|shipping-option-types|shipping-profiles|stock-locations|fulfillment-sets|fulfillment-providers)(\/|$)/, "settings.shipping"),
  r("write", /^\/(stores|regions|currencies|tax-rates|tax-regions|tax-providers|sales-channels|return-reasons|refund-reasons|translations|locales)(\/|$)/, "settings.store"),

  // Everything else may be read by any staff member (the admin screens need it to load);
  // any other change is admin only.
  r("read", /.*/, "allow"),
  r("write", /.*/, "admin"),
]

const DELETE_UPGRADES: [RegExp, string][] = [
  [/^\/(products|product-variants|product-options|product-categories|collections|product-tags|product-types)(\/|$)/, "products.delete"],
  [/^\/(customers|customer-groups)(\/|$)/, "customers.delete"],
]

// The permission a request needs, from its method and path (without /admin).
export const needFor = (method: string, path: string): Need => {
  const write = method !== "GET" && method !== "HEAD" && method !== "OPTIONS"
  if (method === "DELETE") {
    const up = DELETE_UPGRADES.find(([re]) => re.test(path))
    if (up) {
      return up[1]
    }
  }
  const rule = RULES.find(
    (x) => (x.methods === "any" || (x.methods === "write") === write) && x.pattern.test(path)
  )
  return rule ? rule.need : write ? "admin" : "allow"
}

// True when a request body sets any price (variant prices, price lists...).
export const touchesPrices = (body: unknown, depth = 0): boolean => {
  if (!body || typeof body !== "object" || depth > 6) {
    return false
  }
  if (Array.isArray(body)) {
    return body.some((x) => touchesPrices(x, depth + 1))
  }
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if ((k === "prices" && Array.isArray(v) && v.length > 0) || (k === "amount" && depth > 0 && typeof v === "number")) {
      return true
    }
    if (touchesPrices(v, depth + 1)) {
      return true
    }
  }
  return false
}

export const permissionLabel = (key: string) => PERMISSIONS.find((p) => p.key === key)?.label ?? key

// A user's role and permissions, from their metadata.
export const staffOf = (
  user: { email: string; metadata?: Record<string, unknown> | null },
  defaults: string[]
): { role: StaffRole; owner: boolean; permissions: string[] } => {
  const owner = user.email.toLowerCase() === OWNER_EMAIL
  const meta = user.metadata ?? {}
  const role: StaffRole = owner || meta.t64_role === "admin" ? "admin" : "moderator"
  const saved = meta.t64_permissions
  const permissions =
    role === "admin"
      ? PERMISSION_KEYS.slice()
      : Array.isArray(saved)
        ? saved.filter((k): k is string => typeof k === "string" && PERMISSION_KEYS.includes(k))
        : defaults
  return { role, owner, permissions }
}
