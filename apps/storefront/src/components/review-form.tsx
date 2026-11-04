"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { getMyReview, type MyReview, submitReview } from "@/lib/review-actions"

// "Write a review": only for signed-in shoppers who bought the product. Reviews show once
// the shop approves them.
export function ReviewForm({ productId }: { productId: string }) {
  const [me, setMe] = useState<MyReview | null>(null)
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [name, setName] = useState("")
  const [city, setCity] = useState("")
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)
  const [pending, start] = useTransition()

  useEffect(() => {
    let live = true
    getMyReview(productId).then((r) => {
      if (!live) return
      setMe(r)
      if (r.review) {
        setRating(r.review.rating)
        setTitle(r.review.title ?? "")
        setBody(r.review.body)
      }
      setName(r.name ?? "")
    })
    return () => {
      live = false
    }
  }, [productId])

  if (!me) return null
  if (!me.signedIn) {
    return (
      <p className="mt-6 text-[14px] text-muted">
        Bought this?{" "}
        <Link href={`/account?next=${encodeURIComponent(`${typeof window !== "undefined" ? window.location.pathname : ""}#reviews`)}`} className="text-black underline underline-offset-4">
          Sign in
        </Link>{" "}
        to write a review.
      </p>
    )
  }
  if (!me.canReview) {
    return <p className="mt-6 text-[14px] text-muted">Reviews are written by shoppers who bought this product here.</p>
  }
  if (sent) {
    return (
      <p className="mt-6 rounded-md bg-linen px-4 py-3 text-[14px]">
        Thank you! Your review will appear here once we&apos;ve checked it, usually within a day.
      </p>
    )
  }
  if (!open) {
    return (
      <div className="mt-6">
        {me.review?.status === "pending" && <p className="mb-3 text-[14px] text-muted">Your review is waiting to be checked.</p>}
        <button type="button" className="btn btn-outline h-[46px]" onClick={() => setOpen(true)}>
          {me.review ? "Edit your review" : "Write a review"}
        </button>
      </div>
    )
  }

  const send = () => {
    setError("")
    if (!rating) return setError("Choose how many stars.")
    if (body.trim().length < 10) return setError("Please write a few words about the product.")
    start(async () => {
      const r = await submitReview({ productId, rating, title, body, name, city })
      if (r.ok) setSent(true)
      else setError(r.error)
    })
  }

  const field = "mt-1.5 w-full rounded-md border border-rule bg-white px-3 text-[15px] outline-none focus:border-black"
  return (
    <form
      className="mt-6 space-y-4 rounded-md border border-rule p-4"
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <fieldset>
        <legend className="text-[14px] font-medium">Your rating</legend>
        <div className="mt-1 flex" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              aria-pressed={rating === n}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
              className="p-0.5"
            >
              <svg width="28" height="28" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  fill={(hover || rating) >= n ? "#d99a00" : "#d9d3c7"}
                  d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z"
                />
              </svg>
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-[14px] font-medium">
        Headline <span className="font-normal text-muted">(optional)</span>
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={`${field} h-[44px]`} />
      </label>
      <label className="block text-[14px] font-medium">
        Your review
        <textarea value={body} maxLength={2000} rows={5} onChange={(e) => setBody(e.target.value)} className={`${field} py-2`} placeholder="How's the quality, the finish, the feel of the pieces?" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[14px] font-medium">
          Name shown
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={`${field} h-[44px]`} />
        </label>
        <label className="block text-[14px] font-medium">
          City <span className="font-normal text-muted">(optional)</span>
          <input value={city} maxLength={60} onChange={(e) => setCity(e.target.value)} className={`${field} h-[44px]`} />
        </label>
      </div>
      <p className="text-[12px] text-muted">Only your first name and the first letter of your surname are shown.</p>
      {error && <p className="text-[14px] text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-solid h-[46px] disabled:opacity-50">
          {pending ? "Sending…" : "Send review"}
        </button>
        <button type="button" className="btn btn-outline h-[46px]" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
