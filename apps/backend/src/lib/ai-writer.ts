import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { getServiceKeys, groqOptions } from "./service-keys"

// The writing helper in admin → Content. Uses the same free AI keys as the chat bot (Groq,
// then Google Gemini; Settings → Payments & delivery → Keys). It drafts; a person edits.

export const WRITE_TASKS = {
  titles: { label: "Title ideas", ask: "Suggest 8 article titles (one per line, no numbering, under 65 characters each)." },
  outline: { label: "Outline", ask: "Write an article outline: a working title, then 5–8 section headings, each with 2–3 short bullet points of what to cover." },
  intro: { label: "Opening paragraph", ask: "Write an engaging opening paragraph (80–120 words) that makes the reader want to continue." },
  meta: { label: "Google description", ask: "Write 3 different search result descriptions, each 140–155 characters, one per line, that include the keyword naturally." },
  social: { label: "Social posts", ask: "Write 3 short social media posts promoting the article: one for Instagram (with 5 relevant hashtags), one for Facebook, one for WhatsApp. Label each." },
  faq: { label: "Questions & answers", ask: "Write 5 questions shoppers or players often ask about this topic, each with a short, factual answer (2–3 sentences)." },
  improve: { label: "Improve my text", ask: "Rewrite the text below to be clearer and more engaging, keeping the meaning, facts and roughly the length. Use simple words." },
} as const

export type WriteTask = keyof typeof WRITE_TASKS

const SYSTEM = [
  "You write for The 64 Squares (the64squares.in), an Indian brand making premium handmade chess sets, boards, pieces and clocks, which also runs online chess play, puzzles and tournaments.",
  "Write in clear, warm, simple Indian English for chess players and gift buyers. No hype words like 'unleash', 'elevate' or 'game-changer'.",
  "Never invent facts about the brand: no made-up prices, discounts, delivery times, awards, statistics or quotes. Where a fact is needed, write [add detail].",
  "Answer with plain text only (no markdown symbols like ** or #).",
].join(" ")

export const aiConnected = async (c: MedusaContainer) => (await getServiceKeys(c)).ai.length > 0

export const write = async (c: MedusaContainer, task: WriteTask, topic: string, keyword: string, text: string) => {
  const providers = (await getServiceKeys(c)).ai
  if (!providers.length) return { ok: false as const, reason: "no-keys" as const }
  const prompt = [
    WRITE_TASKS[task].ask,
    `Topic: ${topic}`,
    keyword ? `Main search keyword: ${keyword}` : "",
    text ? `Text:\n${text.slice(0, 6000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
  const answer = await askAi(c, providers, SYSTEM, prompt, { temperature: 0.7, maxTokens: 1200, timeoutMs: 40_000, label: "Writing helper" })
  if (answer) return { ok: true as const, provider: answer.provider, text: answer.text }
  return { ok: false as const, reason: "failed" as const }
}

type Provider = Awaited<ReturnType<typeof getServiceKeys>>["ai"][number]

// One question to the free AI keys, Groq first, then Gemini. null if none answered.
export const askAi = async (
  c: MedusaContainer,
  providers: Provider[],
  system: string,
  prompt: string,
  o: { temperature: number; maxTokens: number; timeoutMs: number; label: string }
): Promise<{ provider: Provider["provider"]; text: string } | null> => {
  const logger = c.resolve(ContainerRegistrationKeys.LOGGER)
  for (const p of providers) {
    try {
      const signal = AbortSignal.timeout(o.timeoutMs)
      let out = ""
      if (p.provider === "groq") {
        const base = (process.env.GROQ_API_BASE || "https://api.groq.com").replace(/\/$/, "")
        const r = await fetch(`${base}/openai/v1/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
          body: JSON.stringify({ model: p.model, temperature: o.temperature, ...groqOptions(p.model, o.maxTokens), messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
          signal,
        })
        if (!r.ok) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Groq ${r.status}`)
        out = ((await r.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? ""
      } else {
        const base = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com").replace(/\/$/, "")
        const r = await fetch(`${base}/v1beta/models/${encodeURIComponent(p.model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": p.key },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: o.temperature, maxOutputTokens: o.maxTokens } }),
          signal,
        })
        if (!r.ok) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Gemini ${r.status}`)
        out = ((await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? ""
      }
      out = out.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim()
      if (out) return { provider: p.provider, text: out }
    } catch (e) {
      logger.warn(`${o.label}: ${p.provider} didn't answer (${(e as Error).message})`)
    }
  }
  return null
}
