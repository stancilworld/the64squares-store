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
    ? `results for "${sp.q}"`
    : oneCategory
      ? oneCategory.name.toLowerCase()
      : "all products"

  return (
    <>
      <div className="relative h-[180px] w-full bg-placeholder md:h-[347px]">
      </div>
      <div className="mx-auto max-w-[1440px] px-5 pb-[96px] lg:grid lg:grid-cols-[192px_1fr] lg:pl-[53px] lg:pr-[88px] lg:pb-[150px]">
        <h1 className="col-start-2 py-10 text-center font-display text-[56px] lg:pb-[50px] lg:pt-[59px] lg:text-[96px]">
          {title}
        </h1>
        <div className="col-start-1 row-start-2 mb-8 lg:mb-0 lg:mt-[1px] lg:border-r-[3px] lg:border-rule lg:pr-[0px]">
          <ShopFilters groups={groups} />
        </div>
        <div className="col-start-2 row-start-2 lg:pl-[53px]">
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
