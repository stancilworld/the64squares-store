import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, QueryContext } from "@medusajs/framework/utils"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"
import { loadCheckoutSettings } from "./checkout-settings"
import { loadContactPage } from "./contact-page"
import { getServiceKeys } from "./service-keys"

// The website's chat bot (admin → Website → Chat bot).
//
// How it answers, cheapest first:
// 1. Its own rules, free and instant: hello, "track my order", "talk to a person", the
//    questions written in the admin, the questions on the Help pages (each "## " heading
//    is a question), and product search.
// 2. When none of those fit well, an AI on a free plan (Groq, then Google Gemini as a
//    spare) answers in its own words, using only the facts above. Names, emails, phone
//    numbers and order numbers are never sent to it.
// 3. If the AI isn't set up, is switched off or has used up its free allowance for the
//    day, the bot says so kindly and offers WhatsApp or a message to the team.

export const CHATBOT_KEY = "chatbot"

export const QUICK_ACTIONS = ["track", "products", "human", "ask"] as const
export type QuickReply = { id: string; label: string; action: (typeof QUICK_ACTIONS)[number]; value: string }
export type Faq = { id: string; question: string; answer: string; keywords: string }

export type Chatbot = {
  enabled: boolean
  name: string
  greeting: string
  launcher_label: string
  placeholder: string
  quick: QuickReply[]
  faqs: Faq[]
  use_help_pages: boolean
  whatsapp: string
  whatsapp_message: string
  allow_message: boolean
  away_text: string
  ai_enabled: boolean
  ai_instructions: string
  ai_daily_limit: number
  hide_on: string[]
}

export const DEFAULT_CHATBOT: Chatbot = {
  enabled: false,
  name: "The 64 Squares Helper",
  greeting: "Hi! I'm The 64 Squares' chess helper. Ask me about our chess sets, boards, tournaments, delivery or your order.",
  launcher_label: "Need help?",
  placeholder: "Type your question…",
  quick: [
    { id: "q_track", label: "Track my order", action: "track", value: "" },
    { id: "q_find", label: "Find a chess set", action: "products", value: "What are you looking for? A chess set, a board, pieces or a clock?" },
    { id: "q_delivery", label: "Delivery", action: "ask", value: "How long does delivery take?" },
    { id: "q_human", label: "Talk to us", action: "human", value: "" },
  ],
  faqs: [
    {
      id: "f_delivery_time",
      question: "How long does delivery take?",
      answer: "{delivery} You can see the delivery date for your pincode on every product page. More on [Delivery](/help/delivery).",
      keywords: "delivery time days when arrive shipping dispatch how long",
    },
  ],
  use_help_pages: true,
  whatsapp: "",
  whatsapp_message: "Hi The 64 Squares! I have a question.",
  allow_message: true,
  away_text: "Leave your question and we'll reply by email, usually within one working day.",
  ai_enabled: true,
  ai_instructions: "",
  ai_daily_limit: 400,
  hide_on: ["/checkout"],
}

export const resolveChatbot = (stored: Record<string, unknown> | null | undefined): Chatbot => ({
  ...DEFAULT_CHATBOT,
  ...((stored ?? {}) as Partial<Chatbot>),
})

const content = (c: MedusaContainer): ContentModuleService => c.resolve(CONTENT_MODULE)

export const loadChatbot = async (c: MedusaContainer) => resolveChatbot(await content(c).getSettingValue(CHATBOT_KEY))

// The WhatsApp number: the bot's own, else the one on the Contact page.
const whatsappOf = async (c: MedusaContainer, bot: Chatbot) => {
  if (bot.whatsapp.trim()) return bot.whatsapp.trim()
  const page = await loadContactPage(c)
  return page.panel.find((p) => p.type === "whatsapp")?.value?.trim() || ""
}

// What the website gets: the look and the buttons (not the answers or the AI settings).
export const publicChatbot = async (c: MedusaContainer) => {
  const bot = await loadChatbot(c)
  return {
    enabled: bot.enabled,
    name: bot.name,
    greeting: bot.greeting,
    launcher_label: bot.launcher_label,
    placeholder: bot.placeholder,
    quick: bot.quick,
    whatsapp: await whatsappOf(c, bot),
    whatsapp_message: bot.whatsapp_message,
    allow_message: bot.allow_message,
    away_text: bot.away_text,
    hide_on: bot.hide_on,
  }
}

// ------------------------------------------------------------------ words

const STOP = new Set(
  "a an the is are am was were be been do does did i im i'm you your yours we our ours us my me mine to for of in on at by with and or but if so it its it's this that these those there here can could would will shall should may might how what when where which who whom why please pls plz hi hello hey thanks thank kindly tell know want need get got have has had any some about from into just also than then too very much many more most one".split(
    " "
  )
)
// Words that mean the same thing for matching.
const SAME: Record<string, string> = {
  shipping: "deliver", ship: "deliver", shipped: "deliver", dispatch: "deliver", courier: "deliver", delivery: "deliver", delivered: "deliver", arrive: "deliver",
  refund: "return", exchange: "return", replace: "return", replacement: "return", returns: "return", returning: "return",
  assembly: "assemble", install: "assemble", installation: "assemble", setup: "assemble", fitting: "assemble", assembled: "assemble",
  payment: "pay", paying: "pay", cod: "cash", upi: "pay", card: "pay", emi: "pay",
  cost: "price", rate: "price", prices: "price", costs: "price", charges: "charge", charged: "charge", fee: "charge",
  guarantee: "warranty", warrantee: "warranty",
  colour: "color", colours: "color", colors: "color",
  kid: "child", kids: "child", children: "child", baby: "child", toddler: "child",
  wardrobe: "storage", cupboard: "storage", shelf: "storage", shelves: "storage", rack: "storage", cabinet: "storage",
  study: "desk", table: "desk", tables: "desk", desks: "desk",
  chairs: "chair", stool: "chair", stools: "chair", seat: "chair",
  beds: "bed", bunk: "bed", crib: "bed", cot: "bed",
  bill: "invoice", gst: "invoice",
}
const stem = (w: string) => {
  if (SAME[w]) return SAME[w]
  let x = w
  if (x.length > 5 && x.endsWith("ing")) x = x.slice(0, -3)
  else if (x.length > 4 && x.endsWith("ies")) x = `${x.slice(0, -3)}y`
  else if (x.length > 4 && x.endsWith("es") && !x.endsWith("ses")) x = x.slice(0, -2)
  else if (x.length > 3 && x.endsWith("s") && !x.endsWith("ss")) x = x.slice(0, -1)
  return SAME[x] ?? x
}
export const words = (text: string) =>
  [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w)))
        .map(stem)
    ),
  ]

const overlap = (q: string[], doc: string[], weightOf?: (w: string) => number) => {
  if (!q.length || !doc.length) return 0
  const d = new Set(doc)
  let hit = 0
  for (const w of q) if (d.has(w)) hit += weightOf ? weightOf(w) : 1
  return hit / Math.sqrt(q.length * Math.min(doc.length, 12))
}

// ------------------------------------------------------------------ knowledge

// qWords: the question (and extra words) — what it's about. words: everything, answer too.
type Known = { id: string; question: string; answer: string; qWords: string[]; words: string[]; source: "faq" | "help"; link?: string }
type Product = { handle: string; title: string; price: number | null; text: string; words: string[]; titleWords: string[]; categories: string[] }
type Knowledge = { at: number; faqs: Known[]; products: Product[]; delivery: string; pages: { title: string; href: string }[] }

let cache: Knowledge | null = null
export const clearChatbotCache = () => {
  cache = null
}

const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n)

// Help pages: each "## " heading with the text under it is one question and answer.
const helpSections = (handle: string, title: string, body: string): Known[] => {
  const out: Known[] = []
  const parts = body.split(/^##\s+/m)
  parts.forEach((part, i) => {
    if (i === 0 && !body.trimStart().startsWith("##")) return
    const [head, ...rest] = part.split("\n")
    const answer = rest
      .join("\n")
      .split("\n")
      .filter((l) => !/^\s*\*[^*].*(admin|draft).*\*\s*$/i.test(l))
      .join("\n")
      .trim()
    if (!head.trim() || !answer) return
    out.push({
      id: `help:${handle}:${i}`,
      question: head.trim(),
      answer: `${answer}\n\nMore on [${title}](/help/${handle}).`,
      qWords: words(head),
      words: words(`${head} ${answer.slice(0, 400)} ${title}`),
      source: "help",
      link: `/help/${handle}`,
    })
  })
  return out
}

const loadProducts = async (c: MedusaContainer): Promise<Product[]> => {
  const query = c.resolve(ContainerRegistrationKeys.QUERY)
  const regions = await c.resolve(Modules.REGION).listRegions({}, { take: 10 })
  const region = regions.find((r) => r.currency_code === "inr") ?? regions[0]
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "title",
      "handle",
      "subtitle",
      "description",
      "status",
      "categories.name",
      "variants.options.value",
      "variants.calculated_price.calculated_amount",
    ],
    filters: { status: "published" },
    pagination: { take: 300 },
    ...(region
      ? { context: { variants: { calculated_price: QueryContext({ region_id: region.id, currency_code: region.currency_code }) } } }
      : {}),
  })
  return (data as Record<string, any>[]).map((p) => {
    const prices = (p.variants ?? []).map((v: any) => v?.calculated_price?.calculated_amount).filter((n: unknown): n is number => typeof n === "number")
    const options = [...new Set((p.variants ?? []).flatMap((v: any) => (v?.options ?? []).map((o: any) => o?.value)).filter(Boolean))] as string[]
    const categories = (p.categories ?? []).map((x: any) => x?.name).filter(Boolean) as string[]
    const description = String(p.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    return {
      handle: p.handle,
      title: p.title,
      price: prices.length ? Math.min(...prices) : null,
      categories,
      text: [p.subtitle, description.slice(0, 220), categories.length ? `Type: ${categories.join(", ")}` : "", options.length ? `Options: ${options.slice(0, 8).join(", ")}` : ""]
        .filter(Boolean)
        .join(". "),
      titleWords: words(p.title),
      words: words(`${p.title} ${p.subtitle ?? ""} ${categories.join(" ")} ${options.join(" ")} ${description.slice(0, 400)}`),
    }
  })
}

export const loadKnowledge = async (c: MedusaContainer, bot: Chatbot): Promise<Knowledge> => {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache
  const svc = content(c)
  const [settings, pages, products] = await Promise.all([
    loadCheckoutSettings(c),
    svc.listPages({ is_published: true } as never, { order: { rank: "ASC" }, take: 50 }),
    loadProducts(c).catch(() => [] as Product[]),
  ])
  const delivery = settings.delivery_text || ""
  const own: Known[] = bot.faqs
    .filter((f) => f.question.trim() && f.answer.trim())
    .map((f) => {
      const answer = f.answer.replace(/\{delivery\}/g, delivery).trim()
      return { id: f.id, question: f.question, answer, qWords: words(`${f.question} ${f.keywords}`), words: words(`${f.question} ${f.keywords} ${answer}`), source: "faq" as const }
    })
  const help = bot.use_help_pages
    ? pages.filter((p) => !["privacy", "terms", "contact"].includes(p.handle)).flatMap((p) => helpSections(p.handle, p.title, p.body || ""))
    : []
  cache = {
    at: Date.now(),
    faqs: [...own, ...help],
    products,
    delivery,
    pages: pages.map((p) => ({ title: p.title, href: `/help/${p.handle}` })),
  }
  return cache
}

// ------------------------------------------------------------------ answering

export type Turn = { role: "user" | "bot"; text: string }
export type Reply = {
  text: string
  source: "greeting" | "faq" | "help" | "products" | "track" | "human" | "ai" | "fallback" | "thanks"
  products?: string[]
  actions?: ("track" | "human")[]
}

const PRODUCT_WORDS = new Set(["chess", "board", "pieces", "piece", "clock", "staunton", "wooden", "magnetic", "travel", "book", "box", "table", "show", "buy", "recommend", "suggest", "gift", "room", "price", "color", "set", "range", "collection"])

// How well a question fits: mostly "are the shopper's words in the question?", a little
// "are they in the answer?", and a little "is that most of what the question is about?".
const faqScore = (q: string[], f: Known) => {
  if (!q.length) return 0
  const inQ = new Set(f.qWords)
  const inAll = new Set(f.words)
  let hitQ = 0
  let hitA = 0
  for (const w of q) {
    if (inQ.has(w)) hitQ++
    else if (inAll.has(w)) hitA++
  }
  const coverage = (hitQ + 0.5 * hitA) / q.length
  const precision = hitQ / Math.max(f.qWords.length, 1)
  return 0.7 * coverage + 0.3 * precision
}
const rankFaqs = (k: Knowledge, q: string[]) =>
  k.faqs
    .map((f) => ({ f, score: faqScore(q, f) * (f.source === "faq" ? 1.05 : 1) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

const rankProducts = (k: Knowledge, q: string[]) =>
  k.products
    .map((p) => {
      const title = new Set(p.titleWords)
      return { p, score: overlap(q, p.words, (w) => (title.has(w) ? 2 : 1)) }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

// Never sent to an AI: email addresses, phone numbers, order numbers, long digit runs.
export const redact = (t: string) =>
  t
    .replace(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/g, "[email]")
    .replace(/(?:\+?\d[\d\s-]{7,}\d)/g, "[number]")
    .replace(/#\s?\d{1,8}\b/g, "[order]")

// ---- the AI (free plans)

type Provider = { provider: "groq" | "gemini"; key: string; model: string }
const usage = { day: "", count: 0, pausedUntil: 0 }
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10) // India's date
const aiAllowed = (limit: number) => {
  if (usage.day !== today()) {
    usage.day = today()
    usage.count = 0
  }
  return usage.count < limit && Date.now() > usage.pausedUntil
}
export const aiUsageToday = () => (usage.day === today() ? usage.count : 0)

const callProvider = async (p: Provider, system: string, history: Turn[], question: string) => {
  const signal = AbortSignal.timeout(15_000)
  if (p.provider === "groq") {
    const base = (process.env.GROQ_API_BASE || "https://api.groq.com").replace(/\/$/, "")
    const r = await fetch(`${base}/openai/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
      body: JSON.stringify({
        model: p.model,
        temperature: 0.3,
        max_tokens: 450,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          ...history.map((t) => ({ role: t.role === "user" ? "user" : "assistant", content: t.text })),
          { role: "user", content: question },
        ],
      }),
      signal,
    })
    if (!r.ok) throw Object.assign(new Error(`Groq ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`), { status: r.status })
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] }
    return j.choices?.[0]?.message?.content ?? ""
  }
  const base = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com").replace(/\/$/, "")
  const r = await fetch(`${base}/v1beta/models/${encodeURIComponent(p.model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": p.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        ...history.map((t) => ({ role: t.role === "user" ? "user" : "model", parts: [{ text: t.text }] })),
        { role: "user", parts: [{ text: question }] },
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 450, responseMimeType: "application/json" },
    }),
    signal,
  })
  if (!r.ok) throw Object.assign(new Error(`Gemini ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`), { status: r.status })
  const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return j.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? ""
}

const systemPrompt = (bot: Chatbot, k: Knowledge, faqs: Known[], products: Product[], contact: string) =>
  [
    `You are "${bot.name}", the friendly helper on the website of The 64 Squares (the64squares.in), an Indian brand that makes premium chess sets, boards, pieces and clocks, and runs online chess tournaments.`,
    "Answer in short, warm, simple sentences (at most 80 words). If the shopper writes in Hindi or Hinglish, answer the same way.",
    "Use ONLY the facts below. If the answer isn't in them, say you're not sure and offer to connect them with the team. Never make up prices, dates, discounts, stock, sizes or policies.",
    "Never ask for personal details. For the status of an order, tell them to press 'Track my order'. For anything you can't solve, set handover to true.",
    "You may use links like [Delivery](/help/delivery) from the facts.",
    'Reply ONLY as JSON: {"reply": "your answer", "products": ["handles of up to 4 products from the list that fit, else empty"], "handover": false}',
    bot.ai_instructions.trim() ? `Extra notes from the shop: ${bot.ai_instructions.trim()}` : "",
    "",
    "FACTS",
    k.delivery ? `Delivery: ${k.delivery}` : "",
    contact,
    ...faqs.map((f) => `Q: ${f.question}\nA: ${f.answer.replace(/\n+/g, " ").slice(0, 400)}`),
    products.length ? "PRODUCTS (handle | name | price from | about)" : "",
    ...products.map((p) => `${p.handle} | ${p.title} | ${p.price != null ? money(p.price) : "see page"} | ${p.text.slice(0, 180)}`),
    k.pages.length ? `Help pages: ${k.pages.map((p) => `[${p.title}](${p.href})`).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")

const parseAi = (raw: string, k: Knowledge) => {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")
  try {
    const j = JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1)) as { reply?: unknown; products?: unknown; handover?: unknown }
    const handles = new Set(k.products.map((p) => p.handle))
    return {
      text: String(j.reply ?? "").trim(),
      products: (Array.isArray(j.products) ? j.products : []).map(String).filter((h) => handles.has(h)).slice(0, 4),
      handover: j.handover === true,
    }
  } catch {
    return { text: cleaned.replace(/[{}"]/g, "").trim(), products: [], handover: false }
  }
}

export const askAi = async (c: MedusaContainer, bot: Chatbot, k: Knowledge, history: Turn[], question: string, opts: { force?: boolean } = {}) => {
  const providers = (await getServiceKeys(c)).ai
  if (!providers.length) return { ok: false as const, reason: "no-keys" as const }
  if (!opts.force && !aiAllowed(bot.ai_daily_limit)) return { ok: false as const, reason: "limit" as const }
  const q = words(question)
  // The closest answers first, then the rest, up to 12 (kept short to fit free plans).
  const close = rankFaqs(k, q).slice(0, 6).map((x) => x.f)
  const faqs = [...close, ...k.faqs.filter((f) => !close.includes(f))].slice(0, 12)
  const ranked = rankProducts(k, q).slice(0, 8).map((x) => x.p)
  const products = ranked.length >= 4 ? ranked : [...ranked, ...k.products.filter((p) => !ranked.includes(p)).slice(0, 8 - ranked.length)]
  const page = await loadContactPage(c)
  const hours = page.panel.find((p) => p.type === "hours")?.value
  const contact = [`Team email: ${page.panel.find((p) => p.type === "email")?.value || "hello@the64squares.in"}`, hours ? `Team hours: ${hours.replace(/\n/g, "; ")}` : ""].filter(Boolean).join("\n")
  const system = systemPrompt(bot, k, faqs, products, contact)
  const past = history.slice(-6).map((t) => ({ role: t.role, text: redact(t.text).slice(0, 600) }))
  const logger = c.resolve(ContainerRegistrationKeys.LOGGER)
  for (const p of providers) {
    try {
      const raw = await callProvider(p, system, past, redact(question).slice(0, 800))
      const parsed = parseAi(raw, k)
      if (!parsed.text) continue
      usage.count++
      return { ok: true as const, provider: p.provider, ...parsed }
    } catch (e) {
      const status = (e as { status?: number }).status
      logger.warn(`Chat bot: ${p.provider} didn't answer (${(e as Error).message.slice(0, 160)})`)
      // Free allowance used up for now: give the AI a rest before trying again.
      if (status === 429 && p === providers[providers.length - 1]) usage.pausedUntil = Date.now() + 10 * 60_000
    }
  }
  return { ok: false as const, reason: "failed" as const }
}

// One answer to one message.
export const answer = async (c: MedusaContainer, text: string, history: Turn[], botIn?: Chatbot): Promise<Reply> => {
  const bot = botIn ?? (await loadChatbot(c))
  const k = await loadKnowledge(c, bot)
  const t = text.trim()
  const lower = t.toLowerCase()
  const q = words(t)

  if (/^(hi+|hello+|hey+|hii+|namaste|namaskar|good (morning|afternoon|evening))[\s!.]*$/i.test(t)) {
    return { text: "Hello! How can I help? You can ask me anything, or pick one of the buttons below.", source: "greeting" }
  }
  if (/^(thanks|thank you|thank u|thx|ty|ok(ay)?|great|cool|done|got it|dhanyavad|shukriya)[\s!.]*$/i.test(t)) {
    return { text: "You're welcome! Anything else I can help with?", source: "thanks" }
  }
  if (/\b(cancel|change|modify|edit|update)\b.*\border\b|\border\b.*\b(cancel|change|modify)/i.test(lower)) {
    return { text: "Our team can change or cancel an order for you. Chat with us on WhatsApp or leave a message, and include your order number.", source: "human", actions: ["human"] }
  }
  if (/\b(track|tracking|where('| i)?s my|order status|status of my order|my order|not (yet )?(received|delivered)|awb)\b/i.test(lower) || /#\s?\d{2,8}\b/.test(t)) {
    return { text: "I can check that for you. Enter your order number and the email or phone number you ordered with.", source: "track", actions: ["track"] }
  }
  if (/\b(human|person|someone|agent|executive|team|talk to|speak to|call me|call back|customer care|support|complain|complaint|whatsapp)\b/i.test(lower)) {
    return { text: "Of course! You can chat with our team on WhatsApp, or leave a message and we'll reply by email.", source: "human", actions: ["human"] }
  }

  const faqs = rankFaqs(k, q)
  const products = rankProducts(k, q)
  const bestFaq = faqs[0]
  const productAsk = q.some((w) => PRODUCT_WORDS.has(w)) || (products[0]?.score ?? 0) >= 0.9
  const strongFaq = bestFaq && bestFaq.score >= 0.5 && !(productAsk && (products[0]?.score ?? 0) > bestFaq.score + 0.3)

  if (strongFaq) return { text: bestFaq.f.answer, source: bestFaq.f.source }
  // A clear product search is answered from the shop itself (free).
  if (productAsk && (products[0]?.score ?? 0) >= 0.6) {
    return { text: "Here are some pieces that might fit:", source: "products", products: products.slice(0, 4).map((x) => x.p.handle) }
  }

  // Questions with words of their own go to the AI, which knows the products too.
  if (bot.ai_enabled) {
    const ai = await askAi(c, bot, k, history, t)
    if (ai.ok) return { text: ai.text, source: "ai", products: ai.products, actions: ai.handover ? ["human"] : undefined }
  }
  if (productAsk && products.length) {
    return { text: "Here are some pieces that might fit:", source: "products", products: products.slice(0, 4).map((x) => x.p.handle) }
  }
  if (bestFaq && bestFaq.score >= 0.3) return { text: bestFaq.f.answer, source: bestFaq.f.source }
  return {
    text: "Sorry, I'm not sure about that one. Our team can help: chat on WhatsApp or leave a message, and we'll get back to you.",
    source: "fallback",
    actions: ["human"],
  }
}

// ------------------------------------------------------------------ chat log

export const logTurn = async (
  c: MedusaContainer,
  key: string,
  turns: { role: "user" | "bot"; text: string; source?: string }[],
  extra: { page?: string | null; ip?: string | null; ai?: boolean; handed_over?: boolean } = {}
) => {
  const svc = content(c)
  const now = new Date()
  const stamped = turns.map((t) => ({ ...t, text: t.text.slice(0, 2000), at: now.toISOString() }))
  const [existing] = await svc.listChatSessions({ session_key: key } as never, { take: 1, order: { last_at: "DESC" } })
  if (existing) {
    const messages = [...((existing.messages as unknown as unknown[]) ?? []), ...stamped].slice(-200)
    await svc.updateChatSessions({
      id: existing.id,
      messages,
      last_at: now,
      ai_count: (existing.ai_count ?? 0) + (extra.ai ? 1 : 0),
      handed_over: existing.handed_over || !!extra.handed_over,
      ...(extra.page ? { page: extra.page.slice(0, 300) } : {}),
    } as never)
    return existing.id as string
  }
  const created = await svc.createChatSessions({
    session_key: key,
    messages: stamped,
    page: extra.page?.slice(0, 300) ?? null,
    ip: extra.ip?.slice(0, 64) ?? null,
    ai_count: extra.ai ? 1 : 0,
    handed_over: !!extra.handed_over,
    last_at: now,
  } as never)
  return created.id as string
}

// Visitors: a few messages a minute is a person; more is a robot.
const hits = new Map<string, number[]>()
export const allowedChat = (ip: string, limit = 30, windowMs = 5 * 60_000) => {
  const now = Date.now()
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs)
  if (list.length >= limit) return false
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return true
}

// Keys → AI → Test: asks each AI a tiny question.
export const testAiProviders = async (c: MedusaContainer) => {
  const providers = (await getServiceKeys(c)).ai
  if (!providers.length) return { ok: false, message: "Add a Groq or Gemini key first, then Save." }
  const lines: string[] = []
  let ok = false
  for (const p of providers) {
    const name = p.provider === "groq" ? "Groq" : "Gemini"
    try {
      const raw = await callProvider(p, 'Reply ONLY as JSON: {"reply": "ok"}', [], "Say ok.")
      ok = ok || !!raw
      lines.push(`${name} (${p.model}) works.`)
    } catch (e) {
      const status = (e as { status?: number }).status
      lines.push(
        `${name} (${p.model}): ` +
          (status === 401 || status === 403 || status === 400
            ? "the key or model was refused. Check the key, and leave the model empty to use the default."
            : status === 404
              ? "that model doesn't exist any more. Leave the model empty to use the default, or pick a current one."
              : status === 429
                ? "the free allowance is used up for now. It comes back by itself."
                : "didn't answer. Try again in a minute.")
      )
    }
  }
  return { ok, message: lines.join(" ") }
}
