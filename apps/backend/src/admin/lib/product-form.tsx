import {
  ArrowLeftMini,
  ArrowRightMini,
  ArrowUpRightOnBox,
  CloudArrowUp,
  PlusMini,
  SquareDashedCursor,
  XMarkMini,
} from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Label, Select, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { sdk } from "./sdk"
import { useStoreUrl } from "./site"
import { useMe } from "./staff"
import { BadgePicker, type BadgeValue } from "./badge-picker"
import { isConvertedPicture, PICTURE_ACCEPT, uploadImage } from "./upload"
import { PhotoCropper } from "./photo-cropper"
import { useUploadLimits } from "./upload-limits"
import { SeoPanel } from "./seo-panel"
import { FaqEditor } from "./faq-editor"

// The simple The 64 Squares product form: everything about a product on one screen.
// Saved by POST /admin/store-products(/:id) (src/lib/product-form.ts).

type Colour = { name: string; hex: string }
type FormVariant = { colour: string | null; material: string | null; price: number; stock: number | null }
export type ProductFormValue = {
  title: string
  handle?: string | null
  description?: string | null
  status: "published" | "draft"
  material_text?: string | null
  age?: string | null
  assembly?: string | null
  care?: string | null
  lead_time?: string | null
  make_days?: number | null
  engraving?: Engraving | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keyword?: string | null
  seo_image?: string | null
  seo_noindex?: boolean
  faq?: { q: string; a: string }[]
  badge?: BadgeValue | null
  length?: number | null
  width?: number | null
  height?: number | null
  weight?: number | null
  collection_id: string | null
  category_ids: string[]
  materials: string[]
  colours: Colour[]
  variants: FormVariant[]
  images: string[]
  colour_images: Record<string, string[]>
}
type Engraving = { enabled: boolean; label: string; max: number; required: boolean; fee: number }
const ENGRAVING_OFF: Engraving = { enabled: false, label: "Name to engrave", max: 30, required: false, fee: 0 }
const LEAD_TIMES = ["Ready to ship", "Ships in 2-3 days", "Made to order: ships in 7-10 days", "Made to order: ships in 2-3 weeks"]

type Lookups = {
  collections: { id: string; title: string }[]
  categories: { id: string; name: string }[]
  colours: { name: string; hex: string | null }[]
  materials: string[]
}

const EMPTY: ProductFormValue = {
  title: "",
  handle: null,
  description: "",
  status: "published",
  material_text: "",
  age: "",
  assembly: "",
  care: "",
  lead_time: "",
  make_days: null,
  engraving: null,
  seo_title: "",
  seo_description: "",
  seo_keyword: "",
  seo_image: null,
  seo_noindex: false,
  faq: [],
  badge: { kind: "auto" },
  length: null,
  width: null,
  height: null,
  weight: null,
  collection_id: null,
  category_ids: [],
  materials: [],
  colours: [],
  variants: [],
  images: [],
  colour_images: {},
}

const NONE = "__none"
const AGES = ["All ages", "4+ years", "6+ years", "8+ years", "12+ years", "Adults"]

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

const key = (c: string | null, m: string | null) => `${c ?? ""}|${m ?? ""}`
const vTitle = (c: string | null, m: string | null) => [c, m].filter(Boolean).join(" / ") || "Default"

// Every colour × material combination, keeping prices/stock already entered.
const rebuildVariants = (colours: string[], materials: string[], old: FormVariant[]): FormVariant[] => {
  const out: FormVariant[] = []
  for (const m of materials.length ? materials : [null]) {
    for (const c of colours.length ? colours : [null]) {
      const prev = old.find((v) => key(v.colour, v.material) === key(c, m))
      // A new combination starts with the price of the same material (or any) if there is one.
      const like = old.find((v) => v.material === m && v.price > 0) ?? old.find((v) => v.price > 0)
      out.push(prev ?? { colour: c, material: m, price: like?.price ?? 0, stock: like ? like.stock : 10 })
    }
  }
  return out
}

const num = (s: string): number | null => {
  const t = s.replace(/[,₹\s]/g, "")
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{title}</Heading>
        {hint && (
          <Text size="small" className="text-ui-fg-subtle">
            {hint}
          </Text>
        )}
      </div>
      <div className="flex flex-col gap-y-4 px-6 py-4">{children}</div>
    </Container>
  )
}

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {hint}
        </Text>
      )}
    </div>
  )
}

function Swatch({ hex, size = 18 }: { hex: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full shadow-borders-base"
      style={{ backgroundColor: hex, width: size, height: size }}
      aria-hidden
    />
  )
}

// Thumbnails with move-left/right, crop and remove; drop files on the box to upload.
// New photos open the square crop window first (GIFs, which may be animated, skip it).
function PhotoStrip({
  urls,
  onChange,
  label,
  emptyText,
}: {
  urls: string[]
  onChange: (next: string[]) => void
  label: string
  emptyText: string
}) {
  const [busy, setBusy] = useState(0)
  const [over, setOver] = useState(false)
  // Photos waiting in the crop window; replace: the position of an existing photo being re-cropped.
  const [cropping, setCropping] = useState<{ files: File[]; replace?: number } | null>(null)
  const [opening, setOpening] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const send = async (list: File[], replace?: number) => {
    if (!list.length) return
    setBusy(list.length)
    const added: string[] = []
    for (const f of list) {
      try {
        added.push(await uploadImage(f))
      } catch (e) {
        toast.error(`Couldn't upload ${f.name}`, { description: (e as Error).message })
      }
      setBusy((n) => n - 1)
    }
    if (replace !== undefined) {
      if (added[0]) onChange(urls.map((u, i) => (i === replace ? added[0] : u)))
    } else {
      onChange([...urls, ...added])
    }
  }
  const upload = (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("image/") || isConvertedPicture(f))
    if (!list.length) return
    const toCrop = list.filter((f) => f.type !== "image/gif" && !/\.gif$/i.test(f.name) && !/svg/i.test(f.type))
    const asIs = list.filter((f) => !toCrop.includes(f))
    if (asIs.length) send(asIs)
    if (toCrop.length) setCropping({ files: toCrop })
  }
  // Opens an uploaded photo in the crop window again.
  const recrop = async (i: number) => {
    setOpening(i)
    try {
      const res = await fetch(urls[i])
      if (!res.ok) throw new Error(`The photo couldn't be loaded (${res.status}).`)
      const blob = await res.blob()
      const name = decodeURIComponent(urls[i].split("/").pop()?.split("?")[0] || "photo.webp")
      setCropping({ files: [new File([blob], name, { type: blob.type })], replace: i })
    } catch (e) {
      toast.error("Couldn't open the photo", { description: (e as Error).message })
    } finally {
      setOpening(null)
    }
  }
  const move = (i: number, d: -1 | 1) => {
    const next = [...urls]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        upload(e.dataTransfer.files)
      }}
      className={`flex flex-wrap items-center gap-2 rounded-lg p-2 transition-colors ${over ? "bg-ui-bg-highlight shadow-borders-interactive-with-active" : "bg-ui-bg-subtle"}`}
      aria-label={label}
    >
      {urls.map((u, i) => (
        <div key={u} className="group relative size-20 overflow-hidden rounded-md bg-ui-bg-base shadow-borders-base">
          <img src={u} alt="" className="size-full object-cover" />
          {i === 0 && label === "General photos" && (
            <span className="absolute left-1 top-1 rounded bg-ui-bg-base px-1 txt-compact-xsmall shadow-borders-base">Cover</span>
          )}
          <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ui-bg-base/90 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <button type="button" aria-label="Move left" onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 disabled:opacity-30">
              <ArrowLeftMini />
            </button>
            <button type="button" aria-label="Crop photo" title="Crop" onClick={() => recrop(i)} disabled={opening !== null} className="p-0.5 disabled:opacity-30">
              <SquareDashedCursor />
            </button>
            <button type="button" aria-label="Remove photo" onClick={() => onChange(urls.filter((x) => x !== u))} className="p-0.5 text-ui-fg-error">
              <XMarkMini />
            </button>
            <button type="button" aria-label="Move right" onClick={() => move(i, 1)} disabled={i === urls.length - 1} className="p-0.5 disabled:opacity-30">
              <ArrowRightMini />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ui-border-strong text-ui-fg-subtle hover:bg-ui-bg-base-hover"
      >
        <CloudArrowUp />
        <span className="txt-compact-xsmall">{busy ? `Uploading ${busy}…` : "Add"}</span>
      </button>
      {!urls.length && (
        <Text size="xsmall" className="px-2 text-ui-fg-muted">
          {emptyText}
        </Text>
      )}
      <input
        ref={input}
        type="file"
        accept={PICTURE_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) upload(e.target.files)
          e.target.value = ""
        }}
      />
      {cropping && (
        <PhotoCropper
          files={cropping.files}
          onCancel={() => setCropping(null)}
          onDone={(out) => {
            const replace = cropping.replace
            setCropping(null)
            send(out, replace)
          }}
        />
      )}
    </div>
  )
}

export function ProductFormPage({ id }: { id?: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const storeUrl = useStoreUrl()
  const { can } = useMe()
  const canPrice = can("products.prices")
  const canDelete = can("products.delete")
  const { data: limits } = useUploadLimits()
  const photoLimit = limits?.limits.find((l) => l.type === "product_photo")

  const lookups = useQuery({
    queryKey: ["t64-product-lookups"],
    queryFn: () => sdk.client.fetch<Lookups>("/admin/store-products/lookups"),
  })
  const loaded = useQuery({
    queryKey: ["t64-product", id],
    queryFn: () => sdk.client.fetch<{ id: string; form: ProductFormValue }>(`/admin/store-products/${id}`),
    enabled: !!id,
  })

  const [form, setForm] = useState<ProductFormValue>(EMPTY)
  const [original, setOriginal] = useState<string>(JSON.stringify(EMPTY))
  const [handleTouched, setHandleTouched] = useState(false)
  const [newColour, setNewColour] = useState<Colour>({ name: "", hex: "#7fb2e5" })
  const [newMaterial, setNewMaterial] = useState("")
  const [allPrice, setAllPrice] = useState("")
  const [allStock, setAllStock] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (loaded.data) {
      setForm(loaded.data.form)
      setOriginal(JSON.stringify(loaded.data.form))
      setHandleTouched(true)
    }
  }, [loaded.data])

  const dirty = JSON.stringify(form) !== original
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const set = <K extends keyof ProductFormValue>(k: K, v: ProductFormValue[K]) => setForm((f) => ({ ...f, [k]: v }))
  const removedSaved = useMemo(() => {
    if (!id) return [] as string[]
    const was = JSON.parse(original) as ProductFormValue
    return [
      ...was.colours.map((c) => c.name).filter((n) => !form.colours.some((c) => c.name === n)),
      ...was.materials.filter((m) => !form.materials.includes(m)),
    ]
  }, [id, original, form.colours, form.materials])

  const setColours = (colours: Colour[]) =>
    setForm((f) => {
      const images = { ...f.colour_images }
      for (const k of Object.keys(images)) if (!colours.some((c) => c.name === k)) delete images[k]
      return {
        ...f,
        colours,
        colour_images: images,
        variants: rebuildVariants(colours.map((c) => c.name), f.materials, f.variants),
      }
    })
  const setMaterials = (materials: string[]) =>
    setForm((f) => ({
      ...f,
      materials,
      material_text: f.material_text || "",
      variants: rebuildVariants(f.colours.map((c) => c.name), materials, f.variants),
    }))

  const addColour = (c: Colour) => {
    const name = c.name.trim()
    if (!name || form.colours.some((x) => x.name.toLowerCase() === name.toLowerCase())) return
    setColours([...form.colours, { name, hex: c.hex }])
  }
  const addMaterial = (m: string) => {
    const name = m.trim()
    if (!name || form.materials.some((x) => x.toLowerCase() === name.toLowerCase())) return
    setMaterials([...form.materials, name])
  }

  const save = useMutation({
    mutationFn: (body: ProductFormValue) =>
      sdk.client.fetch<{ id: string; form: ProductFormValue }>(id ? `/admin/store-products/${id}` : "/admin/store-products", {
        method: "POST",
        // Half-filled questions are left out.
        body: { ...body, faq: (body.faq ?? []).filter((x) => x.q.trim() && x.a.trim()) },
      }),
    onSuccess: (r) => {
      setError(null)
      setForm(r.form)
      setOriginal(JSON.stringify(r.form))
      qc.invalidateQueries({ queryKey: ["t64-product-lookups"] })
      qc.invalidateQueries({ queryKey: ["products"] })
      qc.invalidateQueries({ queryKey: ["product-prices", r.id] })
      toast.success(id ? "Product saved. The website shows the changes within a minute." : "Product created")
      if (!id) navigate(`/product-editor/${r.id}`, { replace: true })
    },
    onError: (e: Error) => setError(e.message),
  })

  const submit = () => {
    const problems: string[] = []
    if (!form.title.trim()) problems.push("Give the product a name.")
    if (!form.colours.length && !form.materials.length) problems.push("Add at least one colour or material.")
    if (form.variants.some((v) => !(v.price > 0))) problems.push("Every colour/material needs a price above ₹0.")
    if (problems.length) {
      setError(problems.join(" "))
      return
    }
    save.mutate({
      ...form,
      handle: form.handle || slug(form.title),
      description: form.description || null,
    })
  }

  if ((id && loaded.isLoading) || lookups.isLoading) {
    return (
      <Container className="px-6 py-4">
        <Text size="small">Loading…</Text>
      </Container>
    )
  }
  if (id && loaded.error) {
    return (
      <Container className="px-6 py-4">
        <Text size="small">{(loaded.error as Error).message}</Text>
      </Container>
    )
  }
  const lk = lookups.data!
  const unusedColours = lk.colours.filter((c) => !form.colours.some((x) => x.name === c.name))
  const unusedMaterials = lk.materials.filter((m) => !form.materials.includes(m))
  const handle = form.handle ?? slug(form.title)

  return (
    <div className="flex flex-col gap-y-3 pb-24">
      <Container className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h1">{id ? form.title || "Product" : "Add a product"}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Everything about the product on one page. Press Save at the bottom when you're done.
          </Text>
        </div>
        {id && (
          <div className="flex flex-wrap gap-2">
            {storeUrl && form.status === "published" && (
              <Button size="small" variant="secondary" asChild>
                <a href={`${storeUrl}/products/${handle}`} target="_blank" rel="noreferrer">
                  <ArrowUpRightOnBox />
                  View on website
                </a>
              </Button>
            )}
            <Button size="small" variant="secondary" asChild>
              <Link to={`/products/${id}`}>Full product page</Link>
            </Button>
          </div>
        )}
      </Container>

      <Section title="Basics">
        <Field label="Name" htmlFor="pf-title">
          <Input
            id="pf-title"
            value={form.title}
            placeholder="e.g. Walnut Staunton Chess Set"
            onChange={(e) => {
              const title = e.target.value
              setForm((f) => ({ ...f, title, ...(handleTouched ? {} : { handle: slug(title) }) }))
            }}
          />
        </Field>
        <Field label="Description" htmlFor="pf-desc" hint="Shown under the price on the product page.">
          <Textarea id="pf-desc" rows={4} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Web address" htmlFor="pf-handle" hint={`${storeUrl ?? "https://the64squares.in"}/products/${handle || "…"}`}>
            <Input
              id="pf-handle"
              value={form.handle ?? ""}
              onChange={(e) => {
                setHandleTouched(true)
                set("handle", slug(e.target.value) || e.target.value.toLowerCase())
              }}
            />
          </Field>
          <Field label="Show on website" hint={form.status === "published" ? "Shoppers can see and buy it." : "Draft: hidden from shoppers."}>
            <div className="flex h-8 items-center gap-x-2">
              <Switch
                checked={form.status === "published"}
                onCheckedChange={(on) => set("status", on ? "published" : "draft")}
                aria-label="Show on website"
              />
              <Badge size="2xsmall" color={form.status === "published" ? "green" : "grey"}>
                {form.status === "published" ? "Published" : "Draft"}
              </Badge>
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Where it appears">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Collection" hint="Used for the shop's breadcrumb and collections.">
            <Select value={form.collection_id ?? NONE} onValueChange={(v) => set("collection_id", v === NONE ? null : v)}>
              <Select.Trigger aria-label="Collection">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={NONE}>No collection</Select.Item>
                {lk.collections.map((c) => (
                  <Select.Item key={c.id} value={c.id}>
                    {c.title}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </Field>
        </div>
        <Field
          label="Badge"
          htmlFor="pf-badge"
          hint="The little label on the product's photo. Automatic shows “Sale” while a sale price is on. Change where it sits in the shop under Products → Shop order & badges."
        >
          <BadgePicker id="pf-badge" value={form.badge ?? { kind: "auto" }} onChange={(b) => set("badge", b)} />
        </Field>
        <Field label="Categories" hint="Tap to choose. Used for Shop By Categories and the shop filters.">
          <div className="flex flex-wrap gap-2">
            {lk.categories.map((c) => {
              const on = form.category_ids.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("category_ids", on ? form.category_ids.filter((x) => x !== c.id) : [...form.category_ids, c.id])}
                  className={`rounded-full px-3 py-1 txt-compact-small shadow-borders-base transition-colors ${on ? "bg-ui-fg-base text-ui-fg-on-inverted" : "bg-ui-bg-base hover:bg-ui-bg-base-hover"}`}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        </Field>
      </Section>

      <Section title="Details" hint="Shown in the details list on the product page. Leave empty to hide a line.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Age" htmlFor="pf-age">
            <Input id="pf-age" list="pf-ages" value={form.age ?? ""} placeholder="e.g. 2-6 years" onChange={(e) => set("age", e.target.value)} />
            <datalist id="pf-ages">
              {AGES.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>
          <Field label="Assembly" htmlFor="pf-assembly">
            <Input
              id="pf-assembly"
              value={form.assembly ?? ""}
              placeholder="e.g. Comes fully assembled"
              onChange={(e) => set("assembly", e.target.value)}
            />
          </Field>
          <Field label="Material (as shown)" htmlFor="pf-mat" hint="e.g. Pine Wood, Birch Plywood">
            <Input id="pf-mat" value={form.material_text ?? ""} onChange={(e) => set("material_text", e.target.value)} />
          </Field>
          <Field label="Weight (grams)" htmlFor="pf-weight" hint="For delivery charges later.">
            <Input
              id="pf-weight"
              inputMode="numeric"
              value={form.weight ?? ""}
              onChange={(e) => set("weight", num(e.target.value))}
            />
          </Field>
        </div>
        <Field label="Size (cm)" hint="Length × Width × Height. Shown as e.g. 70 × 28 × 80 cm.">
          <div className="grid grid-cols-3 gap-2">
            {(["length", "width", "height"] as const).map((k) => (
              <Input
                key={k}
                inputMode="decimal"
                placeholder={k[0].toUpperCase() + k.slice(1)}
                aria-label={k}
                value={form[k] ?? ""}
                onChange={(e) => set(k, num(e.target.value))}
              />
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Made to order and personalisation" hint="For boards, trophies and gifts that are made or engraved after the order.">
        <Field label="Dispatch time" htmlFor="pf-lead" hint="Shown next to the price, e.g. “Made to order: ships in 7-10 days”. Leave empty for normal stock.">
          <Input id="pf-lead" list="pf-leads" value={form.lead_time ?? ""} placeholder="e.g. Made to order: ships in 7-10 days" onChange={(e) => set("lead_time", e.target.value)} />
          <datalist id="pf-leads">
            {LEAD_TIMES.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Days to make"
          htmlFor="pf-make-days"
          hint="Working days before a made-to-order item is dispatched. Used for the “Arrives by” date; leave empty for stock items (Settings → Payments & delivery has the usual packing time)."
        >
          <Input
            id="pf-make-days"
            className="w-24"
            inputMode="numeric"
            placeholder="e.g. 7"
            value={form.make_days ?? ""}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "")
              set("make_days", v ? Math.min(120, Number(v)) : null)
            }}
          />
        </Field>
        <Field label="Personalisation box" hint="Shoppers type the text (a name, club, date) before adding to cart. It shows on the order, the invoice and the order emails.">
          <div className="flex h-8 items-center gap-x-2">
            <Switch
              checked={!!form.engraving?.enabled}
              onCheckedChange={(on) => set("engraving", on ? { ...(form.engraving ?? ENGRAVING_OFF), enabled: true } : null)}
              aria-label="Personalisation box"
            />
            <Text size="small">{form.engraving?.enabled ? "On" : "Off"}</Text>
          </div>
        </Field>
        {form.engraving?.enabled && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Field label="Box label" htmlFor="pf-eng-label" hint="What shoppers are asked for.">
              <Input
                id="pf-eng-label"
                value={form.engraving.label}
                placeholder="Name to engrave"
                onChange={(e) => set("engraving", { ...form.engraving!, label: e.target.value })}
              />
            </Field>
            <Field label="Most letters" htmlFor="pf-eng-max">
              <Input
                id="pf-eng-max"
                inputMode="numeric"
                value={form.engraving.max}
                onChange={(e) => set("engraving", { ...form.engraving!, max: Math.min(200, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)) })}
              />
            </Field>
            <Field label="Must be filled in">
              <div className="flex h-8 items-center gap-x-2">
                <Switch
                  checked={form.engraving.required}
                  onCheckedChange={(on) => set("engraving", { ...form.engraving!, required: on })}
                  aria-label="Must be filled in"
                />
                <Text size="small">{form.engraving.required ? "Required" : "Optional"}</Text>
              </div>
            </Field>
            <Field label="Extra price" htmlFor="pf-eng-fee" hint="Added when a shopper personalises. 0 = free.">
              <div className="flex items-center gap-x-2">
                <Text size="small">₹</Text>
                <Input
                  id="pf-eng-fee"
                  inputMode="numeric"
                  value={form.engraving.fee ?? 0}
                  onChange={(e) => set("engraving", { ...form.engraving!, fee: Math.min(100000, Number(e.target.value.replace(/\D/g, "")) || 0) })}
                />
              </div>
            </Field>
          </div>
        )}
        <Field label="Care instructions" htmlFor="pf-care" hint="Shown on the product page, e.g. “Wipe with a dry cloth. Keep away from direct sunlight.”">
          <Textarea id="pf-care" rows={3} value={form.care ?? ""} onChange={(e) => set("care", e.target.value)} />
        </Field>
      </Section>

      <Section title="Questions and answers" hint="Common questions about this product, shown on its page (and to Google, which can show them in results). Optional.">
        <FaqEditor value={form.faq ?? []} onChange={(v) => set("faq", v)} />
      </Section>

      <Section title="Search engines (SEO)" hint="How this product looks in Google results and when the link is shared. Leave empty to use the name, description and first photo.">
        <SeoPanel
          value={{ title: form.seo_title || null, description: form.seo_description || null, image_url: form.seo_image ?? null, keyword: form.seo_keyword || null, noindex: !!form.seo_noindex }}
          onChange={(v) => {
            set("seo_title", v.title ?? "")
            set("seo_description", v.description ?? "")
            set("seo_image", v.image_url)
            set("seo_keyword", v.keyword ?? "")
            set("seo_noindex", v.noindex)
          }}
          defaults={{
            title: `${form.title || "Product name"} | The 64 Squares`,
            description: (form.description ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
            image: form.images?.[0] ?? null,
          }}
          path={`/products/${form.handle || "product-name"}`}
          html={form.description ?? ""}
        />
      </Section>

      <Section
        title="Colours and materials"
        hint="Each colour comes in each material. Swatches are shared, so a colour looks the same on every product."
      >
        <Field label="Colours">
          <div className="flex flex-wrap items-center gap-2">
            {form.colours.map((c) => (
              <span key={c.name} className="flex items-center gap-x-1.5 rounded-full bg-ui-bg-base py-1 pl-1.5 pr-1 shadow-borders-base">
                <Swatch hex={c.hex} />
                <span className="txt-compact-small">{c.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => setColours(form.colours.filter((x) => x.name !== c.name))}
                  className="rounded-full p-0.5 text-ui-fg-muted hover:bg-ui-bg-base-hover"
                >
                  <XMarkMini />
                </button>
              </span>
            ))}
            {unusedColours.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => addColour({ name: c.name, hex: c.hex ?? "#d9d9d9" })}
                className="flex items-center gap-x-1.5 rounded-full border border-dashed border-ui-border-strong py-1 pl-1.5 pr-2.5 text-ui-fg-subtle hover:bg-ui-bg-base-hover"
              >
                <Swatch hex={c.hex ?? "#d9d9d9"} size={14} />
                <span className="txt-compact-small">{c.name}</span>
                <PlusMini />
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={newColour.hex}
              onChange={(e) => setNewColour((x) => ({ ...x, hex: e.target.value }))}
              className="size-8 cursor-pointer rounded-md border-0 bg-transparent p-0"
              aria-label="New colour swatch"
            />
            <Input
              size="small"
              className="w-48"
              placeholder="New colour name"
              value={newColour.name}
              onChange={(e) => setNewColour((x) => ({ ...x, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addColour(newColour)
                  setNewColour({ name: "", hex: newColour.hex })
                }
              }}
            />
            <Button
              size="small"
              variant="secondary"
              disabled={!newColour.name.trim()}
              onClick={() => {
                addColour(newColour)
                setNewColour({ name: "", hex: newColour.hex })
              }}
            >
              Add new colour
            </Button>
          </div>
        </Field>
        <Field label="Materials">
          <div className="flex flex-wrap items-center gap-2">
            {form.materials.map((m) => (
              <span key={m} className="flex items-center gap-x-1 rounded-full bg-ui-bg-base py-1 pl-2.5 pr-1 shadow-borders-base">
                <span className="txt-compact-small">{m}</span>
                <button
                  type="button"
                  aria-label={`Remove ${m}`}
                  onClick={() => setMaterials(form.materials.filter((x) => x !== m))}
                  className="rounded-full p-0.5 text-ui-fg-muted hover:bg-ui-bg-base-hover"
                >
                  <XMarkMini />
                </button>
              </span>
            ))}
            {unusedMaterials.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => addMaterial(m)}
                className="flex items-center gap-x-1 rounded-full border border-dashed border-ui-border-strong py-1 pl-2.5 pr-2 text-ui-fg-subtle hover:bg-ui-bg-base-hover"
              >
                <span className="txt-compact-small">{m}</span>
                <PlusMini />
              </button>
            ))}
            <Input
              size="small"
              className="w-48"
              placeholder="New material"
              value={newMaterial}
              onChange={(e) => setNewMaterial(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addMaterial(newMaterial)
                  setNewMaterial("")
                }
              }}
            />
            <Button
              size="small"
              variant="secondary"
              disabled={!newMaterial.trim()}
              onClick={() => {
                addMaterial(newMaterial)
                setNewMaterial("")
              }}
            >
              Add
            </Button>
          </div>
        </Field>
        {removedSaved.length > 0 && (
          <Text size="small" className="text-ui-tag-orange-text">
            Saving removes {removedSaved.join(", ")} from this product (past orders keep them).
            {!canDelete && ' You need "Delete products" for this; ask the admin.'}
          </Text>
        )}
      </Section>

      <Section title="Prices and stock" hint="Price shoppers pay, including GST. Stock is how many you have ready to send.">
        {form.variants.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            Add colours and materials above first.
          </Text>
        ) : (
          <>
            {canPrice ? null : (
              <Text size="small" className="text-ui-tag-orange-text">
                Prices are read-only for you. Ask the admin to switch on "Change prices".
              </Text>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {canPrice && (
                <>
                  <Text size="small" className="text-ui-fg-subtle">
                    Same price for all
                  </Text>
                  <Input size="small" className="w-28" inputMode="decimal" placeholder="₹" value={allPrice} onChange={(e) => setAllPrice(e.target.value)} />
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={!(num(allPrice) && num(allPrice)! > 0)}
                    onClick={() => set("variants", form.variants.map((v) => ({ ...v, price: num(allPrice)! })))}
                  >
                    Apply
                  </Button>
                </>
              )}
              <Text size="small" className="ms-2 text-ui-fg-subtle">
                Same stock for all
              </Text>
              <Input size="small" className="w-20" inputMode="numeric" value={allStock} onChange={(e) => setAllStock(e.target.value.replace(/\D/g, ""))} />
              <Button
                size="small"
                variant="secondary"
                disabled={allStock === ""}
                onClick={() => set("variants", form.variants.map((v) => ({ ...v, stock: Number(allStock) })))}
              >
                Apply
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg shadow-borders-base">
              <table className="w-full">
                <thead className="bg-ui-bg-subtle">
                  <tr className="txt-compact-small-plus text-ui-fg-subtle">
                    <th className="px-3 py-2 text-left font-medium">Version</th>
                    <th className="w-36 px-3 py-2 text-left font-medium">Price (₹)</th>
                    <th className="w-28 px-3 py-2 text-left font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {form.variants.map((v, i) => {
                    const hex = form.colours.find((c) => c.name === v.colour)?.hex
                    const bad = !(v.price > 0)
                    return (
                      <tr key={key(v.colour, v.material)}>
                        <td className="px-3 py-1.5">
                          <span className="flex items-center gap-x-2 txt-compact-small">
                            {hex && <Swatch hex={hex} size={14} />}
                            {vTitle(v.colour, v.material)}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            size="small"
                            inputMode="decimal"
                            aria-label={`Price of ${vTitle(v.colour, v.material)}`}
                            aria-invalid={bad}
                            disabled={!canPrice}
                            value={v.price ? String(v.price) : ""}
                            onChange={(e) => {
                              const next = [...form.variants]
                              next[i] = { ...v, price: num(e.target.value) ?? 0 }
                              set("variants", next)
                            }}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            size="small"
                            inputMode="numeric"
                            aria-label={`Stock of ${vTitle(v.colour, v.material)}`}
                            value={v.stock === null ? "" : String(v.stock)}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, "")
                              const next = [...form.variants]
                              next[i] = { ...v, stock: digits === "" ? 0 : Number(digits) }
                              set("variants", next)
                            }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Text size="xsmall" className="text-ui-fg-subtle">
              For a sale with a crossed-out price, use Sales &amp; price lists.
            </Text>
          </>
        )}
      </Section>

      <Section
        title="Photos"
        hint={`Any photo works, including iPhone HEIC: you pick the square part, and it's shrunk and saved as WebP automatically${photoLimit ? ` (largest allowed after shrinking ${photoLimit.max_mb} MB)` : ""}. Drag files onto a box or press Add; the crop button on a photo crops it again.`}
      >
        <Field label="General photos" hint="Shown for every colour. The first one is the photo on the shop card.">
          <PhotoStrip
            label="General photos"
            urls={form.images}
            onChange={(urls) => set("images", urls)}
            emptyText="Drop photos here"
          />
        </Field>
        {form.colours.length > 0 && (
          <Field
            label="Photos for each colour"
            hint="When a shopper picks a colour, the gallery jumps to that colour's photos."
          >
            <div className="flex flex-col gap-y-2">
              {form.colours.map((c) => (
                <div key={c.name} className="flex flex-col gap-y-1">
                  <span className="flex items-center gap-x-2 txt-compact-small-plus">
                    <Swatch hex={c.hex} size={14} />
                    {c.name}
                  </span>
                  <PhotoStrip
                    label={`Photos for ${c.name}`}
                    urls={form.colour_images[c.name] ?? []}
                    onChange={(urls) => set("colour_images", { ...form.colour_images, [c.name]: urls })}
                    emptyText={`Drop ${c.name} photos here`}
                  />
                </div>
              ))}
            </div>
          </Field>
        )}
      </Section>

      <div className="sticky bottom-0 z-10 -mx-1">
        <Container className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 shadow-elevation-card-hover">
          <Text size="small" className={error ? "text-ui-tag-red-text" : "text-ui-fg-subtle"}>
            {error ?? (dirty ? "You have unsaved changes." : id ? "All changes saved." : "Fill in the product, then press Save.")}
          </Text>
          <div className="flex gap-x-2">
            {id && dirty && (
              <Button
                size="small"
                variant="secondary"
                onClick={() => {
                  setForm(JSON.parse(original))
                  setError(null)
                }}
              >
                Undo changes
              </Button>
            )}
            <Button size="small" isLoading={save.isPending} disabled={!dirty && !!id} onClick={submit}>
              {id ? "Save" : "Create product"}
            </Button>
          </div>
        </Container>
      </div>
    </div>
  )
}
