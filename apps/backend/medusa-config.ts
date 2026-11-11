import { loadEnv, defineConfig } from "@medusajs/framework/utils"
import { adminNavGuard } from "./src/lib/admin-nav-guard"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const REDIS_URL = process.env.REDIS_URL
const BACKEND_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
// The public store address (sign-in with Google returns here).
const STORE_URL = (
  process.env.STORE_URL ||
  (process.env.STORE_CORS || "").split(",")[0]?.trim() ||
  "http://localhost:8000"
).replace(/\/$/, "")

// In production (REDIS_URL set) events, workflows, caching and locking run on Redis so the
// server and the background worker share state. Locally they fall back to in-memory.
const redisModules = REDIS_URL
  ? [
      {
        resolve: "@medusajs/medusa/caching",
        options: {
          providers: [
            {
              resolve: "@medusajs/caching-redis",
              id: "caching-redis",
              is_default: true,
              options: { redisUrl: REDIS_URL },
            },
          ],
        },
      },
      {
        resolve: "@medusajs/medusa/event-bus-redis",
        options: { redisUrl: REDIS_URL },
      },
      {
        resolve: "@medusajs/medusa/workflow-engine-redis",
        options: { redis: { redisUrl: REDIS_URL } },
      },
      {
        resolve: "@medusajs/medusa/locking",
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/locking-redis",
              id: "locking-redis",
              is_default: true,
              options: { redisUrl: REDIS_URL },
            },
          ],
        },
      },
    ]
  : []

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: REDIS_URL,
    workerMode: (process.env.MEDUSA_WORKER_MODE || "shared") as
      | "shared"
      | "worker"
      | "server",
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
      // Customers stay signed in on the website for 30 days.
      jwtExpiresIn: "30d",
      // Staff sign in with email + password. Shoppers: email + password, an emailed code,
      // or Google (when its keys are set).
      authMethodsPerActor: {
        user: ["emailpass"],
        customer: ["emailpass", "otp", "google"],
      },
    },
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    backendUrl: BACKEND_URL,
    // Hides menu items a moderator may not use (Settings → Staff & permissions).
    // Medusa merges this into its own Vite config, so only the addition is returned.
    vite: () => ({ plugins: [adminNavGuard(BACKEND_URL)] }),
  },
  modules: [
    { resolve: "./src/modules/content" },
    { resolve: "./src/modules/newsletter" },
    { resolve: "./src/modules/blog" },
    { resolve: "./src/modules/news" },
    { resolve: "./src/modules/seo" },
    { resolve: "./src/modules/tournament" },
    { resolve: "./src/modules/activity" },
    { resolve: "./src/modules/review" },
    { resolve: "./src/modules/marketing" },
    {
      // Uploaded images are stored on the server and served from <backend>/static.
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              upload_dir: "static",
              backend_url: `${BACKEND_URL}/static`,
            },
          },
        ],
      },
    },
    {
      // Payments: Razorpay and PayU (UPI, cards, net banking, wallets). Cash on Delivery uses
      // Medusa's built-in "system" provider, which is always available.
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/razorpay",
            id: "razorpay",
            // Keys come from the admin or .env (src/lib/service-keys.ts).
            options: { api_base: process.env.RAZORPAY_API_BASE },
          },
          {
            // PayU (hosted payment page). Keys from the admin; see src/modules/payu.
            resolve: "./src/modules/payu",
            id: "payu",
            options: {},
          },
        ],
      },
    },
    {
      // Emails go out through Resend; the admin's notification bell keeps the local feed.
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/notification-local",
            id: "local",
            options: { name: "Local Notification Provider", channels: ["feed"] },
          },
          {
            resolve: "./src/modules/resend",
            id: "resend",
            options: {
              channels: ["email"],
              api_key: process.env.RESEND_API_KEY,
              from: process.env.EMAIL_FROM || "Stancil <info@the64squares.in>",
              api_base: process.env.RESEND_API_BASE,
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/auth",
      options: {
        mfa: { encryption_key: process.env.AUTH_MFA_ENCRYPTION_KEY },
        providers: [
          { resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass" },
          { resolve: "./src/modules/otp-auth", id: "otp" },
          {
            // Keys come from the admin or .env at sign-in time (src/lib/service-keys.ts).
            resolve: "./src/modules/google-auth",
            id: "google",
            options: {
              clientId: process.env.GOOGLE_CLIENT_ID || "",
              clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
              callbackUrl: `${STORE_URL}/account/google`,
            },
          },
        ],
      },
    },
    ...redisModules,
  ],
})
