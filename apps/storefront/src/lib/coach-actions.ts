"use server"

import { getToken } from "./auth"
import { sdk } from "./medusa"

// The game review coach's voice for a sentence: an MP3 made with the shop's ElevenLabs voice,
// for signed-in players. url null: use the browser's own voice (signed out, no voice set up,
// or today's allowance used).
export async function coachVoice(text: string): Promise<{ url: string | null; note?: string }> {
  const token = await getToken()
  if (!token || !text.trim()) return { url: null }
  try {
    return await sdk.client.fetch<{ url: string | null }>("/store/coach/voice", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: { text: text.trim().slice(0, 320) },
    })
  } catch (e) {
    return { url: null, note: (e as { message?: string }).message }
  }
}
