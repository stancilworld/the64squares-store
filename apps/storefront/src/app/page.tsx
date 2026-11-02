import Image from "next/image"
import Link from "next/link"
import { headingLines, Hero } from "@/components/hero"
import { ImageCarousel } from "@/components/image-carousel"
import { FillMedia, isVideo, Media } from "@/components/media"
import { NewsletterSection } from "@/components/newsletter-section"
import { getContent } from "@/lib/data"

export default async function HomePage() {
  const blocks = await getContent("home")
  const of = (section: string) => blocks.filter((b) => b.section === section)
  const hero = of("hero")[0]
  const featured = of("featured_collection")[0]
  const featuredImages = of("featured_image").map((b) => b.image_url)
  const gang = of("gang_band")[0]
  const newsletter = of("newsletter")[0]

  return (
    <>
      {hero && <Hero block={hero} />}

      {featured && (
        <section className="mx-auto mt-[56px] grid max-w-[1440px] items-center gap-10 px-6 lg:mt-[100px] lg:grid-cols-[675px_1fr] lg:gap-[58px] lg:pl-[111px] lg:pr-[110px]">
          <ImageCarousel images={featuredImages} label={featured.title ?? "Featured collection"} />
          <div className="max-w-[442px] lg:mt-[66px] lg:self-start">
            {featured.eyebrow && <p className="text-[20px]">{featured.eyebrow}</p>}
            <h2 className="mt-[5px] font-display text-[64px] leading-[42px] lg:text-[105px] lg:leading-[66px]">
              {headingLines(featured.title).map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </h2>
            {featured.body && <p className="mt-[32px] text-[16px] leading-[25px]">{featured.body}</p>}
            {featured.link_url && (
              <Link
                href={featured.link_url}
                className="mt-[32px] inline-flex h-[42px] items-center justify-center rounded-full bg-ink px-[33px] text-[16px] text-white hover:bg-black"
              >
                {featured.link_label || "Explore This Collection"}
              </Link>
            )}
          </div>
        </section>
      )}

      {gang && (
        <section className="relative mt-[64px] overflow-hidden bg-placeholder lg:mt-[184px]">
          {gang.image_url && <FillMedia src={gang.image_url} sizes="100vw" />}
          <div className="relative mx-auto flex min-h-[300px] max-w-[1440px] items-center justify-center lg:block lg:h-[428px] lg:min-h-0">
            <div className="px-6 py-12 text-center lg:absolute lg:left-[154px] lg:top-[106px] lg:w-[486px] lg:p-0">
              <h2 className="font-display text-[56px] leading-[38px] lg:text-[105px] lg:leading-[66px]">
                {gang.title}
              </h2>
              {gang.link_url && (
                <Link
                  href={gang.link_url}
                  className="mt-[28px] inline-flex h-[42px] min-w-[140px] items-center justify-center rounded-full bg-ink px-6 text-[16px] text-white hover:bg-black lg:mt-[40px]"
                >
                  {gang.link_label || "Sign up"}
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {newsletter && (
        <div className="relative mx-auto max-w-[1440px]">
          <NewsletterSection
            block={newsletter}
            bodyClassName="max-w-[752px]"
            className="pb-[120px] pt-[72px] lg:pb-[140px] lg:pt-[152px] lg:pl-[118px]"
          />
          {newsletter.image_url &&
            (isVideo(newsletter.image_url) || /\.gif(\?|$)/i.test(newsletter.image_url) ? (
              <Media
                src={newsletter.image_url}
                className="pointer-events-none absolute bottom-0 right-0 w-[48%] max-w-[582px] select-none lg:left-[858px] lg:right-auto lg:w-[582px]"
              />
            ) : (
              <Image
                src={newsletter.image_url}
                alt=""
                width={582}
                height={284}
                sizes="(min-width: 1024px) 582px, 50vw"
                className="pointer-events-none absolute bottom-0 right-0 w-[48%] max-w-[582px] select-none lg:left-[858px] lg:right-auto lg:w-[582px]"
              />
            ))}
        </div>
      )}
    </>
  )
}
