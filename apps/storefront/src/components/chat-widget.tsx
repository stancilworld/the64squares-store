"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { formatPrice } from "@/lib/format"
import type { ChatbotConfig, ChatOrder, ChatProduct, ChatReply } from "@/lib/types"
import { ChatIcon, CloseIcon, SendIcon, WhatsAppIcon } from "./icons"

// The help bubble at the bottom right of every page (admin → Website → Chat bot).
// The chat is kept in this browser for a day, so it carries on from page to page.

type Msg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "bot"; text: string; products?: ChatProduct[]; actions?: ("track" | "human")[]; source?: string }
  | { id: string; role: "bot"; kind: "order"; order: ChatOrder }
  | { id: string; role: "bot"; kind: "sent"; text: string }

type NewMsg = Msg extends infer T ? (T extends Msg ? Omit<T, "id"> : never) : never

const STORE = "t64-chat"
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
const read = <T,>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") as T | null
  } catch {
    return null
  }
}
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    // Private window: the chat just isn't kept.
  }
}

const waLink = (phone: string, text: string) => {
  let d = phone.replace(/\D/g, "")
  if (d.length === 10) d = `91${d}`
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`
}

// The bot's words: [links](/path), **bold** and line breaks.
function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*)/g).map((p, i) => {
        const link = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
        if (link) {
          const href = link[2]
          return /^\//.test(href) ? (
            <Link key={i} href={href} className="underline underline-offset-2">
              {link[1]}
            </Link>
          ) : /^https?:\/\//.test(href) ? (
            <a key={i} href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {link[1]}
            </a>
          ) : (
            <span key={i}>{link[1]}</span>
          )
        }
        const bold = p.match(/^\*\*([^*]+)\*\*$/)
        if (bold) return <strong key={i}>{bold[1]}</strong>
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

const chip = "rounded-full border border-rule bg-white px-4 py-[9px] text-[14px] font-medium leading-none hover:bg-linen disabled:opacity-50"
const box = "h-[44px] w-full rounded-full border border-rule bg-white px-4 text-[15px] outline-none placeholder:text-black/40 focus:shadow-[0_2px_8px_rgba(0,0,0,0.12)]"

const never = () => () => {}
type Kept = { session: string; msgs: Msg[]; at: number }
const keptChat = (): Kept | null => {
  if (typeof window === "undefined") return null
  const kept = read<Kept>(STORE)
  return kept && kept.session && Date.now() - kept.at < 86_400_000 ? kept : null
}

export function ChatWidget({ config }: { config: ChatbotConfig }) {
  const path = usePathname()
  // Shown only in the browser (the chat is kept there), after the page has loaded.
  const ready = useSyncExternalStore(never, () => true, () => false)
  const [open, setOpen] = useState(false)
  // Pick up the chat from earlier today, if any.
  const [kept] = useState(keptChat)
  const [msgs, setMsgs] = useState<Msg[]>(() => kept?.msgs ?? [])
  // The chat's id: made when the visitor first writes (not while the page is built).
  const [session, setSession] = useState(() => kept?.session ?? "")
  const sessionRef = useRef(session)
  const sid = useCallback(() => {
    if (sessionRef.current) return sessionRef.current
    const s = uid()
    sessionRef.current = s
    setSession(s)
    return s
  }, [])
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<"track" | "message" | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const launcher = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (ready) write(STORE, session ? { session, msgs: msgs.slice(-60), at: Date.now() } : null)
  }, [msgs, session, ready])
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" })
  }, [msgs, busy, form, open])
  useEffect(() => {
    if (open && !form) setTimeout(() => input.current?.focus(), 50)
  }, [open, form])
  // Esc closes it; on phones the page behind doesn't scroll while it's open.
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        launcher.current?.focus()
      }
    }
    window.addEventListener("keydown", key)
    const small = window.matchMedia("(max-width: 639px)").matches
    const before = document.body.style.overflow
    if (small) document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", key)
      document.body.style.overflow = before
    }
  }, [open])

  const add = (m: NewMsg) => setMsgs((s) => [...s, { id: uid(), ...m } as Msg])

  const ask = useCallback(
    async (q: string) => {
      const question = q.trim()
      if (!question || busy) return
      setForm(null)
      const history = msgs
        .filter((m): m is Extract<Msg, { text: string }> => "text" in m && !("kind" in m))
        .slice(-8)
        .map((m) => ({ role: m.role, text: m.text }))
      setMsgs((s) => [...s, { id: uid(), role: "user", text: question }])
      setText("")
      setBusy(true)
      try {
        const res = await fetch("/api/chatbot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session: sid(), text: question, history, page: path }),
        })
        const json = (await res.json().catch(() => ({}))) as { reply?: ChatReply; message?: string }
        if (json.reply) {
          add({ role: "bot", text: json.reply.text, products: json.reply.products, actions: json.reply.actions, source: json.reply.source })
          if (json.reply.actions?.includes("track")) setForm("track")
        } else add({ role: "bot", text: json.message || "Sorry, something went wrong. Please try again.", actions: ["human"] })
      } catch {
        add({ role: "bot", text: "I can't reach the shop just now. Please check your connection and try again.", actions: ["human"] })
      }
      setBusy(false)
    },
    [busy, msgs, sid, path]
  )

  const quick = (q: ChatbotConfig["quick"][number]) => {
    if (q.action === "ask") return ask(q.value || q.label)
    sid()
    add({ role: "user", text: q.label })
    if (q.action === "track") {
      add({ role: "bot", text: "Sure! Enter your order number (it's in your confirmation email) and the email or phone number you ordered with." })
      setForm("track")
    } else if (q.action === "human") {
      add({ role: "bot", text: "Happy to help! Chat with our team on WhatsApp, or leave a message and we'll reply by email.", actions: ["human"] })
      setForm(null)
    } else {
      add({ role: "bot", text: q.value || "What are you looking for?" })
      setForm(null)
      setTimeout(() => input.current?.focus(), 50)
    }
  }

  const startOver = () => {
    setMsgs([])
    setForm(null)
    sessionRef.current = ""
    setSession("")
  }

  if (!ready || config.hide_on.some((p) => p && (path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`)))) return null

  const lastBot = [...msgs].reverse().find((m) => m.role === "bot")
  // What they last asked (not a button's words), to start their message for the team.
  const labels = new Set(config.quick.map((q) => q.label))
  const lastAsked = [...msgs].reverse().find((m): m is Extract<Msg, { role: "user" }> => m.role === "user" && !labels.has(m.text))?.text ?? ""
  const showHuman = !!lastBot && "actions" in lastBot && lastBot.actions?.includes("human")

  const fresh = msgs.length === 0
  const close = () => {
    setOpen(false)
    launcher.current?.focus()
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label={`Chat with ${config.name}`}
          data-chat-panel
          className="chat-pop fixed inset-0 z-[60] flex flex-col bg-white [&>*:not(img):not(video)]:relative [&>*:not(img):not(video)]:z-[1] sm:inset-auto sm:bottom-[100px] sm:right-5 sm:h-[min(640px,calc(100dvh-130px))] sm:w-[400px] sm:rounded-xl sm:border sm:border-black sm:shadow-[0_24px_60px_rgba(0,0,0,0.18)]"
        >
          {/* Header: big hello on a fresh chat, a slim bar once talking. */}
          <div
            className={`relative z-[1] shrink-0 bg-velvet text-white sm:rounded-t-xl ${fresh ? "px-6 pb-6 pt-5" : "flex items-center gap-3 border-b border-white/15 px-4 py-3"}`}
          >
            {fresh ? (
              <>
                <div className="absolute right-4 top-4">
                  <HeaderButtons onClose={close} />
                </div>
                <h2 className="pt-6 font-display h-section">{config.name}</h2>
                <p className="mt-3 max-w-[310px] text-[15px] leading-[21px]">
                  <Words text={config.greeting} />
                </p>
              </>
            ) : (
              <>
                <Sticker size="sm" />
                <p className="min-w-0 flex-1 truncate pt-1 font-display text-[22px] leading-tight">{config.name}</p>
                <button type="button" onClick={startOver} className="rounded-full px-3 py-1.5 text-[13px] font-medium hover:bg-white/10">
                  Start over
                </button>
                <HeaderButtons onClose={close} />
              </>
            )}
          </div>

          <div ref={list} aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-5">
            {fresh && (
              <div className="grid grid-cols-2 gap-2.5" data-quick>
                {config.quick.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => quick(q)}
                    className="group flex min-h-[92px] flex-col items-start justify-between gap-2 rounded-xl border border-rule bg-white p-3.5 text-left text-[15px] font-medium leading-tight transition-colors hover:bg-linen focus-visible:bg-velvet text-white focus-visible:outline-none"
                  >
                    <QuickIcon action={q.action} />
                    {q.label}
                  </button>
                ))}
                <p className="col-span-2 pt-2 text-center text-[14px] text-muted">Or type your question below.</p>
              </div>
            )}
            {msgs.map((m, i) => {
              const prev = msgs[i - 1]
              const firstOfTurn = !prev || prev.role !== m.role
              if (m.role === "user") {
                return (
                  <div key={m.id} className={`flex justify-end ${firstOfTurn ? "mt-1" : ""}`}>
                    <p className="max-w-[80%] whitespace-pre-wrap break-words rounded-xl rounded-br-[6px] bg-black px-4 py-2.5 text-[15px] leading-[22px] text-white">{m.text}</p>
                  </div>
                )
              }
              const face = firstOfTurn ? <Sticker size="xs" /> : <span className="w-[30px] shrink-0" />
              if ("kind" in m && m.kind === "order") {
                return (
                  <div key={m.id} className="flex items-start gap-2">
                    {face}
                    <OrderCard o={m.order} />
                  </div>
                )
              }
              return (
                <div key={m.id} className="flex flex-col gap-2" data-bot-answer={"source" in m ? m.source : ""}>
                  <div className={`flex items-end gap-2 ${firstOfTurn ? "mt-1" : ""}`}>
                    {face}
                    <Bubble>
                      <Words text={m.text} />
                    </Bubble>
                  </div>
                  {"products" in m && !!m.products?.length && (
                    <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 pl-[54px]" data-chat-products>
                      {m.products.map((p) => (
                        <Link
                          key={p.handle}
                          href={`/products/${p.handle}`}
                          className="w-[148px] shrink-0 rounded-xl border border-rule bg-white p-2 transition-transform hover:-translate-y-0.5"
                        >
                          <span className="relative block aspect-[232/211] w-full overflow-hidden rounded-xl bg-placeholder">
                            {p.thumbnail && <Image src={p.thumbnail} alt="" fill sizes="148px" className="object-cover" />}
                          </span>
                          <span className="mt-2 block truncate px-1 text-[14px] font-medium">{p.title}</span>
                          <span className="block px-1 pb-0.5 text-[13px] text-muted">{formatPrice(p.price)}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {busy && (
              <div className="flex items-end gap-2" aria-label="Typing">
                <Sticker size="xs" />
                <span className="flex gap-1 rounded-xl rounded-bl-[6px] border border-rule bg-white px-4 py-3.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-[7px] w-[7px] animate-bounce rounded-full bg-black motion-reduce:animate-none" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </span>
              </div>
            )}
            {form === "track" && (
              <TrackForm
                session={sid}
                onDone={(o) => {
                  add({ role: "bot", kind: "order", order: o })
                  setForm(null)
                }}
                onCancel={() => setForm(null)}
              />
            )}
            {showHuman && !form && !busy && (
              <div className="flex flex-wrap gap-2 pl-[38px]" data-human>
                {config.whatsapp && (
                  <a href={waLink(config.whatsapp, config.whatsapp_message)} target="_blank" rel="noreferrer" className={`${chip} flex items-center gap-2`}>
                    <WhatsAppIcon className="h-[17px] w-[17px]" />
                    WhatsApp us
                  </a>
                )}
                {config.allow_message && (
                  <button type="button" className={chip} onClick={() => setForm("message")}>
                    Leave a message
                  </button>
                )}
                {!config.whatsapp && !config.allow_message && (
                  <Link href="/contact" className={chip}>
                    Contact us
                  </Link>
                )}
              </div>
            )}
            {form === "message" && (
              <MessageForm
                session={sid}
                intro={config.away_text}
                lastQuestion={lastAsked}
                onDone={() => {
                  add({ role: "bot", kind: "sent", text: "Thank you! Your message is with our team. We'll reply by email soon." })
                  setForm(null)
                }}
                onCancel={() => setForm(null)}
              />
            )}
          </div>

          <form
            className="shrink-0 px-3 pb-3 pt-1"
            onSubmit={(e) => {
              e.preventDefault()
              ask(text)
            }}
          >
            <div className="flex items-center gap-1 rounded-full border border-rule bg-white p-1 pl-4 focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
              <label htmlFor="chat-input" className="sr-only">
                Your question
              </label>
              <input
                id="chat-input"
                ref={input}
                value={text}
                maxLength={800}
                autoComplete="off"
                onChange={(e) => setText(e.target.value)}
                placeholder={config.placeholder || "Type your question…"}
                className="chat-input h-[40px] min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-black/40"
              />
              <button
                type="submit"
                aria-label="Send"
                disabled={!text.trim() || busy}
                className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-black text-white transition-colors disabled:bg-pill disabled:text-black/30"
              >
                <SendIcon className="h-[19px] w-[19px]" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Closed: a quiet "Need help?" button (no character), like the rest of the site. */}
      <div className={`fixed bottom-4 right-4 z-[55] sm:bottom-5 sm:right-5 ${open ? "max-sm:hidden" : ""}`}>
        <button
          ref={launcher}
          type="button"
          data-chat-launcher
          aria-label={open ? "Close chat" : config.launcher_label ? undefined : `Chat with ${config.name}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`flex h-[52px] items-center justify-center gap-2 rounded-full bg-black text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-transform hover:-translate-y-0.5 ${
            open || !config.launcher_label ? "w-[52px]" : "pl-4 pr-5"
          }`}
        >
          {open ? (
            <CloseIcon className="h-[22px] w-[22px]" />
          ) : (
            <>
              <ChatIcon className="h-[24px] w-[24px]" />
              {config.launcher_label && <span className="text-[15px] font-medium">{config.launcher_label}</span>}
            </>
          )}
        </button>
      </div>
    </>
  )
}

// The logo in a round white sticker.
function Sticker({ size }: { size: "sm" | "xs" }) {
  const box = size === "sm" ? "h-[42px] w-[42px]" : "h-[30px] w-[30px]"
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-rule bg-white ${box}`}>
      <Image src="/brand/logo-header.png" alt="" width={64} height={64} className="h-[78%] w-[78%] object-contain" />
    </span>
  )
}

function HeaderButtons({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="Close chat"
      onClick={onClose}
      className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full border border-rule bg-white hover:bg-black hover:text-white"
    >
      <CloseIcon className="h-[16px] w-[16px]" />
    </button>
  )
}

// Hand-drawn style icons for the four kinds of quick button.
function QuickIcon({ action }: { action: ChatbotConfig["quick"][number]["action"] }) {
  const common = { className: "h-[28px] w-[28px]", viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true }
  if (action === "track") {
    return (
      <svg {...common}>
        <path d="M5 10.5 16 5l11 5.5v11L16 27 5 21.5z" />
        <path d="M5 10.5 16 16l11-5.5M16 16v11M10.5 7.8l11 5.5" />
      </svg>
    )
  }
  if (action === "products") {
    return (
      <svg {...common}>
        <path d="M9 15V7.5A2.5 2.5 0 0 1 11.5 5h9A2.5 2.5 0 0 1 23 7.5V15" />
        <path d="M6.5 15h19a1.5 1.5 0 0 1 1.5 1.5V19H5v-2.5A1.5 1.5 0 0 1 6.5 15zM8 19v8M24 19v8" />
      </svg>
    )
  }
  if (action === "human") {
    return (
      <svg {...common}>
        <path d="M6 8.5A3.5 3.5 0 0 1 9.5 5h13A3.5 3.5 0 0 1 26 8.5v8a3.5 3.5 0 0 1-3.5 3.5H14l-6 5v-5A3.5 3.5 0 0 1 6 16.5z" />
        <path d="M11.5 12.5c1.2 1.6 2.8 2.4 4.5 2.4s3.3-.8 4.5-2.4" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="16" cy="16" r="11" />
      <path d="M12.6 12.8a3.5 3.5 0 1 1 4.8 3.3c-.9.4-1.4 1.1-1.4 2v.6M16 22.5h.01" />
    </svg>
  )
}

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-[calc(100%-44px)] whitespace-pre-wrap break-words rounded-xl rounded-bl-[6px] border border-rule bg-white px-4 py-2.5 text-[15px] leading-[22px]">
      {children}
    </p>
  )
}

const STEPS: ChatOrder["step"][] = ["placed", "packed", "shipped", "delivered"]
const STEP_LABEL: Record<string, string> = { placed: "Placed", packed: "Packed", shipped: "Shipped", delivered: "Delivered" }

function OrderCard({ o }: { o: ChatOrder }) {
  const at = STEPS.indexOf(o.step)
  return (
    <div data-chat-order className="min-w-0 flex-1 rounded-xl border border-rule bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
      <p className="text-[13px] text-muted">Order #{o.display_id}</p>
      <p className="mt-0.5 text-[16px] font-semibold">{o.step_text}</p>
      {o.step !== "canceled" && (
        <ol className="mt-3 grid grid-cols-4 gap-1" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-col gap-1">
              <span className={`h-[7px] rounded-full border border-black ${i <= at ? "bg-velvet" : "bg-white"}`} />
              <span className={`text-[11px] ${i <= at ? "font-medium" : "text-muted"}`}>{STEP_LABEL[s]}</span>
            </li>
          ))}
        </ol>
      )}
      <ul className="mt-3 text-[14px] leading-[20px]">
        {o.items.slice(0, 4).map((i, k) => (
          <li key={k} className="truncate">
            {i.quantity} × {i.title}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {o.tracking
          .filter((t) => t.url)
          .slice(0, 2)
          .map((t, k) => (
            <a key={k} href={t.url} target="_blank" rel="noreferrer" className={chip}>
              Track parcel{t.number ? ` (${t.number})` : ""}
            </a>
          ))}
        <Link href={o.url} className={chip}>
          See full order
        </Link>
      </div>
    </div>
  )
}

function TrackForm({ session, onDone, onCancel }: { session: () => string; onDone: (o: ChatOrder) => void; onCancel: () => void }) {
  const [order, setOrder] = useState("")
  const [contact, setContact] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <form
      data-chat-track
      className="ml-[38px] flex flex-col gap-2 rounded-xl border border-rule bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError("")
        try {
          const res = await fetch("/api/chatbot/track", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ session: session(), order, contact }),
          })
          const json = (await res.json().catch(() => ({}))) as { order?: ChatOrder; message?: string }
          if (json.order) onDone(json.order)
          else setError(json.message || "I couldn't check that just now.")
        } catch {
          setError("I can't reach the shop just now. Please try again.")
        }
        setBusy(false)
      }}
    >
      <label className="sr-only" htmlFor="chat-order">
        Order number
      </label>
      <input id="chat-order" className={box} inputMode="numeric" placeholder="Order number, e.g. 1042" value={order} onChange={(e) => setOrder(e.target.value)} autoFocus />
      <label className="sr-only" htmlFor="chat-contact">
        Email or phone number
      </label>
      <input id="chat-contact" className={box} placeholder="Email or phone you ordered with" value={contact} onChange={(e) => setContact(e.target.value)} />
      {error && (
        <p role="alert" className="px-2 text-[13px] text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !order.trim() || !contact.trim()} className="h-[44px] flex-1 rounded-full bg-black text-[15px] font-semibold text-white disabled:opacity-40">
          {busy ? "Checking…" : "Check my order"}
        </button>
        <button type="button" onClick={onCancel} className={chip}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function MessageForm({ session, intro, lastQuestion, onDone, onCancel }: { session: () => string; intro: string; lastQuestion: string; onDone: () => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: "", email: "", phone: "", message: lastQuestion, website: "" })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const field = (k: "name" | "email" | "phone", label: string, type = "text") => (
    <div>
      <label className="sr-only" htmlFor={`chat-${k}`}>
        {label}
      </label>
      <input
        id={`chat-${k}`}
        type={type}
        className={`${box} ${errors[k] ? "border-red-600" : ""}`}
        placeholder={label}
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
        aria-invalid={!!errors[k]}
      />
      {errors[k] && <p className="px-3 pt-1 text-[12px] text-red-700">{errors[k]}</p>}
    </div>
  )
  return (
    <form
      data-chat-message
      className="ml-[38px] flex flex-col gap-2 rounded-xl border border-rule bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError("")
        try {
          const res = await fetch("/api/chatbot/handover", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ session: session(), ...v }),
          })
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; errors?: Record<string, string> }
          if (res.ok && json.ok) return onDone()
          setErrors(json.errors ?? {})
          setError(json.message || "We couldn't send that. Please try again.")
        } catch {
          setError("We couldn't send that. Please check your connection.")
        }
        setBusy(false)
      }}
    >
      {intro && <p className="px-1 pb-1 text-[14px] leading-[20px]">{intro}</p>}
      {field("name", "Your name")}
      {field("email", "Email", "email")}
      {field("phone", "Phone (optional)", "tel")}
      <label className="sr-only" htmlFor="chat-message">
        Your question
      </label>
      <textarea
        id="chat-message"
        rows={3}
        maxLength={3000}
        className={`w-full rounded-xl border border-rule bg-white px-4 py-2.5 text-[14px] outline-none placeholder:text-black/40 focus:ring-2 focus:ring-black/20 ${errors.message ? "border-red-600" : ""}`}
        placeholder="Your question"
        value={v.message}
        onChange={(e) => setV({ ...v, message: e.target.value })}
      />
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <input tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} name="website" />
      </div>
      {error && (
        <p role="alert" className="px-2 text-[13px] text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="h-[44px] flex-1 rounded-full bg-black text-[15px] font-semibold text-white disabled:opacity-40">
          {busy ? "Sending…" : "Send to the team"}
        </button>
        <button type="button" onClick={onCancel} className={chip}>
          Cancel
        </button>
      </div>
    </form>
  )
}
