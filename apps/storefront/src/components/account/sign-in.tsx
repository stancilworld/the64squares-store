"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { googleStart, registerWithPassword, requestCode, signInWithCode, signInWithPassword } from "@/lib/auth"
import { notifyCartChanged } from "@/lib/cart-events"
import { Field, PrimaryButton } from "../checkout/fields"

type Mode = "code" | "password" | "create"

const safeNext = (next?: string) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/account")

// Sign in with an emailed code (default), a password, or Google. "Create account with a
// password" also checks the email with a code first. In the sign-in pop-up, onDone runs instead
// of going to another page (the pop-up refreshes the page the shopper is on).
export function SignIn({ google, next, onDone, inDialog = false }: { google: boolean; next?: string; onDone?: () => void; inDialog?: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("code")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const done = () => {
    notifyCartChanged()
    if (onDone) return onDone()
    router.push(safeNext(next))
    router.refresh()
  }

  const switchTo = (m: Mode) => {
    setMode(m)
    setError(null)
    setSentTo(null)
    setCode("")
  }

  const sendCode = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError("Please enter a valid email.")
      return
    }
    setBusy(true)
    setError(null)
    const res = await requestCode(email.trim())
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setSentTo(email.trim())
    setWait(30)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (mode !== "password" && !sentTo) {
      await sendCode()
      return
    }
    setBusy(true)
    const res =
      mode === "code"
        ? await signInWithCode(sentTo!, code)
        : mode === "password"
          ? await signInWithPassword(email, password)
          : await registerWithPassword({ email: sentTo!, code, password, first_name: firstName, last_name: lastName })
    if (res.ok) {
      done()
      return
    }
    setBusy(false)
    setError(res.error)
  }

  const withGoogle = async () => {
    setBusy(true)
    const res = await googleStart()
    if (res.location) {
      try {
        sessionStorage.setItem("t64_next", safeNext(next))
      } catch {}
      window.location.href = res.location
      return
    }
    setBusy(false)
    setError("Google sign-in isn't available right now. Please use an email code.")
  }

  const title = mode === "create" ? "Create your account" : "Sign in"

  return (
    <div className="mx-auto max-w-[460px]">
      {inDialog ? (
        <h2 id="sign-in-title" className="text-center text-[24px] font-semibold">
          {title}
        </h2>
      ) : (
        <h1 className="text-center text-[26px] font-semibold lg:text-[34px]">{title}</h1>
      )}
      <p className="mt-2 text-center text-[15px] text-black/70 lg:text-[17px]">
        {mode === "code"
          ? "We'll email you a 6-digit code. No password needed."
          : mode === "password"
            ? "Sign in with your email and password."
            : "We'll email you a code to check it's you, then you choose a password."}
      </p>

      {google && (
        <>
          <button
            type="button"
            onClick={withGoogle}
            disabled={busy}
            className="mt-8 flex h-[46px] w-full items-center justify-center gap-3 rounded-md border border-black text-[16px] font-medium hover:bg-chalk disabled:opacity-60 lg:h-[50px]"
          >
            <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" aria-hidden="true">
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
              <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
            </svg>
            Continue with Google
          </button>
          <p className="my-6 flex items-center gap-3 text-[13px] text-black/50">
            <span className="h-px flex-1 bg-black/15" />
            or with your email
            <span className="h-px flex-1 bg-black/15" />
          </p>
        </>
      )}

      <form onSubmit={submit} noValidate className={`${google ? "" : "mt-8"} flex flex-col gap-5`}>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (sentTo) setSentTo(null)
          }}
          disabled={busy}
        />
        {mode === "create" && sentTo && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="First name" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Field label="Last name" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        )}
        {mode !== "password" && sentTo && (
          <Field
            label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            hint={
              <>
                Sent to {sentTo}. Check spam too.{" "}
                {wait > 0 ? (
                  <span>Send again in {wait}s</span>
                ) : (
                  <button type="button" onClick={sendCode} className="underline underline-offset-2">
                    Send again
                  </button>
                )}
              </>
            }
          />
        )}
        {(mode === "password" || (mode === "create" && sentTo)) && (
          <Field
            label={mode === "create" ? "Choose a password" : "Password"}
            type="password"
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={mode === "create" ? "At least 8 characters." : undefined}
          />
        )}
        {error && (
          <p className="text-[15px] text-red-700" role="alert">
            {error}
          </p>
        )}
        <PrimaryButton type="submit" disabled={busy || (!!sentTo && mode !== "password" && code.length !== 6)}>
          {busy
            ? "Please wait…"
            : mode === "password"
              ? "Sign in"
              : !sentTo
                ? "Email me a code"
                : mode === "create"
                  ? "Create account"
                  : "Sign in"}
        </PrimaryButton>
      </form>

      <div className="mt-6 space-y-2 text-center text-[14px] lg:text-[15px]">
        {mode !== "code" && (
          <p>
            <button type="button" onClick={() => switchTo("code")} className="underline underline-offset-4">
              {mode === "password" ? "Forgot your password? Sign in with an email code" : "Sign in with an email code instead"}
            </button>
          </p>
        )}
        {mode !== "password" && (
          <p>
            <button type="button" onClick={() => switchTo("password")} className="underline underline-offset-4">
              Sign in with a password
            </button>
          </p>
        )}
        {mode !== "create" && (
          <p className="text-black/70">
            New here? An email code creates your account, or{" "}
            <button type="button" onClick={() => switchTo("create")} className="underline underline-offset-4">
              create one with a password
            </button>
            .
          </p>
        )}
      </div>
    </div>
  )
}
