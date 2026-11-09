import Image from "next/image"
import Link from "next/link"
import { Suspense } from "react"
import { Hero } from "@/components/hero"
import { ImageCarousel } from "@/components/image-carousel"
import { NewsletterSection } from "@/components/newsletter-section"
import { ProductCard } from "@/components/product-card"
import { redirect } from "next/navigation"
import { HomePlay, type HomeEvent } from "@/components/home/home-play"
import { getCategories, getContent, getDeliveryInfo, getProductCards, getSiteNavigation } from "@/lib/data"
import { formatPrice } from "@/lib/format"
import { dateBlock, eventTime } from "@/lib/tournament-types"
import { getTournaments } from "@/lib/tournaments"

// Shown until pictures are uploaded in the admin (Website → Homepage).
const DEFAULT_FEATURED_IMAGE = "/images/home-travel-case.jpg"
// A piece stands on each category tile.
const CATEGORY_ART = ["/play-art/wK.webp", "/play-art/bQ.webp", "/play-art/wN.webp", "/play-art/wR.webp", "/play-art/bK.webp", "/play-art/wP.webp"]

// The next tournament changes often (places fill up), so it loads after the rest of the page.
async function PlaySection() {
  const tournaments = await getTournaments()
  const next = tournaments.upcoming.find((t) => t.status === "published") ?? null
  const event: HomeEvent | null = next
    ? {
        href: `/tournaments/${next.handle}`,
        title: next.title,
        ...dateBlock(next.starts_at),
        line: `${next.format_label}, ${next.time_control} · ${eventTime(next.starts_at)} · ${next.entry_fee > 0 ? `${formatPrice(next.entry_fee)} entry` : "Free entry"}`,
        status: next.registration_open
          ? next.places_left != null
            ? `${next.places_left} ${next.places_left === 1 ? "place" : "places"} left`
            : "Registration open"
          : (next.registration_note ?? "Registration closed"),
      }
    : null
  return <HomePlay event={event} />
}

export default async function HomePage() {
  const [blocks, products, categories, nav, delivery] = await Promise.all([
    getContent("home"),
    getProductCards(),
    getCategories(),
    getSiteNavigation(),
    getDeliveryInfo(),
  ])
  // The admin can make the website open on Play instead (Website → Menu & footer).
  if (nav.experience?.home === "play") redirect("/play")
  const of = (section: string) => blocks.filter((b) => b.section === section)
  const hero = of("hero")[0]
  const featured = of("featured_collection")[0]
  const featuredImages = of("featured_image")
    .map((b) => b.image_url)
    .filter((src): src is string => !!src)
  const newsletter = of("newsletter")[0]
  const picks = products.slice(0, 8)

  const showPlay = nav.experience?.show_switch !== false

  return (
    <>
      {hero && <Hero block={hero} showPlay={showPlay} />}

      {categories.length > 0 && (
        <nav aria-label="Categories" className="mx-auto max-w-[1440px] px-6 pt-10 lg:px-10 lg:pt-14">
          <ul className="-mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-2 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
            {categories.slice(0, 6).map((c, i) => (
              <li key={c.id} className="w-[42vw] max-w-[220px] shrink-0 snap-start lg:w-auto lg:max-w-none">
                <Link href={`/shop?category=${c.handle}`} className="group relative block aspect-square overflow-hidden bg-chalk transition-colors hover:bg-amber">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={CATEGORY_ART[i % CATEGORY_ART.length]}
                    alt=""
                    loading="lazy"
                    className="absolute bottom-[-8%] right-[-6%] h-[78%] w-auto drop-shadow-[0_14px_14px_rgba(0,0,0,0.25)] transition-transform duration-300 group-hover:-translate-y-1.5 motion-reduce:transition-none"
                  />
                  <span className="absolute left-3 top-3 max-w-[70%] text-[16px] font-extrabold leading-[1.1] tracking-tight lg:left-4 lg:top-4 lg:text-[19px]">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {picks.length > 0 && (
        <section className="mx-auto max-w-[1440px] px-6 pt-14 lg:px-10 lg:pt-20">
          <div className="flex items-end justify-between gap-6">
            <h2 className="font-display h-section sq-mark">Pieces to play for a lifetime</h2>
            <Link href="/shop" className="shrink-0 text-[15px] font-semibold underline decoration-amber decoration-2 underline-offset-[6px] hover:decoration-black">
              View all products
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 lg:mt-10 lg:grid-cols-4 lg:gap-x-5">
            {picks.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {showPlay && (
        <div className="mt-16 lg:mt-24">
          <Suspense fallback={<HomePlay event={null} />}>
            <PlaySection />
          </Suspense>
        </div>
      )}

      {featured && (
        <section className={showPlay ? "bg-chalk" : "mt-16 bg-chalk lg:mt-24"}>
          <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 py-14 lg:grid-cols-2 lg:gap-16 lg:px-10 lg:py-20">
            {featuredImages.length > 1 ? (
              <ImageCarousel images={featuredImages} label={featured.title ?? "Featured collection"} />
            ) : (
              <div className="relative aspect-[4/5] overflow-hidden bg-chalk-deep sm:aspect-[4/3] lg:aspect-square">
                <Image
                  src={featuredImages[0] || DEFAULT_FEATURED_IMAGE}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
            )}
            <div className="max-w-[500px]">
              {featured.eyebrow && <p className="text-[14px] font-semibold text-muted">{featured.eyebrow}</p>}
              <h2 className="font-display h-page mt-2">{featured.title}</h2>
              {featured.body && <p className="mt-5 text-[17px] leading-[1.65]">{featured.body}</p>}
              {featured.link_url && (
                <Link href={featured.link_url} className="btn btn-solid mt-8">
                  {featured.link_label || "Explore the collection"}
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      <section aria-label="Why buy from us" className="border-b border-rule">
        <ul className="mx-auto grid max-w-[1440px] gap-px bg-rule sm:grid-cols-3">
          {[
            { title: "Made by hand in India", text: "Carved, weighted and finished by craftsmen, then checked piece by piece." },
            { title: `Dispatched from ${delivery.dispatch_from || "India"}`, text: `Packed in ${delivery.dispatch_days} ${delivery.dispatch_days === 1 ? "day" : "days"}, with tracking sent to your phone and email.` },
            { title: "Easy returns", text: delivery.returns_text || "Something not right? Write to us and we will sort it out." },
          ].map((x) => (
            <li key={x.title} className="bg-white px-6 py-8 lg:px-10 lg:py-10">
              <h3 className="sq-mark text-[17px] font-extrabold tracking-tight">{x.title}</h3>
              <p className="mt-2 max-w-[380px] text-[15px] leading-[1.6] text-muted">{x.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {newsletter && <NewsletterSection block={newsletter} className="py-16 lg:py-24" />}
    </>
  )
}
