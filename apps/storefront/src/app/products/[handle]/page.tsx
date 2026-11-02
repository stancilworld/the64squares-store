import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ProductGallery } from "@/components/product-gallery"
import { ProductOptions } from "@/components/product-options"
import { BADGE_CLASSES, badgeOf } from "@/lib/badges"
import { getDeliveryText, getProduct, isOnSale } from "@/lib/data"

async function Product({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const [product, delivery] = await Promise.all([getProduct(handle), getDeliveryText()])
  if (!product) {
    notFound()
  }
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

  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-[120px] pt-8 lg:px-[128px] lg:pt-[56px]">
      <nav aria-label="Breadcrumb" className="text-[15px] text-black/60">
        <Link href="/shop" className="hover:underline">Shop</Link>
        {product.collection && (
          <>
            {" / "}
            <Link href="/shop" className="hover:underline">{product.collection.title}</Link>
          </>
        )}
      </nav>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_480px] lg:gap-[72px]">
        <ProductGallery
          title={product.title}
          images={images.map((i) => ({ id: i.id, url: i.url }))}
          variantImages={Object.fromEntries(
            (product.variants ?? []).map((v) => [
              v.id,
              ((v as { images?: { id: string }[] }).images ?? []).map((i) => i.id),
            ])
          )}
        />
        <div>
          {badge && (
            <span data-badge className={`mb-3 inline-block rounded-full px-3 py-1 text-[14px] font-medium ${BADGE_CLASSES[badge.colour]}`}>
              {badge.text}
            </span>
          )}
          <h1 className="font-display text-[56px] leading-[0.9] lg:text-[84px]">{product.title}</h1>
          <ProductOptions product={product} />
          <div className="mt-10 rounded-[24px] bg-pill px-6 py-5 text-[16px]">
            <p className="font-medium">{delivery}</p>
            <p className="mt-1 text-black/70">Enter your pincode at checkout to confirm delivery to your area.</p>
          </div>
          {details.length > 0 && (
            <dl className="mt-10 divide-y divide-black/10 border-y border-black/10 text-[16px]">
              {details.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-6 py-3">
                  <dt className="text-black/60">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {product.description && (
            <p className="mt-8 text-[16px] leading-[26px]">{product.description}</p>
          )}
        </div>
      </div>
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
