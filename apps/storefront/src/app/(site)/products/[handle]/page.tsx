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
    <div className="mx-auto max-w-[1440px] px-6 pb-20 pt-6 lg:px-10 lg:pb-28 lg:pt-8">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted">
        <Link href="/shop" className="hover:underline">Shop</Link>
        {product.collection && (
          <>
            {" / "}
            <Link href="/shop" className="hover:underline">{product.collection.title}</Link>
          </>
        )}
      </nav>
      <div className="mt-5 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16">
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
            <span data-badge className={`mb-3 inline-block rounded px-2 py-0.5 text-[12px] font-medium ${BADGE_CLASSES[badge.colour]}`}>
              {badge.text}
            </span>
          )}
          <h1 className="font-display h-page">{product.title}</h1>
          <ProductOptions product={product} />
          <div className="mt-8 rounded-md border border-rule bg-linen px-5 py-4 text-[15px]">
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
