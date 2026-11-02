import Image from "next/image"
import Link from "next/link"
import { Hero } from "@/components/hero"
import { ImageCarousel } from "@/components/image-carousel"
import { NewsletterSection } from "@/components/newsletter-section"
import { ProductCard } from "@/components/product-card"
import { getCategories, getContent, getProductCards } from "@/lib/data"

// Shown until pictures are uploaded in the admin (Website → Homepage).
const DEFAULT_FEATURED_IMAGE = "/images/home-travel-case.jpg"

export default async function HomePage() {
  const [blocks, products, categories] = await Promise.all([getContent("home"), getProductCards(), getCategories()])
  const of = (section: string) => blocks.filter((b) => b.section === section)
  const hero = of("hero")[0]
  const featured = of("featured_collection")[0]
  const featuredImages = of("featured_image")
    .map((b) => b.image_url)
    .filter((src): src is string => !!src)
  const newsletter = of("newsletter")[0]
  const picks = products.slice(0, 4)

  return (
    <>
      {hero && <Hero block={hero} />}

      {categories.length > 0 && (
        <nav aria-label="Categories" className="border-b border-rule">
          <ul className="mx-auto flex max-w-[1440px] gap-x-8 gap-y-2 overflow-x-auto px-6 py-5 lg:justify-center lg:gap-x-12 lg:px-10">
            {categories.map((c) => (
              <li key={c.id} className="shrink-0">
                <Link href={`/shop?category=${c.handle}`} className="font-display text-[19px] hover:text-velvet hover:underline hover:decoration-brass hover:underline-offset-8 lg:text-[21px]">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {picks.length > 0 && (
        <section className="mx-auto max-w-[1440px] px-6 pt-16 lg:px-10 lg:pt-24">
          <div className="flex items-end justify-between gap-6">
            <h2 className="font-display h-section">Pieces to play for a lifetime</h2>
            <Link href="/shop" className="shrink-0 text-[15px] underline decoration-rule underline-offset-4 hover:decoration-black">
              View all products
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 lg:mt-10 lg:grid-cols-4 lg:gap-x-6">
            {picks.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {featured && (
        <section className="mt-16 bg-maple-soft lg:mt-24">
          <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 py-14 lg:grid-cols-2 lg:gap-16 lg:px-10 lg:py-20">
            {featuredImages.length > 1 ? (
              <ImageCarousel images={featuredImages} label={featured.title ?? "Featured collection"} />
            ) : (
              <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-walnut sm:aspect-[4/3] lg:aspect-[4/5]">
                <Image
                  src={featuredImages[0] || DEFAULT_FEATURED_IMAGE}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
            )}
            <div className="max-w-[480px]">
              {featured.eyebrow && <p className="text-[14px] text-walnut">{featured.eyebrow}</p>}
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

      {newsletter && <NewsletterSection block={newsletter} className="py-16 lg:py-24" />}
    </>
  )
}
