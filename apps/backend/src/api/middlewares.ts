import {
  authenticate,
  configureStoreSearch,
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import {
  ContentBlockBody,
  NewsletterBody,
  PageBody,
  PostBody,
  UpdateContentBlockBody,
  UpdatePageBody,
  UpdatePostBody,
  UploadLimitsBody,
  TeamMemberBody,
  UpdateTeamMemberBody,
  StaffUpdateBody,
  StaffDefaultsBody,
  CheckoutSettingsBody,
  SeoSettingsBody,
  ProductFormBody,
  InvoiceSettingsBody,
  SiteNavigationBody,
  ShopOrderBody,
  ContactPageBody,
  ContactMessageBody,
  MailThreadBody,
  MailSendBody,
  MailActionBody,
  ChatbotBody,
  TournamentBody,
  UpdateTournamentBody,
  RegistrationStatusBody,
  CheckInBody,
  TournamentRegisterBody,
  FairPlayDecisionBody,
  ChatbotTestBody,
} from "./admin/validators"
import { staffGuard } from "./staff-guard"
import { activityRecorder, signInRecorder } from "../lib/activity"
import { paymentMethodGuard } from "./store/payment-guard"

export default defineMiddlewares({
  routes: [
    {
      // Staff & permissions: moderators may only do what the admin switched on for them.
      matcher: "/admin/*",
      middlewares: [staffGuard, activityRecorder],
    },
    {
      // Activity log: admin sign-ins, successful and failed.
      matcher: "/auth/user/emailpass",
      middlewares: [signInRecorder],
    },
    {
      method: ["POST"],
      matcher: "/admin/staff/defaults",
      middlewares: [validateAndTransformBody(StaffDefaultsBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/staff/:id",
      middlewares: [validateAndTransformBody(StaffUpdateBody)],
    },
    {
      // The product index declares filterable `status` and `sales_channel_ids`, so
      // the route narrows it to published products in the key's sales channels.
      method: ["POST"],
      matcher: "/store/search",
      middlewares: [
        configureStoreSearch({
          allowed_indexes: {
            product: true,
          },
        }),
      ],
    },
    {
      method: ["POST"],
      matcher: "/store/newsletter",
      middlewares: [validateAndTransformBody(NewsletterBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/content-blocks",
      middlewares: [validateAndTransformBody(ContentBlockBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/content-blocks/:id",
      middlewares: [validateAndTransformBody(UpdateContentBlockBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/pages",
      middlewares: [validateAndTransformBody(PageBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/pages/:id",
      middlewares: [validateAndTransformBody(UpdatePageBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/posts",
      middlewares: [validateAndTransformBody(PostBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/posts/:id",
      middlewares: [validateAndTransformBody(UpdatePostBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/upload-limits",
      middlewares: [validateAndTransformBody(UploadLimitsBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/team-members",
      middlewares: [validateAndTransformBody(TeamMemberBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/team-members/:id",
      middlewares: [validateAndTransformBody(UpdateTeamMemberBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/store-products",
      middlewares: [validateAndTransformBody(ProductFormBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/store-products/:id",
      middlewares: [validateAndTransformBody(ProductFormBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/site-navigation",
      middlewares: [validateAndTransformBody(SiteNavigationBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/shop-order",
      middlewares: [validateAndTransformBody(ShopOrderBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/contact-page",
      middlewares: [validateAndTransformBody(ContactPageBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/contact-messages/:id",
      middlewares: [validateAndTransformBody(ContactMessageBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/mailbox/threads/:id",
      middlewares: [validateAndTransformBody(MailThreadBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/chatbot",
      middlewares: [validateAndTransformBody(ChatbotBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/chatbot/try",
      middlewares: [validateAndTransformBody(ChatbotTestBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/mailbox/actions",
      middlewares: [validateAndTransformBody(MailActionBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/mailbox/send",
      // Attachments travel in the body (up to about 10 MB of files).
      bodyParser: { sizeLimit: "20mb" },
      middlewares: [validateAndTransformBody(MailSendBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/invoice-settings",
      middlewares: [validateAndTransformBody(InvoiceSettingsBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/seo-settings",
      middlewares: [validateAndTransformBody(SeoSettingsBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/checkout-settings",
      middlewares: [validateAndTransformBody(CheckoutSettingsBody)],
    },
    {
      // Checkout: Cash on Delivery / online payment rules from Settings → Payments & delivery.
      method: ["POST"],
      matcher: "/store/payment-collections/:id/payment-sessions",
      middlewares: [paymentMethodGuard],
    },
    {
      // Right after signing in with a code or Google, before the sign-in has a customer.
      method: ["POST"],
      matcher: "/store/account/link",
      middlewares: [authenticate("customer", ["bearer"], { allowUnregistered: true })],
    },
    {
      matcher: "/store/account/password",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/store/account/reviews*",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/store/account/orders*",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/store/account/tournaments*",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      method: ["POST"],
      matcher: "/store/tournaments/:handle/register",
      middlewares: [authenticate("customer", ["bearer", "session"]), validateAndTransformBody(TournamentRegisterBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/fair-play/:id",
      middlewares: [validateAndTransformBody(FairPlayDecisionBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/tournaments",
      middlewares: [validateAndTransformBody(TournamentBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/tournaments/:id",
      middlewares: [validateAndTransformBody(UpdateTournamentBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/tournaments/:id/registrations/:rid",
      middlewares: [validateAndTransformBody(RegistrationStatusBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/tournament-checkin",
      middlewares: [validateAndTransformBody(CheckInBody)],
    },
  ],
})
