"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { googleFinish } from "@/lib/auth"
import { notifyCartChanged } from "@/lib/cart-events"

export function GoogleReturn() {
  const params = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const query = Object.fromEntries(params.entries())
    googleFinish(query).then((res) => {
      if (!res.ok) {
        setError(res.error)
        return
      }
      let next = "/account"
      try {
        next = sessionStorage.getItem("t64_next") || "/account"
        sessionStorage.removeItem("t64_next")
      } catch {}
      notifyCartChanged()
      router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/account")
      router.refresh()
    })
  }, [params, router])

  return error ? (
    <div>
      <p className="text-[18px] text-red-700">{error}</p>
      <Link href="/account" className="mt-6 btn btn-solid">
        Back to sign in
      </Link>
    </div>
  ) : (
    <p className="text-[18px] text-black/60">Signing you in…</p>
  )
}
