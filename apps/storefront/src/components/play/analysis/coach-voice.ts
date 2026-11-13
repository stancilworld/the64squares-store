"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { coachVoice } from "@/lib/coach-actions"

// Plays the coach's lines: the shop's ElevenLabs voice when there is one, otherwise the
// browser's own voice. Lines are fetched ahead, so the review flows without gaps.

const KEY = "t64-coach-voice"

const browserVoice = () => {
  const all = typeof speechSynthesis !== "undefined" ? speechSynthesis.getVoices() : []
  return all.find((v) => v.lang === "en-IN") ?? all.find((v) => v.lang.startsWith("en-GB")) ?? all.find((v) => v.lang.startsWith("en")) ?? null
}

export function useCoachVoice() {
  const [on, setOn] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const urls = useRef(new Map<string, Promise<string | null>>())
  const audio = useRef<HTMLAudioElement | null>(null)
  const turn = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem(KEY) === "off") setOn(false)
      } catch {}
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const toggle = useCallback(() => {
    setOn((v) => {
      try {
        localStorage.setItem(KEY, v ? "off" : "on")
      } catch {}
      return !v
    })
  }, [])

  // Starts making a line's audio (so it's ready when needed).
  const prefetch = useCallback((say: string) => {
    if (!urls.current.has(say)) urls.current.set(say, coachVoice(say).then((r) => r.url).catch(() => null))
    return urls.current.get(say)!
  }, [])

  const stop = useCallback(() => {
    turn.current++
    audio.current?.pause()
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  // Says a line; resolves when it has been said (or was stopped).
  const say = useCallback(
    async (text: string, force = false) => {
      if (!on && !force) return
      stop()
      const mine = ++turn.current
      setSpeaking(true)
      const url = await prefetch(text)
      if (mine !== turn.current) return
      await new Promise<void>((done) => {
        // Some browsers never say their voice has finished: move on after about as long as the
        // line takes to say.
        const guard = setTimeout(done, Math.max(2500, text.length * 85) + (url ? 4000 : 1500))
        const resolve = () => {
          clearTimeout(guard)
          done()
        }
        if (url) {
          const a = audio.current ?? new Audio()
          audio.current = a
          a.src = url
          a.onended = a.onerror = () => resolve()
          a.onpause = () => resolve()
          a.play().catch(() => resolve())
          return
        }
        if (typeof speechSynthesis === "undefined") return resolve()
        const u = new SpeechSynthesisUtterance(text)
        const v = browserVoice()
        if (v) u.voice = v
        u.rate = 1.02
        u.onend = u.onerror = () => resolve()
        speechSynthesis.speak(u)
      })
      if (mine === turn.current) setSpeaking(false)
    },
    [on, prefetch, stop]
  )

  useEffect(() => () => stop(), [stop])
  return { on, toggle, say, stop, prefetch, speaking }
}
