import crypto from "node:crypto"

// The game review coach's voice, made with ElevenLabs (key in Settings → Payments & delivery →
// Keys). Each sentence is made once per voice and kept (modules/coach), so replaying a review,
// or the same sentence in another game, costs nothing more.

export type VoiceKeys = { key: string; voiceId: string; model: string }

const API = "https://api.elevenlabs.io/v1"

// New characters a player can have voiced a day (repeats are free). About 40 reviews' worth.
export const DAILY_CHARS = Number(process.env.COACH_DAILY_CHARS || 6000)

export const clipHash = (v: VoiceKeys, text: string) => crypto.createHash("sha256").update(`${v.voiceId}|${v.model}|${text}`).digest("hex")

export const indiaDay = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10)

// Speech for a sentence, as MP3.
export const synthesize = async (v: VoiceKeys, text: string): Promise<Buffer> => {
  const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(v.voiceId)}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": v.key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: v.model, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!r.ok) {
    const detail = await r.text().catch(() => "")
    throw new Error(`ElevenLabs ${r.status}: ${detail.slice(0, 200)}`)
  }
  return Buffer.from(await r.arrayBuffer())
}

// The admin's "Test the voice": the key works, and how much of the month's allowance is left.
export const testVoice = async (v: VoiceKeys): Promise<{ ok: boolean; message: string }> => {
  try {
    const r = await fetch(`${API}/user/subscription`, { headers: { "xi-api-key": v.key }, signal: AbortSignal.timeout(10_000) })
    if (r.status === 401) return { ok: false, message: "ElevenLabs didn't accept the key. Copy it again from elevenlabs.io → Developers → API keys." }
    if (!r.ok) {
      // A key limited to text to speech can't read the subscription: try a word instead.
      await synthesize(v, "Check.")
      return { ok: true, message: "Connected: the voice works." }
    }
    const s = (await r.json()) as { character_count?: number; character_limit?: number; tier?: string }
    const left = (s.character_limit ?? 0) - (s.character_count ?? 0)
    await synthesize(v, "Check.")
    return { ok: true, message: `Connected (${s.tier ?? "plan"}): ${left.toLocaleString("en-IN")} of ${(s.character_limit ?? 0).toLocaleString("en-IN")} characters left this month. The voice works.` }
  } catch (e) {
    const m = (e as Error).message
    return { ok: false, message: /404|voice/i.test(m) ? "The voice ID wasn't found in your ElevenLabs account." : `Couldn't reach ElevenLabs: ${m}` }
  }
}
