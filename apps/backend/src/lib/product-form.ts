import type { MedusaContainer } from "@medusajs/framework/types"
import { type Badge, badgeForMetadata, readBadge } from "./badges"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  batchVariantImagesWorkflow,
  createInventoryLevelsWorkflow,
  createProductOptionsWorkflow,
  createProductVariantsWorkflow,
  createProductsWorkflow,
  setProductProductOptionsWorkflow,
  updateInventoryLevelsWorkflow,
  updateProductOptionsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"

// The simple The 64 Squares product form (admin → Products → Add product (simple)).
//
// Colours and materials are Medusa's shared "Colour" and "Material" option lists: each
// product picks the values it uses, and every colour/material combination is a variant with
// its own price and stock. A colour's swatch colour is kept on the shared value
// (metadata.swatch) so the website, filters and admin all show the same swatch.
//
// Saving brings the product to the state in the form; running it again with the same form
// changes nothing, so a save interrupted halfway is fixed by saving again.

export const COLOUR = "Colour"
export const MATERIAL = "Material"

export type FormVariant = { colour: string | null; material: string | null; price: number; stock: number | null }

export type ProductForm = {
  title: string
  handle?: string | null
  description?: string | null
  status: "published" | "draft"
  material_text?: string | null
  age?: string | null
  assembly?: string | null
  // Extra details kept in product metadata.
  care?: string | null
  lead_time?: string | null
  // Days to make before dispatch (made-to-order); used for the "Arrives by" date.
  make_days?: number | null
  engraving?: Engraving | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keyword?: string | null
  seo_image?: string | null
  seo_noindex?: boolean
  // Questions and answers shown on the product page (and to Google).
  faq?: { q: string; a: string }[]
  badge?: Badge | null
  length?: number | null
  width?: number | null
  height?: number | null
  weight?: number | null
  collection_id: string | null
  category_ids: string[]
  materials: string[]
  colours: { name: string; hex: string }[]
  variants: FormVariant[]
  images: string[]
  colour_images: Record<string, string[]>
}

type Row = Record<string, any>

// Personalisation: a text box on the product page (a name on a board, a line on a trophy).
// fee: rupees added to the item's price when the shopper adds personalisation (0 = free).
export type Engraving = { enabled: boolean; label: string; max: number; required: boolean; fee: number }
export const readEngraving = (meta: Record<string, unknown>): Engraving | null => {
  const e = meta.engraving as Partial<Engraving> | null | undefined
  if (!e || typeof e !== "object" || !e.enabled) return null
  return {
    enabled: true,
    label: typeof e.label === "string" && e.label.trim() ? e.label.trim() : "Engraving text",
    max: Math.min(200, Math.max(1, Number(e.max) || 30)),
    required: !!e.required,
    fee: Math.min(100_000, Math.max(0, Math.round(Number(e.fee) || 0))),
  }
}
const str = (v: unknown) => (typeof v === "string" ? v : "")

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

// Swatches for colours that have none saved yet (same as the website's built-in list).
export const DEFAULT_SWATCHES: Record<string, string> = {
  natural: "#e2c99a",
  maple: "#e8d8b8",
  walnut: "#6b4423",
  rosewood: "#65231f",
  sheesham: "#8a5a35",
  "ebony black": "#1c1a18",
  white: "#ffffff",
  black: "#1c1a18",
}
export const swatchOf = (name: string, metadata?: Record<string, unknown> | null) =>
  (metadata?.swatch as string | undefined) ?? DEFAULT_SWATCHES[name.trim().toLowerCase()] ?? null

const comboKey = (colour: string | null, material: string | null) => `${colour ?? ""}|${material ?? ""}`

export const variantTitle = (colour: string | null, material: string | null) =>
  [colour, material].filter(Boolean).join(" / ") || "Default"

const query = (c: MedusaContainer) => c.resolve(ContainerRegistrationKeys.QUERY)

// ---------------------------------------------------------------- lookups

export const loadSharedOptions = async (container: MedusaContainer) => {
  const { data } = await query(container).graph({
    entity: "product_option",
    fields: ["id", "title", "values.id", "values.value", "values.metadata", "values.rank"],
    filters: { title: [COLOUR, MATERIAL] },
  })
  const byTitle = (t: string) => (data as Row[]).find((o) => o.title === t) ?? null
  return { colour: byTitle(COLOUR), material: byTitle(MATERIAL) }
}

export const loadLookups = async (container: MedusaContainer) => {
  const q = query(container)
  const [{ data: collections }, { data: categories }, shared] = await Promise.all([
    q.graph({ entity: "product_collection", fields: ["id", "title"] }),
    q.graph({ entity: "product_category", fields: ["id", "name", "parent_category_id"] }),
    loadSharedOptions(container),
  ])
  const values = (o: Row | null) =>
    [...((o?.values ?? []) as Row[])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || String(a.value).localeCompare(b.value))
  return {
    collections: (collections as Row[]).map((c) => ({ id: c.id, title: c.title })),
    categories: (categories as Row[]).map((c) => ({ id: c.id, name: c.name })),
    colours: values(shared.colour).map((v) => ({ name: v.value as string, hex: swatchOf(v.value, v.metadata) })),
    materials: values(shared.material).map((v) => v.value as string),
  }
}

// ---------------------------------------------------------------- read

const PRODUCT_FIELDS = [
  "id",
  "title",
  "handle",
  "description",
  "status",
  "material",
  "length",
  "width",
  "height",
  "weight",
  "metadata",
  "collection_id",
  "thumbnail",
  "categories.id",
  "images.id",
  "images.url",
  "images.rank",
  // Real colour-photo links. (variants.images also lists photos tied to no variant.)
  "images.variants.id",
  "options.id",
  "options.title",
  "variants.id",
  "variants.title",
  "variants.sku",
  "variants.manage_inventory",
  "variants.options.value",
  "variants.options.option.title",
  "variants.prices.id",
  "variants.prices.amount",
  "variants.prices.currency_code",
  "variants.prices.rules",
  "variants.inventory_items.inventory_item_id",
]

const loadProduct = async (container: MedusaContainer, id: string) => {
  const { data } = await query(container).graph({ entity: "product", fields: PRODUCT_FIELDS, filters: { id } })
  const product = data[0] as Row | undefined
  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
  }
  return product
}

// Photo URLs linked to each variant id.
const linkedImages = (product: Row) => {
  const map = new Map<string, { id: string; url: string }[]>()
  for (const img of (product.images ?? []) as Row[]) {
    for (const v of (img.variants ?? []) as Row[]) {
      if (!v?.id) continue
      map.set(v.id, [...(map.get(v.id) ?? []), { id: img.id, url: img.url }])
    }
  }
  return map
}

const optionValue = (variant: Row, title: string): string | null =>
  ((variant.options ?? []) as Row[]).find((o) => o?.option?.title === title)?.value ?? null

const inrPrice = (variant: Row) =>
  ((variant.prices ?? []) as Row[]).find((p) => p.currency_code === "inr" && !Object.keys(p.rules ?? {}).length)

export const defaultLocationId = async (container: MedusaContainer) => {
  const store = (await container.resolve(Modules.STORE).listStores({}, { take: 1 }))[0]
  if (store?.default_location_id) {
    return store.default_location_id
  }
  const { data } = await query(container).graph({ entity: "stock_location", fields: ["id"] })
  return ((data[0] as Row | undefined)?.id as string | undefined) ?? null
}

const stockLevels = async (container: MedusaContainer, itemIds: string[], locationId: string | null) => {
  if (!itemIds.length || !locationId) {
    return new Map<string, Row>()
  }
  const { data } = await query(container).graph({
    entity: "inventory_level",
    fields: ["id", "inventory_item_id", "location_id", "stocked_quantity", "reserved_quantity"],
    filters: { inventory_item_id: itemIds, location_id: locationId },
  })
  return new Map((data as Row[]).map((l) => [l.inventory_item_id as string, l]))
}

export const loadForm = async (container: MedusaContainer, id: string): Promise<ProductForm> => {
  const p = await loadProduct(container, id)
  const shared = await loadSharedOptions(container)
  const variants = (p.variants ?? []) as Row[]
  const colours = [...new Set(variants.map((v) => optionValue(v, COLOUR)).filter((c): c is string => !!c))]
  const materials = [...new Set(variants.map((v) => optionValue(v, MATERIAL)).filter((m): m is string => !!m))]
  const swatch = (name: string) =>
    swatchOf(name, ((shared.colour?.values ?? []) as Row[]).find((v) => v.value === name)?.metadata) ?? "#d9d9d9"
  const location = await defaultLocationId(container)
  const levels = await stockLevels(
    container,
    variants.flatMap((v) => ((v.inventory_items ?? []) as Row[]).map((i) => i.inventory_item_id)),
    location
  )
  const images = [...((p.images ?? []) as Row[])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
  const links = linkedImages(p)
  const colourImages: Record<string, string[]> = {}
  for (const c of colours) {
    const urls = new Set<string>()
    for (const v of variants.filter((x) => optionValue(x, COLOUR) === c)) {
      for (const img of links.get(v.id) ?? []) urls.add(img.url)
    }
    colourImages[c] = images.map((i) => i.url as string).filter((u) => urls.has(u))
  }
  const colourUrls = new Set(Object.values(colourImages).flat())
  const meta = (p.metadata ?? {}) as Record<string, unknown>
  return {
    title: p.title,
    handle: p.handle,
    description: p.description ?? "",
    status: p.status === "published" ? "published" : "draft",
    material_text: p.material ?? "",
    age: (meta.age as string) ?? "",
    assembly: (meta.assembly as string) ?? "",
    care: str(meta.care),
    lead_time: str(meta.lead_time),
    make_days: typeof meta.make_days === "number" ? meta.make_days : null,
    engraving: readEngraving(meta),
    seo_title: str(meta.seo_title),
    seo_description: str(meta.seo_description),
    seo_keyword: str(meta.seo_keyword),
    seo_image: str(meta.seo_image),
    seo_noindex: meta.seo_noindex === true,
    faq: Array.isArray(meta.faq) ? (meta.faq as { q: string; a: string }[]).filter((x) => x?.q && x?.a) : [],
    badge: readBadge(meta),
    length: p.length ?? null,
    width: p.width ?? null,
    height: p.height ?? null,
    weight: p.weight ?? null,
    collection_id: p.collection_id ?? null,
    category_ids: ((p.categories ?? []) as Row[]).map((c) => c.id),
    materials,
    colours: colours.map((name) => ({ name, hex: swatch(name) })),
    variants: variants.map((v) => {
      const item = ((v.inventory_items ?? []) as Row[])[0]?.inventory_item_id
      const level = item ? levels.get(item) : undefined
      return {
        colour: optionValue(v, COLOUR),
        material: optionValue(v, MATERIAL),
        price: Number(inrPrice(v)?.amount ?? 0),
        stock: v.manage_inventory === false ? null : Number(level?.stocked_quantity ?? 0),
      }
    }),
    // General photos: the ones not tied to a colour.
    images: images.map((i) => i.url as string).filter((u) => !colourUrls.has(u)),
    colour_images: colourImages,
  }
}

// ---------------------------------------------------------------- validate

export const validateForm = (f: ProductForm) => {
  const problems: string[] = []
  if (!f.title.trim()) problems.push("Give the product a name.")
  const lower = (a: string[]) => a.map((x) => x.trim().toLowerCase())
  const colourNames = f.colours.map((c) => c.name.trim())
  if (new Set(lower(colourNames)).size !== colourNames.length) problems.push("A colour is listed twice.")
  if (new Set(lower(f.materials)).size !== f.materials.length) problems.push("A material is listed twice.")
  if (colourNames.some((c) => !c) || f.materials.some((m) => !m.trim())) problems.push("A colour or material has no name.")
  if (!colourNames.length && !f.materials.length) problems.push("Add at least one colour or material.")
  for (const c of f.colours) {
    if (!/^#[0-9a-f]{6}$/i.test(c.hex)) problems.push(`Pick a swatch colour for ${c.name}.`)
  }
  const want = new Set<string>()
  for (const c of colourNames.length ? colourNames : [null]) {
    for (const m of f.materials.length ? f.materials : [null]) want.add(comboKey(c, m))
  }
  const got = new Set(f.variants.map((v) => comboKey(v.colour, v.material)))
  if (got.size !== f.variants.length || got.size !== want.size || [...want].some((k) => !got.has(k))) {
    problems.push("Prices don't match the colours and materials. Reload the page and try again.")
  }
  for (const v of f.variants) {
    if (!(v.price > 0)) problems.push(`Set a price for ${variantTitle(v.colour, v.material)}.`)
    if (v.stock !== null && (!Number.isInteger(v.stock) || v.stock < 0)) {
      problems.push(`Stock for ${variantTitle(v.colour, v.material)} must be a whole number.`)
    }
  }
  if (problems.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, [...new Set(problems)].join(" "))
  }
}

// ---------------------------------------------------------------- save

// Makes sure the shared option exists and has these values (and swatches), keeping every
// value other products use. Returns value name → id.
const ensureShared = async (
  container: MedusaContainer,
  title: string,
  wanted: { value: string; swatch?: string }[]
): Promise<{ id: string; ids: Map<string, string> }> => {
  const shared = await loadSharedOptions(container)
  let option = title === COLOUR ? shared.colour : shared.material
  const values = (option?.values ?? []) as Row[]
  const needsChange =
    !option ||
    wanted.some((w) => {
      const v = values.find((x) => x.value === w.value)
      return !v || (w.swatch && v.metadata?.swatch !== w.swatch)
    })
  if (!option && wanted.length) {
    await createProductOptionsWorkflow(container).run({
      input: {
        product_options: [
          {
            title,
            is_exclusive: false,
            values: wanted.map((w) => ({ value: w.value, ...(w.swatch ? { metadata: { swatch: w.swatch } } : {}) })),
          },
        ] as never,
      },
    })
  } else if (option && needsChange) {
    const next = [
      ...values.map((v) => {
        const w = wanted.find((x) => x.value === v.value)
        return { value: v.value, metadata: { ...(v.metadata ?? {}), ...(w?.swatch ? { swatch: w.swatch } : {}) } }
      }),
      ...wanted
        .filter((w) => !values.some((v) => v.value === w.value))
        .map((w) => ({ value: w.value, ...(w.swatch ? { metadata: { swatch: w.swatch } } : {}) })),
    ]
    await updateProductOptionsWorkflow(container).run({
      input: { selector: { id: option.id }, update: { values: next } } as never,
    })
  }
  const after = await loadSharedOptions(container)
  option = title === COLOUR ? after.colour : after.material
  return {
    id: option?.id ?? "",
    ids: new Map(((option?.values ?? []) as Row[]).map((v) => [v.value as string, v.id as string])),
  }
}

const defaults = async (container: MedusaContainer) => {
  const store = (await container.resolve(Modules.STORE).listStores({}, { take: 1 }))[0]
  const fulfillment = container.resolve(Modules.FULFILLMENT)
  const profiles = await fulfillment.listShippingProfiles({ type: "default" }, { take: 1 })
  const fallback = profiles.length ? profiles : await fulfillment.listShippingProfiles({}, { take: 1 })
  return { salesChannelId: store?.default_sales_channel_id ?? null, shippingProfileId: fallback[0]?.id ?? null }
}

const uniqueHandle = async (container: MedusaContainer, wanted: string, ownId: string | null) => {
  const base = slug(wanted) || `product-${Date.now()}`
  let handle = base
  for (let i = 2; i < 50; i++) {
    const { data } = await query(container).graph({ entity: "product", fields: ["id"], filters: { handle } })
    const other = (data as Row[]).find((p) => p.id !== ownId)
    if (!other) return handle
    handle = `${base}-${i}`
  }
  return `${base}-${Date.now()}`
}

export type SaveCheck = { canChangePrices: boolean; canDelete: boolean }

export const saveForm = async (
  container: MedusaContainer,
  id: string | null,
  f: ProductForm,
  check: SaveCheck
): Promise<string> => {
  validateForm(f)
  const colours = f.colours.map((c) => ({ name: c.name.trim(), hex: c.hex.toLowerCase() }))
  const materials = f.materials.map((m) => m.trim())
  const existing = id ? await loadProduct(container, id) : null

  // Permission checks for moderators (Settings → Staff & permissions).
  const before = new Map<string, Row>()
  for (const v of (existing?.variants ?? []) as Row[]) {
    before.set(comboKey(optionValue(v, COLOUR), optionValue(v, MATERIAL)), v)
  }
  if (!check.canChangePrices) {
    const changed = f.variants.some((v) => {
      const old = before.get(comboKey(v.colour, v.material))
      return !old || Number(inrPrice(old)?.amount ?? NaN) !== v.price
    })
    if (changed) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        'Setting prices (including for a new colour or material) needs "Change prices". Ask the admin to switch it on for you.'
      )
    }
  }
  const wantedKeys = new Set(f.variants.map((v) => comboKey(v.colour, v.material)))
  const removing = [...before.keys()].filter((k) => !wantedKeys.has(k))
  if (removing.length && !check.canDelete) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      'Removing a colour or material deletes those versions of the product, which needs "Delete products". Ask the admin.'
    )
  }

  // 1. Shared colour and material lists.
  const colourOpt = colours.length
    ? await ensureShared(container, COLOUR, colours.map((c) => ({ value: c.name, swatch: c.hex })))
    : null
  const materialOpt = materials.length ? await ensureShared(container, MATERIAL, materials.map((m) => ({ value: m }))) : null

  const handle = await uniqueHandle(container, f.handle?.trim() || f.title, id)
  const skuBase = handle.toUpperCase()
  const variantInput = f.variants.map((v) => {
    const old = before.get(comboKey(v.colour, v.material))
    const options: Record<string, string> = {}
    if (v.colour) options[COLOUR] = v.colour
    if (v.material) options[MATERIAL] = v.material
    return {
      ...(old ? { id: old.id } : {}),
      title: variantTitle(v.colour, v.material),
      ...(old?.sku ? {} : { sku: [skuBase, slug(v.colour ?? ""), slug(v.material ?? "")].filter(Boolean).join("-").toUpperCase() }),
      ...(old ? {} : { manage_inventory: true }),
      options,
      prices: [{ currency_code: "inr", amount: v.price }],
    }
  })
  const imageIds = new Map(((existing?.images ?? []) as Row[]).map((i) => [i.url as string, i.id as string]))
  const allImages = [...new Set([...f.images, ...Object.values(f.colour_images).flat()])]
  const images = allImages.map((url) => (imageIds.has(url) ? { id: imageIds.get(url)!, url } : { url }))
  const fields = {
    title: f.title.trim(),
    handle,
    description: f.description?.trim() || null,
    status: f.status,
    material: f.material_text?.trim() || null,
    length: f.length ?? null,
    width: f.width ?? null,
    height: f.height ?? null,
    weight: f.weight ?? null,
    collection_id: f.collection_id || null,
    categories: f.category_ids.map((cid) => ({ id: cid })),
    metadata: { ...((existing?.metadata ?? {}) as Record<string, unknown>), age: f.age?.trim() || null, assembly: f.assembly?.trim() || null,
      ...(f.care !== undefined ? { care: f.care?.trim() || null } : {}),
      ...(f.lead_time !== undefined ? { lead_time: f.lead_time?.trim() || null } : {}),
      ...(f.make_days !== undefined ? { make_days: f.make_days ?? null } : {}),
      ...(f.engraving !== undefined ? { engraving: f.engraving?.enabled ? f.engraving : null } : {}),
      ...(f.seo_title !== undefined ? { seo_title: f.seo_title?.trim() || null } : {}),
      ...(f.seo_description !== undefined ? { seo_description: f.seo_description?.trim() || null } : {}),
      ...(f.seo_keyword !== undefined ? { seo_keyword: f.seo_keyword?.trim() || null } : {}),
      ...(f.seo_image !== undefined ? { seo_image: f.seo_image || null } : {}),
      ...(f.seo_noindex !== undefined ? { seo_noindex: f.seo_noindex } : {}),
      ...(f.faq !== undefined ? { faq: f.faq.length ? f.faq : null } : {}),
      ...(f.badge !== undefined ? { badge: badgeForMetadata(f.badge) } : {}) },
    images,
    thumbnail: f.images[0] ?? allImages[0] ?? null,
  }

  let productId = id
  if (!existing) {
    // 2a. New product.
    const d = await defaults(container)
    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            ...fields,
            ...(d.salesChannelId ? { sales_channels: [{ id: d.salesChannelId }] } : {}),
            ...(d.shippingProfileId ? { shipping_profile_id: d.shippingProfileId } : {}),
            options: [
              ...(colourOpt ? [{ id: colourOpt.id, value_ids: colours.map((c) => colourOpt.ids.get(c.name)!) }] : []),
              ...(materialOpt ? [{ id: materialOpt.id, value_ids: materials.map((m) => materialOpt.ids.get(m)!) }] : []),
            ],
            variants: variantInput,
          },
        ] as never,
      },
    })
    productId = result[0].id
  } else {
    // 2b. Existing product: link any new colours/materials, save everything, then unlink
    // the ones no longer used.
    const linked = new Map(((existing.options ?? []) as Row[]).map((o) => [o.title as string, o.id as string]))
    const usedBefore = (title: string) =>
      new Set(((existing.variants ?? []) as Row[]).map((v) => optionValue(v, title)).filter((x): x is string => !!x))
    const addList: { product_option_id: string; product_option_value_ids: string[] }[] = []
    const updList: { product_option_id: string; add?: string[]; remove?: string[] }[] = []
    const plan = (opt: { id: string; ids: Map<string, string> } | null, title: string, names: string[]) => {
      if (!opt) return
      const ids = names.map((n) => opt.ids.get(n)!).filter(Boolean)
      if (!linked.has(title)) {
        addList.push({ product_option_id: opt.id, product_option_value_ids: ids })
      } else {
        const had = usedBefore(title)
        const add = names.filter((n) => !had.has(n)).map((n) => opt.ids.get(n)!).filter(Boolean)
        if (add.length) updList.push({ product_option_id: opt.id, add })
      }
    }
    plan(colourOpt, COLOUR, colours.map((c) => c.name))
    plan(materialOpt, MATERIAL, materials)
    if (addList.length || updList.length) {
      await setProductProductOptionsWorkflow(container).run({
        input: { product_id: existing.id, add: addList, update: updList } as never,
      })
    }

    // New combinations are made first (this also sets up their stock tracking), then the
    // whole product is saved with every variant; combinations left out are deleted.
    const fresh = variantInput.filter((v) => !("id" in v))
    let created: Row[] = []
    if (fresh.length) {
      const { result } = await createProductVariantsWorkflow(container).run({
        input: { product_variants: fresh.map((v) => ({ ...v, product_id: existing.id })) } as never,
      })
      created = result as Row[]
    }
    const allVariants = variantInput.map((v) => {
      if ("id" in v) return v
      const made = created.find((c) => c.title === v.title)
      return made ? { ...v, id: made.id, manage_inventory: undefined } : v
    })
    await updateProductsWorkflow(container).run({
      input: { selector: { id: existing.id }, update: { ...fields, variants: allVariants } } as never,
    })

    const removeList: { product_option_id: string; remove: string[] }[] = []
    const unlink: string[] = []
    const prune = (title: string, opt: { id: string; ids: Map<string, string> } | null, names: string[]) => {
      const optionId = linked.get(title)
      if (!optionId) return
      if (!names.length) {
        unlink.push(optionId)
        return
      }
      const shared = opt?.ids ?? new Map<string, string>()
      const gone = [...usedBefore(title)].filter((n) => !names.includes(n)).map((n) => shared.get(n)!).filter(Boolean)
      if (gone.length) removeList.push({ product_option_id: optionId, remove: gone })
    }
    prune(COLOUR, colourOpt, colours.map((c) => c.name))
    prune(MATERIAL, materialOpt, materials)
    if (removeList.length || unlink.length) {
      await setProductProductOptionsWorkflow(container).run({
        input: { product_id: existing.id, update: removeList, remove: unlink } as never,
      })
    }
  }

  // 3. Colour photos and stock, using the saved variants.
  const saved = await loadProduct(container, productId!)
  const urlToId = new Map(((saved.images ?? []) as Row[]).map((i) => [i.url as string, i.id as string]))
  const savedLinks = linkedImages(saved)
  for (const v of (saved.variants ?? []) as Row[]) {
    const colour = optionValue(v, COLOUR)
    const want = new Set((colour ? f.colour_images[colour] ?? [] : []).map((u) => urlToId.get(u)).filter((x): x is string => !!x))
    const have = new Set((savedLinks.get(v.id) ?? []).map((i) => i.id))
    const add = [...want].filter((x) => !have.has(x))
    const remove = [...have].filter((x) => !want.has(x))
    if (add.length || remove.length) {
      await batchVariantImagesWorkflow(container).run({ input: { variant_id: v.id, add, remove } })
    }
  }

  const location = await defaultLocationId(container)
  if (location) {
    const items = ((saved.variants ?? []) as Row[]).map((v) => ({
      v,
      item: ((v.inventory_items ?? []) as Row[])[0]?.inventory_item_id as string | undefined,
    }))
    const levels = await stockLevels(container, items.map((x) => x.item).filter((x): x is string => !!x), location)
    const creates: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
    const updates: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
    for (const { v, item } of items) {
      const form = f.variants.find((x) => x.colour === optionValue(v, COLOUR) && x.material === optionValue(v, MATERIAL))
      if (!item || !form || form.stock === null) continue
      const level = levels.get(item)
      if (!level) creates.push({ inventory_item_id: item, location_id: location, stocked_quantity: form.stock })
      else if (Number(level.stocked_quantity) !== form.stock) {
        updates.push({ inventory_item_id: item, location_id: location, stocked_quantity: form.stock })
      }
    }
    if (creates.length) {
      await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: creates } })
    }
    if (updates.length) {
      await updateInventoryLevelsWorkflow(container).run({ input: { updates } })
    }
  }
  return productId!
}
