import { z } from "@medusajs/framework/zod"
import { FILE_TYPE_KEYS, MAX_ALLOWED_MB } from "../../lib/upload-limits"
import { PERMISSION_KEYS } from "../../lib/permissions"

const nullableText = z.string().nullable().optional()

export const ContentBlockBody = z.object({
  page: z.string().regex(/^[a-z0-9-]+$/).optional(),
  section: z.string().regex(/^[a-z0-9_]+$/),
  eyebrow: nullableText,
  title: nullableText,
  body: nullableText,
  image_url: nullableText,
  link_label: nullableText,
  link_url: nullableText,
  rank: z.number().int().optional(),
  is_active: z.boolean().optional(),
  // Unpublished changes (Save draft) and their optional publish time.
  draft: z
    .object({
      eyebrow: nullableText,
      title: nullableText,
      body: nullableText,
      image_url: nullableText,
      link_label: nullableText,
      link_url: nullableText,
      rank: z.number().int().optional(),
      is_active: z.boolean().optional(),
      show_from: z.string().datetime().nullable().optional(),
      show_until: z.string().datetime().nullable().optional(),
    })
    .strict()
    .nullable()
    .optional(),
  publish_at: z.coerce.date().nullable().optional(),
  show_from: z.coerce.date().nullable().optional(),
  show_until: z.coerce.date().nullable().optional(),
})
export const UpdateContentBlockBody = ContentBlockBody.partial()

export type ContentBlockBodyType = z.infer<typeof ContentBlockBody>
export type UpdateContentBlockBodyType = z.infer<typeof UpdateContentBlockBody>

export const NewsletterBody = z.object({
  email: z.string().email(),
  source: z.string().max(40).optional(),
})
export type NewsletterBodyType = z.infer<typeof NewsletterBody>

const handle = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes")

export const PageBody = z.object({
  handle,
  title: z.string().min(1),
  body: z.string().optional(),
  is_published: z.boolean().optional(),
  rank: z.number().int().optional(),
})
export const UpdatePageBody = PageBody.partial()
export type PageBodyType = z.infer<typeof PageBody>
export type UpdatePageBodyType = z.infer<typeof UpdatePageBody>

export const PostBody = z.object({
  title: z.string().min(1),
  handle,
  excerpt: nullableText,
  body: z.string().optional(),
  cover_url: nullableText,
  thumbnail_url: nullableText,
  author: z.string().min(1).optional(),
  status: z.enum(["draft", "published"]).optional(),
  published_at: z.coerce.date().nullable().optional(),
})
export const UpdatePostBody = PostBody.partial()
export type PostBodyType = z.infer<typeof PostBody>
export type UpdatePostBodyType = z.infer<typeof UpdatePostBody>

// Upload limits in MB per file type, e.g. { png: 10, mp4: 50 }. Up to 100 MB (the server cap).
export const UploadLimitsBody = z.object({
  limits: z.partialRecord(z.enum(FILE_TYPE_KEYS), z.number().min(0.1).max(MAX_ALLOWED_MB)),
})
export type UploadLimitsBodyType = z.infer<typeof UploadLimitsBody>

// A face in "Meet our team". box and mask are measured by the admin when a picture is uploaded.
const TeamBox = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
})
const teamMemberFields = {
  role: nullableText,
  image_url: nullableText,
  color_image_url: nullableText,
  canvas_width: z.number().int().positive().nullable().optional(),
  canvas_height: z.number().int().positive().nullable().optional(),
  box: TeamBox.nullable().optional(),
  mask: z
    .string()
    .regex(/^[01]*$/, "Mask must be 0s and 1s")
    .max(10000)
    .nullable()
    .optional(),
  rank: z.number().int().optional(),
  is_active: z.boolean().optional(),
}
export const TeamMemberBody = z.object({ name: z.string().min(1), ...teamMemberFields })
export type TeamMemberBodyType = z.infer<typeof TeamMemberBody>
export const UpdateTeamMemberBody = z.object({ name: z.string().min(1).optional(), ...teamMemberFields })
export type UpdateTeamMemberBodyType = z.infer<typeof UpdateTeamMemberBody>

// Staff & permissions.
export const StaffUpdateBody = z.object({
  role: z.enum(["admin", "moderator"]).optional(),
  permissions: z.array(z.enum(PERMISSION_KEYS)).optional(),
})
export type StaffUpdateBodyType = z.infer<typeof StaffUpdateBody>
export const StaffDefaultsBody = z.object({ permissions: z.array(z.enum(PERMISSION_KEYS)) })
export type StaffDefaultsBodyType = z.infer<typeof StaffDefaultsBody>

// Settings → Payments & delivery.
export const CheckoutSettingsBody = z.object({
  cod_enabled: z.boolean().optional(),
  cod_max: z.number().min(1).max(10_000_000).nullable().optional(),
  online_enabled: z.boolean().optional(),
  delivery_text: z.string().max(200).optional(),
  order_alert_email: z.union([z.string().email(), z.literal("")]).optional(),
  dispatch_days: z.number().int().min(0).max(60).optional(),
  transit_days: z.number().int().min(1).max(60).optional(),
  dispatch_from: z.string().trim().max(60).optional(),
  returns_text: z.string().trim().max(120).optional(),
  in_carts_enabled: z.boolean().optional(),
  in_carts_min: z.number().int().min(2).max(1000).optional(),
})
export type CheckoutSettingsBodyType = z.infer<typeof CheckoutSettingsBody>

// Settings → SEO & analytics (lib/seo-settings.ts).
export const SeoSettingsBody = z.object({
  ga4_id: z.union([z.string().trim().regex(/^G-[A-Z0-9]{4,16}$/i, "A Google Analytics id looks like G-ABC123XYZ9"), z.literal("")]).optional(),
  meta_pixel_id: z.union([z.string().trim().regex(/^\d{6,20}$/, "A Meta Pixel id is only digits"), z.literal("")]).optional(),
  google_verification: z.union([z.string().trim().regex(/^[\w-]{10,100}$/, "Paste only the code inside content=\"…\""), z.literal("")]).optional(),
  default_description: z.string().trim().max(300).optional(),
})
export type SeoSettingsBodyType = z.infer<typeof SeoSettingsBody>

// The simple product form (lib/product-form.ts).
const BadgeBody = z.object({
  kind: z.enum(["auto", "none", "new", "bestseller", "sale", "custom"]),
  text: z.string().trim().max(24).nullable().optional(),
  colour: z.enum(["black", "red", "yellow", "blue"]).nullable().optional(),
})
const money = z.number().positive().max(10_000_000)
const size = z.number().nonnegative().max(100_000).nullable().optional()
export const ProductFormBody = z.object({
  title: z.string().trim().min(1).max(200),
  handle: z.string().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(["published", "draft"]),
  material_text: z.string().max(200).nullable().optional(),
  age: z.string().max(60).nullable().optional(),
  assembly: z.string().max(200).nullable().optional(),
  care: z.string().max(1500).nullable().optional(),
  lead_time: z.string().max(80).nullable().optional(),
  make_days: z.number().int().min(0).max(120).nullable().optional(),
  engraving: z
    .object({
      enabled: z.boolean(),
      label: z.string().trim().max(60),
      max: z.number().int().min(1).max(200),
      required: z.boolean(),
      fee: z.number().int().min(0).max(100_000).default(0),
    })
    .nullable()
    .optional(),
  seo_title: z.string().max(120).nullable().optional(),
  seo_description: z.string().max(320).nullable().optional(),
  badge: BadgeBody.nullable().optional(),
  length: size,
  width: size,
  height: size,
  weight: size,
  collection_id: z.string().nullable(),
  category_ids: z.array(z.string()).max(50),
  materials: z.array(z.string().trim().min(1).max(60)).max(20),
  colours: z.array(z.object({ name: z.string().trim().min(1).max(60), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).max(30),
  variants: z
    .array(
      z.object({
        colour: z.string().nullable(),
        material: z.string().nullable(),
        price: money,
        stock: z.number().int().min(0).max(1_000_000).nullable(),
      })
    )
    .max(300),
  images: z.array(z.string().url()).max(40),
  colour_images: z.record(z.string(), z.array(z.string().url()).max(40)),
})
export type ProductFormBodyType = z.infer<typeof ProductFormBody>

// Settings → Invoices (lib/invoices.ts).
export const InvoiceSettingsBody = z.object({
  enabled: z.boolean().optional(),
  legal_name: z.string().max(120).optional(),
  brand_line: z.string().max(160).optional(),
  gstin: z.string().max(20).optional(),
  pan: z.string().max(12).optional(),
  address: z.string().max(400).optional(),
  state: z.string().max(60).optional(),
  email: z.string().max(120).optional(),
  phone: z.string().max(30).optional(),
  prefix: z.string().regex(/^[A-Za-z0-9-]{0,10}$/).optional(),
  gst_rate: z.number().min(0).max(28).optional(),
  default_hsn: z.string().regex(/^[0-9]{0,8}$/).optional(),
  signatory: z.string().max(80).optional(),
  footer: z.string().max(400).optional(),
})
export type InvoiceSettingsBodyType = z.infer<typeof InvoiceSettingsBody>

// Website → Menu & footer (lib/site-navigation.ts). Links are site paths ("/shop") or full
// web addresses; never javascript: or other schemes.
const href = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || v.startsWith("/") || /^https?:\/\//i.test(v) || /^mailto:|^tel:/i.test(v), {
    message: "Links must start with / or https://",
  })
const navLink = z.object({ label: z.string().trim().min(1).max(60), href })
const footerLink = navLink.extend({ same_line: z.boolean().optional() })
const social = z.string().trim().max(300).refine((v) => v === "" || /^https:\/\//i.test(v), { message: "Social links must start with https://" })
export const SiteNavigationBody = z.object({
  experience: z.object({ home: z.enum(["shop", "play"]), show_switch: z.boolean() }).optional(),
  menu: z.object({
    categories_label: z.string().trim().min(1).max(40),
    all_label: z.string().trim().min(1).max(40),
    about_label: z.string().trim().min(1).max(40),
    about_links: z.array(navLink).max(10),
    extra_links: z.array(navLink).max(4),
  }),
  footer: z.object({
    tagline: z.string().trim().max(60),
    col1_title: z.string().trim().max(40),
    col1_links: z.array(footerLink).max(12),
    col2_title: z.string().trim().max(40),
    col2_links: z.array(footerLink).max(12),
    socials: z.object({ facebook: social, instagram: social, linkedin: social, youtube: social, whatsapp: social }),
  }),
  announcement: z.object({
    enabled: z.boolean(),
    text: z.string().trim().max(160),
    link_label: z.string().trim().max(40),
    href,
    colour: z.enum(["black", "red", "yellow", "blue"]),
    starts_at: z.string().datetime({ offset: true }).nullable(),
    ends_at: z.string().datetime({ offset: true }).nullable(),
    dismissible: z.boolean(),
  }),
})
export type SiteNavigationBodyType = z.infer<typeof SiteNavigationBody>

export const ShopOrderBody = z.object({
  order: z.array(z.string().min(1).max(100)).max(1000),
  badges: z.record(z.string(), BadgeBody).optional(),
})
export type ShopOrderBodyType = z.infer<typeof ShopOrderBody>

// Contact page (admin → Website → Contact page).
const shortText = (max: number) => z.string().trim().max(max)
export const ContactPageBody = z
  .object({
    title: shortText(80).min(1),
    intro: shortText(600),
    panel_title: shortText(80),
    panel: z
      .array(
        z.object({
          id: z.string().regex(/^[\w-]{1,40}$/),
          type: z.enum(["email", "phone", "whatsapp", "instagram", "hours", "address", "link", "text"]),
          label: shortText(60),
          value: shortText(600),
          button_label: shortText(40),
          message: shortText(300),
        })
      )
      .max(12),
    form_title: shortText(80),
    submit_label: shortText(40).min(1),
    success_title: shortText(80),
    success_text: shortText(400),
    fields: z
      .array(
        z.object({
          id: z.string().regex(/^[\w-]{1,40}$/),
          type: z.enum(["text", "email", "phone", "textarea", "select", "radio", "checkbox", "checkboxes", "date", "number"]),
          label: shortText(120).min(1),
          placeholder: shortText(120),
          help: shortText(200),
          required: z.boolean(),
          options: z.array(shortText(80).min(1)).max(30),
          width: z.enum(["full", "half"]),
        })
      )
      .min(1)
      .max(25),
    notify_email: z.string().trim().email().or(z.literal("")),
    send_copy: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const ids = new Set<string>()
    v.fields.forEach((f, i) => {
      if (ids.has(f.id)) ctx.addIssue({ code: "custom", path: ["fields", i, "id"], message: "Two fields have the same id" })
      ids.add(f.id)
      if (["select", "radio", "checkboxes"].includes(f.type) && f.options.length < 1) {
        ctx.addIssue({ code: "custom", path: ["fields", i, "options"], message: `"${f.label}" needs at least one choice` })
      }
    })
    v.panel.forEach((p, i) => {
      if (p.type === "link" && p.value && !/^(https?:\/\/|\/|mailto:|tel:)/i.test(p.value)) {
        ctx.addIssue({ code: "custom", path: ["panel", i, "value"], message: "Links must start with / or https://" })
      }
      if (p.type === "instagram" && p.value && /^[a-z]+:/i.test(p.value) && !/^https:\/\//i.test(p.value)) {
        ctx.addIssue({ code: "custom", path: ["panel", i, "value"], message: "Instagram must be @name or an https:// link" })
      }
    })
  })
export type ContactPageBodyType = z.infer<typeof ContactPageBody>

export const ContactMessageBody = z.object({
  status: z.enum(["new", "read", "done"]).optional(),
  note: z.string().max(2000).nullable().optional(),
})
export type ContactMessageBodyType = z.infer<typeof ContactMessageBody>

// Website → Chat bot.
export const ChatbotBody = z.object({
  enabled: z.boolean(),
  host: z.string().trim().regex(/^[\w-]{1,80}$/),
  name: shortText(60).min(1),
  greeting: shortText(400).min(1),
  launcher_label: shortText(40),
  placeholder: shortText(80),
  quick: z
    .array(
      z.object({
        id: z.string().regex(/^[\w-]{1,40}$/),
        label: shortText(40).min(1),
        action: z.enum(["track", "products", "human", "ask"]),
        value: shortText(300),
      })
    )
    .max(8),
  faqs: z
    .array(
      z.object({
        id: z.string().regex(/^[\w-]{1,40}$/),
        question: shortText(200).min(1),
        answer: z.string().trim().min(1).max(2000),
        keywords: shortText(300),
      })
    )
    .max(150),
  use_help_pages: z.boolean(),
  whatsapp: z.string().trim().regex(/^[+\d\s()-]{0,20}$/, "Use digits only, e.g. +91 98765 43210"),
  whatsapp_message: shortText(300),
  allow_message: z.boolean(),
  away_text: shortText(300),
  ai_enabled: z.boolean(),
  ai_instructions: z.string().trim().max(1500),
  ai_daily_limit: z.number().int().min(0).max(100000),
  hide_on: z.array(z.string().trim().regex(/^\/[\w\-/]*$/, "Start each with /, e.g. /checkout")).max(20),
})
export type ChatbotBodyType = z.infer<typeof ChatbotBody>
export const ChatbotTestBody = z.object({ text: z.string().trim().min(1).max(800) })

// Shop mailbox (Messages → Email).
export const MailThreadBody = z.object({
  status: z.enum(["new", "read", "done"]).optional(),
  note: z.string().max(2000).nullable().optional(),
})
export type MailThreadBodyType = z.infer<typeof MailThreadBody>

// One action on one or more conversations (from the list, a right-click or the toolbar).
export const MailActionBody = z.object({
  ids: z.array(z.string().min(1).max(600)).min(1).max(200),
  action: z.enum(["read", "unread", "done", "inbox", "star", "unstar", "delete"]),
})
export type MailActionBodyType = z.infer<typeof MailActionBody>

const mailAddress = z.string().trim().toLowerCase().email().max(200)
export const MailSendBody = z.object({
  to: z.array(mailAddress).min(1).max(20),
  cc: z.array(mailAddress).max(20).optional(),
  subject: z.string().trim().min(1).max(300),
  text: z.string().min(1).max(50_000),
  reply_to_id: z.string().max(100).nullable().optional(),
  forward_id: z.string().max(100).nullable().optional(),
  forward_attachments: z.array(z.number().int().min(0).max(200)).max(20).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().trim().min(1).max(150),
        content_type: z.string().max(150),
        data: z.string().max(14_000_000),
      })
    )
    .max(10)
    .optional(),
})
export type MailSendBodyType = z.infer<typeof MailSendBody>

// Tournaments (lib/tournaments.ts).
const handleText = z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes")
const longText = z.string().max(20000)
const optionalInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable().optional()
export const TournamentBody = z
  .object({
    title: z.string().trim().min(1).max(160),
    handle: handleText,
    summary: z.string().trim().max(300).nullable().optional(),
    description: longText.optional(),
    format: z.enum(["arena", "swiss", "round_robin", "knockout"]).optional(),
    mode: z.enum(["online", "offline"]).optional(),
    time_control: z.string().trim().min(1).max(40).optional(),
    rounds: optionalInt(1, 50),
    starts_at: z.coerce.date(),
    ends_at: z.coerce.date().nullable().optional(),
    registration_closes_at: z.coerce.date().nullable().optional(),
    venue: z.string().trim().max(400).nullable().optional(),
    capacity: optionalInt(1, 100000),
    entry_fee: z.number().int().min(0).max(1_000_000).optional(),
    rating_min: optionalInt(0, 3500),
    rating_max: optionalInt(0, 3500),
    prizes: longText.nullable().optional(),
    rules: longText.nullable().optional(),
    image_url: z.string().url().max(2000).nullable().optional(),
    status: z.enum(["draft", "published", "cancelled", "completed"]).optional(),
  })
  .strict()
export const UpdateTournamentBody = TournamentBody.partial().strict()
export type TournamentBodyType = z.infer<typeof TournamentBody>
export type UpdateTournamentBodyType = z.infer<typeof UpdateTournamentBody>

export const RegistrationStatusBody = z.object({ status: z.enum(["confirmed", "cancelled"]) }).strict()
export type RegistrationStatusBodyType = z.infer<typeof RegistrationStatusBody>

export const CheckInBody = z.object({ code: z.string().trim().min(6).max(20), undo: z.boolean().optional() }).strict()
export type CheckInBodyType = z.infer<typeof CheckInBody>

export const TournamentRegisterBody = z
  .object({
    player_name: z.string().trim().min(2).max(120),
    phone: z.string().trim().regex(/^[0-9+\- ]{7,20}$/, "Please enter a valid phone number").nullable().optional(),
    fide_id: z.string().trim().regex(/^[0-9]{3,12}$/, "A FIDE ID is numbers only").nullable().optional(),
    rating: z.number().int().min(0).max(3500).nullable().optional(),
    city: z.string().trim().max(80).nullable().optional(),
  })
  .strict()
export type TournamentRegisterBodyType = z.infer<typeof TournamentRegisterBody>

// Play → Fair play: the decision on a flagged player.
export const FairPlayDecisionBody = z.object({
  action: z.enum(["clear", "warn", "ban", "unban"]),
  scope: z.enum(["rated", "all"]).optional(),
  note: z.string().trim().max(500).optional(),
})
export type FairPlayDecisionBodyType = z.infer<typeof FairPlayDecisionBody>

// POST /store/carts/:id/personalised-items (workflows/personalised-item.ts).
export const PersonalisedItemBody = z.object({
  variant_id: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(20),
  text: z.string().max(400),
})
export type PersonalisedItemBodyType = z.infer<typeof PersonalisedItemBody>

// ---------------------------------------------------------------- Marketing & integrations

const MARKETING_EVENTS = ["PageView", "ViewContent", "Search", "AddToCart", "RemoveFromCart", "ViewCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "CompleteRegistration", "Lead", "Refund", "AbandonedCart", "OrderShipped", "Subscribe"] as const
const BROWSER_MARKETING_EVENTS = ["PageView", "ViewContent", "Search", "AddToCart", "RemoveFromCart", "ViewCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead"] as const
const MARKETING_PLATFORMS = [
  "meta_pixel",
  "meta_capi",
  "ga4",
  "ga4_mp",
  "google_ads",
  "gtm",
  "clarity",
  "pinterest_tag",
  "pinterest_capi",
  "snap_pixel",
  "snap_capi",
  "uet",
  "uet_capi",
  "linkedin_tag",
  "linkedin_capi",
  "whatsapp",
  "brevo",
  "mailchimp",
  "klaviyo",
] as const
const BROWSER_PLATFORMS = ["meta_pixel", "ga4", "google_ads", "gtm", "clarity", "pinterest_tag", "snap_pixel", "uet", "linkedin_tag"] as const
const mText = (max: number) => z.string().max(max)

// Events from the website (POST /store/marketing/events).
export const CollectBody = z.object({
  consent: z.object({ analytics: z.boolean(), marketing: z.boolean() }),
  visitor: z
    .object({
      fbp: mText(120).regex(/^fb\.\d\.\d+\.\d+$/).nullable().optional(),
      fbc: mText(500).regex(/^fb\.\d\.\d+\.[\w.-]+$/).nullable().optional(),
      ga: mText(80).regex(/^GA\d\.\d\.\d+\.\d+$/).nullable().optional(),
      page_url: mText(1000).url().nullable().optional(),
      ids: z
        .object({
          li_fat_id: mText(300).regex(/^[\w.:-]+$/),
          scid: mText(300).regex(/^[\w.:-]+$/),
          sc_click_id: mText(300).regex(/^[\w.:-]+$/),
          msclkid: mText(300).regex(/^[\w.:-]+$/),
          epik: mText(300).regex(/^[\w.:-]+$/),
        })
        .partial()
        .nullable()
        .optional(),
    })
    .default({}),
  utm: z
    .object({ utm_source: mText(200), utm_medium: mText(200), utm_campaign: mText(200), utm_term: mText(200), utm_content: mText(200), gclid: mText(200), fbclid: mText(200) })
    .partial()
    .nullable()
    .optional(),
  events: z
    .array(
      z.object({
        event_id: z.string().regex(/^[\w.:-]{8,120}$/),
        name: z.enum(BROWSER_MARKETING_EVENTS),
        page: mText(1000).nullable().optional(),
        sent: z.array(z.enum(BROWSER_PLATFORMS)).max(9).default([]),
        data: z
          .object({
            value: z.number().min(0).max(10_000_000).nullable().optional(),
            currency: z.string().regex(/^[A-Za-z]{3}$/).nullable().optional(),
            search: mText(100).nullable().optional(),
            cart_id: z.string().regex(/^cart_[A-Z0-9]+$/).nullable().optional(),
            items: z
              .array(
                z.object({
                  product_id: z.string().regex(/^prod_[A-Z0-9]+$/),
                  variant_id: z.string().regex(/^variant_[A-Z0-9]+$/).nullable().optional(),
                  sku: mText(120).nullable().optional(),
                  name: mText(200).nullable().optional(),
                  variant: mText(200).nullable().optional(),
                  category: mText(120).nullable().optional(),
                  price: z.number().min(0).max(10_000_000).nullable().optional(),
                  quantity: z.number().int().min(1).max(1000).nullable().optional(),
                })
              )
              .max(50)
              .optional(),
          })
          .default({}),
      })
    )
    .min(1)
    .max(20),
})
export type CollectBodyType = z.infer<typeof CollectBody>

// The website's report of a tag test (POST /store/marketing/check).
export const TagCheckBody = z.object({
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
  results: z
    .object({ meta_pixel: z.object({ ok: z.boolean(), detail: mText(300).optional() }), ga4: z.object({ ok: z.boolean(), detail: mText(300).optional() }), google_ads: z.object({ ok: z.boolean(), detail: mText(300).optional() }), gtm: z.object({ ok: z.boolean(), detail: mText(300).optional() }), clarity: z.object({ ok: z.boolean(), detail: mText(300).optional() }), pinterest: z.object({ ok: z.boolean(), detail: mText(300).optional() }), snapchat: z.object({ ok: z.boolean(), detail: mText(300).optional() }), microsoft_ads: z.object({ ok: z.boolean(), detail: mText(300).optional() }), linkedin: z.object({ ok: z.boolean(), detail: mText(300).optional() }) })
    .partial(),
})
export type TagCheckBodyType = z.infer<typeof TagCheckBody>

const optId = (re: RegExp) => z.union([z.literal(""), z.string().regex(re)])

export const MarketingSettingsBody = z.object({
  consent: z
    .object({
      mode: z.enum(["ask", "notice"]),
      text: mText(400),
      policy_url: mText(300),
    })
    .partial()
    .optional(),
  meta_pixel: z.object({ enabled: z.boolean(), pixel_id: optId(/^\d{10,20}$/) }).partial().optional(),
  meta_capi: z.object({ enabled: z.boolean(), test_event_code: optId(/^TEST\d{3,10}$/), advanced_matching: z.boolean() }).partial().optional(),
  ga4: z.object({ enabled: z.boolean(), measurement_id: optId(/^G-[A-Z0-9]{4,16}$/), server_enabled: z.boolean() }).partial().optional(),
  google_ads: z
    .object({
      enabled: z.boolean(),
      conversion_id: optId(/^AW-\d{6,14}$/),
      purchase_label: optId(/^[\w-]{6,40}$/),
      lead_label: optId(/^[\w-]{6,40}$/),
      enhanced_conversions: z.boolean(),
    })
    .partial()
    .optional(),
  gtm: z.object({ enabled: z.boolean(), container_id: optId(/^GTM-[A-Z0-9]{4,12}$/) }).partial().optional(),
  clarity: z.object({ enabled: z.boolean(), project_id: optId(/^[a-z0-9]{6,20}$/) }).partial().optional(),
  pinterest: z
    .object({ enabled: z.boolean(), tag_id: optId(/^\d{10,16}$/), capi_enabled: z.boolean(), ad_account_id: optId(/^\d{8,20}$/), test_mode: z.boolean() })
    .partial()
    .optional(),
  snapchat: z
    .object({ enabled: z.boolean(), pixel_id: optId(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/), capi_enabled: z.boolean() })
    .partial()
    .optional(),
  microsoft_ads: z.object({ enabled: z.boolean(), tag_id: optId(/^\d{5,12}$/), capi_enabled: z.boolean() }).partial().optional(),
  linkedin: z
    .object({
      enabled: z.boolean(),
      partner_id: optId(/^\d{4,12}$/),
      purchase_conversion_id: optId(/^\d{4,14}$/),
      lead_conversion_id: optId(/^\d{4,14}$/),
      capi_enabled: z.boolean(),
      ad_account_id: optId(/^\d{6,14}$/),
    })
    .partial()
    .optional(),
  whatsapp: z
    .object({
      enabled: z.boolean(),
      phone_number_id: optId(/^\d{10,20}$/),
      language: z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/),
      template_order: optId(/^[a-z0-9_]{1,512}$/),
      template_shipped: optId(/^[a-z0-9_]{1,512}$/),
      template_abandoned: optId(/^[a-z0-9_]{1,512}$/),
      test_number: optId(/^\+?\d{10,15}$/),
    })
    .partial()
    .optional(),
  brevo: z.object({ enabled: z.boolean(), list_id: optId(/^\d{1,10}$/) }).partial().optional(),
  mailchimp: z.object({ enabled: z.boolean(), audience_id: optId(/^[a-z0-9]{6,20}$/) }).partial().optional(),
  klaviyo: z.object({ enabled: z.boolean(), list_id: optId(/^[A-Za-z0-9]{6,12}$/) }).partial().optional(),
  automation: z.object({ abandoned_enabled: z.boolean(), abandoned_after_hours: z.number().int().min(1).max(48) }).partial().optional(),
  content_id: z.enum(["variant", "product", "sku"]).optional(),
  excluded: z
    .object(Object.fromEntries(MARKETING_PLATFORMS.map((p) => [p, z.array(z.enum(MARKETING_EVENTS))])) as { [K in (typeof MARKETING_PLATFORMS)[number]]: z.ZodArray<z.ZodEnum<{ [E in (typeof MARKETING_EVENTS)[number]]: E }>> })
    .partial()
    .optional(),
  retention_days: z.number().int().min(7).max(400).optional(),
})
export type MarketingSettingsBodyType = z.infer<typeof MarketingSettingsBody>

export const MarketingTestBody = z.object({
  integration: z.enum(["meta_pixel", "meta_capi", "ga4", "google_ads", "gtm", "clarity", "pinterest", "snapchat", "microsoft_ads", "linkedin", "whatsapp", "brevo", "mailchimp", "klaviyo"]),
})
export type MarketingTestBodyType = z.infer<typeof MarketingTestBody>

export const MarketingRetryBody = z.object({
  ids: z.array(z.string().regex(/^mdl_[A-Z0-9]+$/)).max(500).optional(),
  all_failed: z.boolean().optional(),
})
export type MarketingRetryBodyType = z.infer<typeof MarketingRetryBody>

export const MarketingDeleteBody = z
  .object({
    order_id: z.string().regex(/^order_[A-Z0-9]+$/).optional(),
    email: z.string().email().max(200).optional(),
  })
  .refine((b) => !!b.order_id || !!b.email, { message: "Give an order ID or an email address." })
export type MarketingDeleteBodyType = z.infer<typeof MarketingDeleteBody>

// A webhook endpoint (Settings → Marketing & integrations → Webhooks).
export const WebhookBody = z.object({
  url: z
    .string()
    .url()
    .max(500)
    .refine((u) => u.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u), { message: "Use an https:// address." }),
  events: z.array(z.enum(MARKETING_EVENTS)).min(1),
  enabled: z.boolean().optional(),
})
export type WebhookBodyType = z.infer<typeof WebhookBody>
export const WebhookUpdateBody = WebhookBody.partial()
export type WebhookUpdateBodyType = z.infer<typeof WebhookUpdateBody>
