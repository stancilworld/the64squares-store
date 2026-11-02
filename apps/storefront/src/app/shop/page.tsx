import type { Metadata } from "next"
import { Suspense } from "react"
import { ProductGrid } from "@/components/product-grid"
import { ShopFilters, type FilterGroup } from "@/components/shop-filters"
import { getCategories, getProductCards } from "@/lib/data"

export const metadata: Metadata = { title: "Shop" }

type Search = Record<string, string | string[] | undefined>

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : v ?? "").split(",").filter(Boolean)

async function Shop({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams
  const [products, categories] = await Promise.all([
    getProductCards(),
    getCategories(),
  ])

  const wanted = {
    category: list(sp.category),
    material: list(sp.material),
    colour: list(sp.colour),
    availability: list(sp.availability),
  }
  const q = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase()

  const catIds = categories.filter((c) => wanted.category.includes(c.handle)).map((c) => c.id)

  const filtered = products.filter(
    (p) =>
      (!q || p.title.toLowerCase().includes(q)) &&
      (!catIds.length || p.categoryIds.some((id) => catIds.includes(id))) &&
      (!wanted.material.length || p.materials.some((m) => wanted.material.includes(m))) &&
      (!wanted.colour.length || p.colours.some((c) => wanted.colour.includes(c))) &&
      (!wanted.availability.length ||
        (wanted.availability.includes("in-stock") && p.inStock) ||
        (wanted.availability.includes("sold-out") && !p.inStock))
  )

  const allMaterials = [...new Set(products.flatMap((p) => p.materials))].sort()
  const allColours = [...new Set(products.flatMap((p) => p.colours))].sort()

  const groups: FilterGroup[] = [
    { key: "category", label: "Category", options: categories.map((c) => ({ value: c.handle, label: c.name })) },
    { key: "material", label: "Material", options: allMaterials.map((m) => ({ value: m, label: m })) },
    { key: "colour", label: "Colour", options: allColours.map((c) => ({ value: c, label: c, swatch: true })) },
    {
      key: "delivery",
      label: "Delivery",
      options: [],
      note: "Free delivery across India. Check your pincode on each product.",
    },
    {
      key: "availability",
      label: "Availability",
      options: [
        { value: "in-stock", label: "In stock" },
        { value: "sold-out", label: "Sold out" },
      ],
    },
  ]

  const oneCategory =
    wanted.category.length === 1 ? categories.find((c) => c.handle === wanted.category[0]) : undefined
  const title = q
    ? `Results for "${sp.q}"`
    : oneCategory
      ? oneCategory.name
      : "All products"

  return (
    <>
      <div className="bg-velvet text-white">
        <div className="mx-auto max-w-[1440px] px-6 py-10 lg:px-10 lg:py-14">
          <h1 className="font-display h-page">{title}</h1>
          <p className="mt-2 text-[15px] text-maple">
            {filtered.length} {filtered.length === 1 ? "product" : "products"}
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-[1440px] px-6 pb-20 pt-8 lg:grid lg:grid-cols-[220px_1fr] lg:gap-10 lg:px-10 lg:pb-28 lg:pt-10">
        <div className="mb-8 lg:mb-0">
          <ShopFilters groups={groups} />
        </div>
        <div>
          <ProductGrid key={JSON.stringify(sp)} products={filtered} />
        </div>
      </div>
    </>
  )
}

export default function ShopPage(props: PageProps<"/shop">) {
  return (
    <Suspense fallback={<div className="h-[900px] bg-white" />}>
      <Shop searchParams={props.searchParams} />
    </Suspense>
  )
}
