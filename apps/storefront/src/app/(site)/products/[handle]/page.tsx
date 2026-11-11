import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ProductGallery } from "@/components/product-gallery"
import { ProductOptions } from "@/components/product-options"
import { BADGE_CLASSES, badgeOf } from "@/lib/badges"
import { getDeliveryInfo, getProduct, getProductExtras, getProductReviews, getSiteFeatures, isOnSale, salePriceListOf } from "@/lib/data"
import { Breadcrumbs, breadcrumbJsonLd } from "@/components/breadcrumbs"
import { ProductFaq } from "@/components/product-faq"
import { jsonLd as jsonLdHtml } from "@/lib/seo"
import { WishlistHeart } from "@/components/wishlist-heart"
import { ProductReviews } from "@/components/product-reviews"
import { ShareButtons } from "@/components/share-buttons"
import { Stars } from "@/components/stars"
import { SITE_URL } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/products/[handle]">): Promise<Metadata> {
  const { handle } = await params
  const product = await getProduct(handle)
  if (!product) return { title: "Product not found" }
  const meta = (product.metadata ?? {}) as Record<string, unknown>
  const title = (typeof meta.seo_title === "string" && meta.seo_title.trim()) || product.title
  const plain = (product.description ?? "").replace(/\s+/g, " ").trim()
  const description =
    (typeof meta.seo_description === "string" && meta.seo_description.trim()) || (plain.length > 160 ? `${plain.slice(0, 157)}…` : plain) || undefined
  const image = (typeof meta.seo_image === "string" && meta.seo_image) || product.thumbnail || product.images?.[0]?.url
  return {
    ...(meta.seo_noindex === true ? { robots: { index: false, follow: true } } : {}),
    title: { absolute: typeof meta.seo_title === "string" && meta.seo_title.trim() ? title : `${title} | The 64 Squares` },
    description,
    alternates: { canonical: `/products/${product.handle}` },
    openGraph: { siteName: "The 64 Squares", locale: "en_IN", title, description, type: "website", url: `/products/${product.handle}`, images: image ? [{ url: image }] : undefined },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  }
}

async function Product({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const [product, deliveryInfo, features] = await Promise.all([getProduct(handle), getDeliveryInfo(), getSiteFeatures()])
  if (!product) {
    notFound()
  }
  const [{ summary, reviews }, extras] = await Promise.all([
    getProductReviews(product.id),
    getProductExtras(product.id, salePriceListOf(product)),
  ])
  const delivery = deliveryInfo.delivery_text
  const firstInStock =
    (product.variants ?? []).find((v) => !v.manage_inventory || v.allow_backorder || (v.inventory_quantity ?? 0) > 0) ??
    product.variants?.[0]
  const images = product.images ?? []
  const badge = badgeOf(product.metadata, isOnSale(product))
  const meta = (product.metadata ?? {}) as Record<string, string>
  const size = [product.length, product.width, product.height].every(Boolean)
    ? `${product.length} × ${product.width} × ${product.height} cm (L × W × H)`
    : null
  const details = [
    ["Size", size],
    ["Material", product.material],
    ["Assembly", meta.assembly],
    ["Age", meta.age],
  ].filter((d): d is [string, string] => !!d[1])
  const care = typeof meta.care === "string" ? meta.care.trim() : ""
  const rawMeta = (product.metadata ?? {}) as Record<string, unknown>
  const faq = Array.isArray(rawMeta.faq) ? (rawMeta.faq as { q: string; a: string }[]).filter((x) => x?.q && x?.a) : []
  const crumbs = [
    { name: "Shop", path: "/shop" },
    ...(product.categories?.[0] ? [{ name: product.categories[0].name, path: `/shop?category=${product.categories[0].handle}` }] : []),
    { name: product.title, path: `/products/${product.handle}` },
  ]

  // For Google: the product, its price and stock, and its star rating.
  const prices = (product.variants ?? []).map((v) => v.calculated_price?.calculated_amount).filter((n): n is number => typeof n === "number")
  const inStock = (product.variants ?? []).some((v) => !v.manage_inventory || v.allow_backorder || (v.inventory_quantity ?? 0) > 0)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description ?? undefined,
    image: images.map((i) => i.url),
    sku: product.variants?.[0]?.sku ?? undefined,
    brand: { "@type": "Brand", name: "The 64 Squares" },
    url: `${SITE_URL}/products/${product.handle}`,
    ...(prices.length
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "INR",
            lowPrice: Math.min(...prices),
            highPrice: Math.max(...prices),
            offerCount: prices.length,
            availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          },
        }
      : {}),
    ...(features.reviews.enabled && summary.count
      ? {
          aggregateRating: { "@type": "AggregateRating", ratingValue: summary.average, reviewCount: summary.count, bestRating: 5, worstRating: 1 },
          review: reviews.slice(0, 10).map((rv) => ({
            "@type": "Review",
            reviewRating: { "@type": "Rating", ratingValue: rv.rating, bestRating: 5 },
            author: { "@type": "Person", name: rv.name },
            datePublished: rv.date.slice(0, 10),
            reviewBody: rv.body,
            ...(rv.title ? { name: rv.title } : {}),
          })),
        }
      : {}),
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-20 pt-6 lg:px-10 lg:pb-28 lg:pt-8">
      {features.breadcrumbs.enabled && <Breadcrumbs items={crumbs} />}
      <div className="mt-4 grid gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-10">
        <ProductGallery
          title={product.title}
          images={images.map((i) => ({ id: i.id, url: i.url }))}
          variantImages={Object.fromEntries(
            (product.variants ?? []).map((v) => [
              v.id,
              ((v as { images?: { id: string }[] }).images ?? []).map((i) => i.id),
            ])
          )}
          overlay={<WishlistHeart productId={product.id} initialVariantId={firstInStock?.id ?? null} />}
        />
        <div>
          {badge && (
            <span data-badge className={`mb-3 inline-block rounded px-2 py-0.5 text-[12px] font-medium ${BADGE_CLASSES[badge.colour]}`}>
              {badge.text}
            </span>
          )}
          <h1 className="text-[24px] font-bold leading-tight tracking-[-0.02em] lg:text-[30px]">{product.title}</h1>
          {features.reviews.enabled && summary.count > 0 && (
            <a href="#reviews" className="mt-2 inline-flex items-center gap-2 text-[14px] text-muted hover:underline">
              <Stars value={summary.average} size={16} />
              {summary.average.toFixed(1)} · {summary.count} review{summary.count === 1 ? "" : "s"}
            </a>
          )}
          <ProductOptions
            product={product}
            info={{
              dispatch_days: deliveryInfo.dispatch_days,
              transit_days: deliveryInfo.transit_days,
              dispatch_from: deliveryInfo.dispatch_from,
              returns_text: deliveryInfo.returns_text,
              in_carts: extras.in_carts,
              sale_ends_at: features.countdowns.enabled ? extras.sale_ends_at : null,
              back_in_stock: features.back_in_stock.enabled,
            }}
          />
          <div className="mt-8 rounded-md border border-rule bg-chalk px-5 py-4 text-[15px]">
            <p className="font-medium">{delivery}</p>
            <p className="mt-1 text-muted">Enter your pincode at checkout to confirm delivery to your area.</p>
          </div>
          {details.length > 0 && (
            <dl className="mt-8 divide-y divide-rule border-y border-rule text-[14px]">
              {details.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-6 py-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {product.description && (
            <p className="mt-8 max-w-[60ch] text-[16px] leading-[1.7]">{product.description}</p>
          )}
          {features.code_badges.enabled && features.code_badges.code && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-md border border-dashed border-ink px-3 py-2 text-[14px]">
              <span aria-hidden="true">🏷️</span>
              {(features.code_badges.text || "Use code {code} at checkout").split("{code}").map((part, i, all) => (
                <span key={i}>
                  {part}
                  {i < all.length - 1 && <strong className="font-bold tracking-wide">{features.code_badges.code}</strong>}
                </span>
              ))}
            </p>
          )}
          {features.share_buttons.enabled && <ShareButtons path={`/products/${product.handle}`} title={product.title} className="mt-8" />}
          {care && (
            <details className="mt-8 border-y border-rule py-4 text-[15px]">
              <summary className="cursor-pointer font-medium">Care instructions</summary>
              <p className="mt-3 whitespace-pre-line leading-[1.7] text-muted">{care}</p>
            </details>
          )}
        </div>
      </div>
      {features.faq.enabled && faq.length > 0 && <ProductFaq items={faq} />}
      {features.reviews.enabled && <ProductReviews productId={product.id} summary={summary} reviews={reviews} photos={features.reviews.photos} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={breadcrumbJsonLd(crumbs)} />
      {features.faq.enabled && faq.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdHtml({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })),
          })}
        />
      )}
    </div>
  )
}

export default function ProductPage(props: PageProps<"/products/[handle]">) {
  return (
    <Suspense fallback={<div className="h-[900px]" />}>
      <Product params={props.params} />
    </Suspense>
  )
}
