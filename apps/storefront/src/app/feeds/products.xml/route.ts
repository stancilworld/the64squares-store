import { cacheLife, cacheTag } from "next/cache"
import { getRegion } from "@/lib/data"
import { sdk } from "@/lib/medusa"
import { absoluteUrl } from "@/lib/seo"

// The product feed for Google Merchant Center (free listings and Shopping ads) and the Meta
// (Facebook/Instagram) catalogue: one item per product option, in Google's RSS format, which
// both read. Add https://the64squares.in/feeds/products.xml as a scheduled feed in each.

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!)

const plain = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const price = (n: number) => `${n.toFixed(2)} INR`

async function feed() {
  "use cache"
  cacheLife("hours")
  cacheTag("products")
  const region = await getRegion()
  const { products } = await sdk.store.product.list({
    region_id: region?.id,
    limit: 500,
    fields:
      "id,title,handle,description,subtitle,thumbnail,material,weight,+metadata,*images,*categories,*variants.calculated_price,*variants.options,*variants.options.option,*variants.images,+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder,+variants.sku",
  })
  const items: string[] = []
  for (const p of products) {
    const meta = (p.metadata ?? {}) as Record<string, unknown>
    if (meta.seo_noindex === true) continue
    const variants = p.variants ?? []
    const description = plain((typeof meta.seo_description === "string" && meta.seo_description) || p.description || p.subtitle || p.title).slice(0, 4900)
    const category = p.categories?.[0]?.name
    const images = (p.images ?? []).map((i) => i.url).filter(Boolean)
    for (const v of variants) {
      const c = v.calculated_price
      if (!c || typeof c.calculated_amount !== "number") continue
      const sale = typeof c.original_amount === "number" && c.calculated_amount < c.original_amount
      const stock = !v.manage_inventory || v.allow_backorder || (v.inventory_quantity ?? 0) > 0
      const opts = (v.options ?? []).map((o) => o.value).filter(Boolean)
      const title = variants.length > 1 && opts.length ? `${p.title} - ${opts.join(" / ")}` : p.title
      const vImages = (v.images ?? []).map((i) => i.url).filter(Boolean)
      const all = [...new Set([...vImages, ...images, ...(p.thumbnail ? [p.thumbnail] : [])])]
      const optOf = (name: RegExp) => (v.options ?? []).find((o) => name.test(o.option?.title ?? ""))?.value
      items.push(
        [
          "<item>",
          `<g:id>${esc(v.sku || v.id)}</g:id>`,
          `<g:item_group_id>${esc(p.id)}</g:item_group_id>`,
          `<g:title>${esc(title.slice(0, 150))}</g:title>`,
          `<g:description>${esc(description)}</g:description>`,
          `<g:link>${esc(absoluteUrl(`/products/${p.handle}${variants.length > 1 ? `?variant=${v.id}` : ""}`))}</g:link>`,
          all[0] ? `<g:image_link>${esc(absoluteUrl(all[0]))}</g:image_link>` : "",
          ...all.slice(1, 11).map((u) => `<g:additional_image_link>${esc(absoluteUrl(u))}</g:additional_image_link>`),
          `<g:availability>${stock ? "in_stock" : "out_of_stock"}</g:availability>`,
          `<g:price>${price(sale ? c.original_amount! : c.calculated_amount)}</g:price>`,
          sale ? `<g:sale_price>${price(c.calculated_amount)}</g:sale_price>` : "",
          "<g:condition>new</g:condition>",
          "<g:brand>The 64 Squares</g:brand>",
          "<g:identifier_exists>no</g:identifier_exists>",
          "<g:google_product_category>Toys &amp; Games &gt; Games &gt; Board Games</g:google_product_category>",
          category ? `<g:product_type>${esc(category)}</g:product_type>` : "",
          optOf(/colou?r/i) ? `<g:color>${esc(optOf(/colou?r/i))}</g:color>` : "",
          optOf(/material/i) || p.material ? `<g:material>${esc(optOf(/material/i) || p.material)}</g:material>` : "",
          optOf(/size/i) ? `<g:size>${esc(optOf(/size/i))}</g:size>` : "",
          "<g:shipping><g:country>IN</g:country><g:price>0.00 INR</g:price></g:shipping>",
          "</item>",
        ]
          .filter(Boolean)
          .join("")
      )
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>The 64 Squares</title>
<link>${esc(absoluteUrl("/"))}</link>
<description>Premium chess sets, boards, pieces and clocks, made in India.</description>
${items.join("\n")}
</channel>
</rss>`
}

export async function GET() {
  return new Response(await feed(), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } })
}
