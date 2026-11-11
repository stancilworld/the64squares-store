import type { PublicReview, ReviewSummary } from "@/lib/data"
import { ReviewForm } from "./review-form"
import { Stars } from "./stars"

const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })

// Reviews under a product: the star summary, the reviews, and a form for shoppers who bought it.
export function ProductReviews({ productId, summary, reviews, photos = false }: { productId: string; summary: ReviewSummary; reviews: PublicReview[]; photos?: boolean }) {
  return (
    <section id="reviews" aria-labelledby="reviews-title" className="mt-20 scroll-mt-24 border-t border-rule pt-12 lg:mt-24">
      <div className="grid gap-10 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-16">
        <div>
          <h2 id="reviews-title" className="font-display text-[28px] leading-tight lg:text-[34px]">
            Reviews
          </h2>
          {summary.count > 0 ? (
            <>
              <div className="mt-4 flex items-center gap-3">
                <span className="text-[40px] font-medium leading-none">{summary.average.toFixed(1)}</span>
                <div>
                  <Stars value={summary.average} size={20} />
                  <p className="mt-1 text-[14px] text-muted">
                    {summary.count} review{summary.count === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <ul className="mt-5 space-y-1.5" aria-label="Ratings breakdown">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = summary.stars[n - 1]
                  return (
                    <li key={n} className="flex items-center gap-2 text-[13px]">
                      <span className="w-[42px] text-muted">{n} star</span>
                      <span className="h-[8px] flex-1 overflow-hidden rounded-sm bg-chalk">
                        <span className="block h-full rounded-sm bg-[#d99a00]" style={{ width: `${summary.count ? (c / summary.count) * 100 : 0}%` }} />
                      </span>
                      <span className="w-[24px] text-right text-muted">{c}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-[15px] text-muted">No reviews yet.</p>
          )}
          <ReviewForm productId={productId} photos={photos} />
        </div>
        <div>
          {reviews.length > 0 ? (
            <ul className="divide-y divide-rule">
              {reviews.map((r) => (
                <li key={r.id} className="py-6 first:pt-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Stars value={r.rating} size={16} />
                    {r.title && <h3 className="text-[16px] font-medium">{r.title}</h3>}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-[1.7]">{r.body}</p>
                  {photos && !!r.photos?.length && (
                    <ul className="mt-3 flex gap-2" aria-label="Photos from the shopper">
                      {r.photos.map((src, i) => (
                        <li key={src}>
                          <a href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md border border-rule">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`Photo ${i + 1} from ${r.name}`} loading="lazy" className="h-[88px] w-[88px] object-cover transition-transform hover:scale-105" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[13px] text-muted">
                    {r.name}
                    {r.city ? `, ${r.city}` : ""} · {date(r.date)}
                    {r.verified && <span className="ml-2 font-medium text-[#2f7a3e]">✓ Verified buyer</span>}
                    {r.source === "etsy" && <span className="ml-2">· via Etsy</span>}
                  </p>
                  {r.reply && (
                    <div className="mt-3 rounded-md bg-chalk px-4 py-3 text-[14px]">
                      <p className="font-medium">Reply from The 64 Squares</p>
                      <p className="mt-1 whitespace-pre-line leading-[1.6]">{r.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-muted lg:pt-3">Bought this? Be the first to tell others what you think.</p>
          )}
        </div>
      </div>
    </section>
  )
}
