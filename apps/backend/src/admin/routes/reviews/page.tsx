import { defineRouteConfig } from "@medusajs/admin-sdk"
import { StarSolid, Trash } from "@medusajs/icons"
import { Badge, Button, Container, Drawer, Heading, IconButton, Input, Label, Select, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import { useStoreUrl } from "../../lib/site"

type Status = "pending" | "approved" | "hidden"
type Review = {
  id: string
  product_id: string
  rating: number
  title: string | null
  body: string
  name: string
  city: string | null
  verified: boolean
  status: Status
  source: "website" | "admin" | "etsy"
  reply: string | null
  reviewed_at: string
  photos?: string[] | null
  product: { id: string; title: string; handle: string; thumbnail: string | null } | null
}
type ListResponse = { reviews: Review[]; pending: number }

const TABS: [Status | "all", string][] = [
  ["pending", "Waiting"],
  ["approved", "On the website"],
  ["hidden", "Hidden"],
  ["all", "All"],
]

export const Stars = ({ n, size = 16, onPick }: { n: number; size?: number; onPick?: (n: number) => void }) => (
  <span className="inline-flex items-center gap-x-0.5" aria-label={`${n} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((i) =>
      onPick ? (
        <button key={i} type="button" aria-label={`${i} star${i > 1 ? "s" : ""}`} onClick={() => onPick(i)} className="p-0.5">
          <StarSolid style={{ width: size, height: size }} className={i <= n ? "text-[#e0a400]" : "text-ui-fg-disabled"} />
        </button>
      ) : (
        <StarSolid key={i} style={{ width: size, height: size }} className={i <= n ? "text-[#e0a400]" : "text-ui-fg-disabled"} />
      )
    )}
  </span>
)

const SOURCE: Record<Review["source"], string> = { website: "Website", admin: "Added by shop", etsy: "Etsy" }

function ReviewCard({ r, storeUrl }: { r: Review; storeUrl: string }) {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const [reply, setReply] = useState(r.reply ?? "")
  const [replying, setReplying] = useState(false)
  const update = useMutation({
    mutationFn: (body: { status?: Status; reply?: string }) => sdk.client.fetch(`/admin/reviews/${r.id}`, { method: "POST", body }),
    onSuccess: (_, body) => {
      qc.invalidateQueries({ queryKey: ["reviews"] })
      toast.success(body.status === "approved" ? "Approved. It shows on the website within a couple of minutes" : body.status === "hidden" ? "Review hidden" : "Saved")
      setReplying(false)
    },
    onError: (e: Error) => toast.error("Couldn't save", { description: e.message }),
  })
  const remove = useMutation({
    mutationFn: () => sdk.client.fetch(`/admin/reviews/${r.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] })
      toast.success("Review deleted")
    },
  })
  return (
    <div className="flex flex-col gap-y-3 px-6 py-4">
      <div className="flex items-start gap-x-3">
        {r.product?.thumbnail ? (
          <img src={r.product.thumbnail} alt="" className="size-12 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="size-12 shrink-0 rounded-md bg-ui-bg-subtle" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Stars n={r.rating} />
            {r.title && (
              <Text size="small" weight="plus">
                {r.title}
              </Text>
            )}
            <Badge size="2xsmall" color={r.status === "approved" ? "green" : r.status === "pending" ? "orange" : "grey"}>
              {r.status === "approved" ? "On the website" : r.status === "pending" ? "Waiting" : "Hidden"}
            </Badge>
            {r.verified && (
              <Badge size="2xsmall" color="blue">
                Verified buyer
              </Badge>
            )}
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {r.name}
            {r.city ? `, ${r.city}` : ""} · {new Date(r.reviewed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {SOURCE[r.source]} ·{" "}
            {r.product ? (
              <a href={`${storeUrl}/products/${r.product.handle}`} target="_blank" rel="noreferrer" className="underline">
                {r.product.title}
              </a>
            ) : (
              "Deleted product"
            )}
          </Text>
        </div>
      </div>
      <Text size="small" className="whitespace-pre-line">
        {r.body}
      </Text>
      {!!r.photos?.length && (
        <div className="flex gap-2">
          {r.photos.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" title="Open the photo">
              <img src={src} alt="Shopper's photo" className="h-20 w-20 rounded-md border object-cover" />
            </a>
          ))}
        </div>
      )}
      {r.reply && !replying && (
        <div className="rounded-md bg-ui-bg-subtle px-3 py-2">
          <Text size="xsmall" weight="plus">
            Your answer
          </Text>
          <Text size="small" className="whitespace-pre-line">
            {r.reply}
          </Text>
        </div>
      )}
      {replying && (
        <div className="flex flex-col gap-y-2">
          <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Thank you for your kind words…" />
          <div className="flex gap-x-2">
            <Button size="small" onClick={() => update.mutate({ reply })} isLoading={update.isPending}>
              Save answer
            </Button>
            <Button size="small" variant="secondary" onClick={() => setReplying(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {r.status !== "approved" && (
          <Button size="small" onClick={() => update.mutate({ status: "approved" })} isLoading={update.isPending}>
            Approve
          </Button>
        )}
        {r.status !== "hidden" && (
          <Button size="small" variant="secondary" onClick={() => update.mutate({ status: "hidden" })}>
            Hide
          </Button>
        )}
        {!replying && (
          <Button size="small" variant="secondary" onClick={() => setReplying(true)}>
            {r.reply ? "Edit answer" : "Answer publicly"}
          </Button>
        )}
        <IconButton
          size="small"
          variant="transparent"
          aria-label="Delete review"
          onClick={async () => {
            if (await prompt({ title: "Delete this review?", description: "It's removed for good. Hide it instead to keep it.", confirmText: "Delete", cancelText: "Keep" }))
              remove.mutate()
          }}
        >
          <Trash />
        </IconButton>
      </div>
    </div>
  )
}

type NewReview = { product_id: string; rating: number; name: string; city: string; title: string; body: string; reviewed_at: string; source: "admin" | "etsy"; verified: boolean }
const BLANK: NewReview = { product_id: "", rating: 5, name: "", city: "", title: "", body: "", reviewed_at: "", source: "admin", verified: true }

function AddReview({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState<NewReview>(BLANK)
  const [q, setQ] = useState("")
  const { data: products } = useQuery({
    queryKey: ["review-products", q],
    queryFn: () => sdk.admin.product.list({ q: q || undefined, limit: 20, fields: "id,title,thumbnail" }),
    enabled: open,
  })
  const save = useMutation({
    mutationFn: () => sdk.client.fetch("/admin/reviews", { method: "POST", body: { ...f, reviewed_at: f.reviewed_at || undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] })
      toast.success("Review added. It shows on the website within a couple of minutes")
      setF(BLANK)
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error("Couldn't add it", { description: e.message }),
  })
  const set = <K extends keyof NewReview>(k: K, v: NewReview[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>Add a review</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
          <Text size="small" className="text-ui-fg-subtle">
            For genuine reviews customers gave you elsewhere: Etsy, WhatsApp, Google or in person. Copy their words as they wrote them.
          </Text>
          <div className="flex flex-col gap-y-2">
            <Label>Product</Label>
            <Input placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="flex max-h-48 flex-col overflow-y-auto rounded-md shadow-borders-base">
              {(products?.products ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set("product_id", p.id)}
                  className={`flex items-center gap-x-2 px-3 py-2 text-left txt-compact-small ${f.product_id === p.id ? "bg-ui-bg-highlight" : "hover:bg-ui-bg-base-hover"}`}
                >
                  {p.thumbnail ? <img src={p.thumbnail} alt="" className="size-7 rounded object-cover" /> : <span className="size-7 rounded bg-ui-bg-subtle" />}
                  {p.title}
                  {f.product_id === p.id && <span className="ml-auto">✓</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label>Stars</Label>
            <Stars n={f.rating} size={22} onPick={(n) => set("rating", n)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="rv-name">Customer&apos;s name</Label>
              <Input id="rv-name" value={f.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="rv-city">City (optional)</Label>
              <Input id="rv-city" value={f.city} onChange={(e) => set("city", e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="rv-title">Headline (optional)</Label>
            <Input id="rv-title" value={f.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="rv-body">Review</Label>
            <Textarea id="rv-body" rows={5} value={f.body} onChange={(e) => set("body", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="rv-date">Date written</Label>
              <Input id="rv-date" type="date" value={f.reviewed_at} onChange={(e) => set("reviewed_at", e.target.value)} />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>From</Label>
              <Select value={f.source} onValueChange={(v) => set("source", v as NewReview["source"])}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="admin">WhatsApp / in person / other</Select.Item>
                  <Select.Item value="etsy">Etsy</Select.Item>
                </Select.Content>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-x-2 txt-compact-small">
            <input type="checkbox" checked={f.verified} onChange={(e) => set("verified", e.target.checked)} />
            They bought this product (shows “Verified buyer”)
          </label>
        </Drawer.Body>
        <Drawer.Footer>
          <Drawer.Close asChild>
            <Button variant="secondary" size="small">
              Cancel
            </Button>
          </Drawer.Close>
          <Button size="small" disabled={!f.product_id || !f.name.trim() || !f.body.trim()} isLoading={save.isPending} onClick={() => save.mutate()}>
            Add review
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

// Product reviews: approve or hide what shoppers wrote, answer them, and add reviews
// received elsewhere.
const ReviewsPage = () => {
  const storeUrl = useStoreUrl()
  const [tab, setTab] = useState<Status | "all">("pending")
  const [q, setQ] = useState("")
  const [adding, setAdding] = useState(false)
  const { data } = useQuery({
    queryKey: ["reviews", tab, q],
    queryFn: () => sdk.client.fetch<ListResponse>("/admin/reviews", { query: { ...(tab !== "all" ? { status: tab } : {}), ...(q.trim() ? { q: q.trim() } : {}) } }),
  })
  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h1">Reviews</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Shoppers who bought a product can review it. Reviews show on the website after you approve them.
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={() => setAdding(true)}>
          Add a review
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        {TABS.map(([t, label]) => (
          <Button key={t} size="small" variant={tab === t ? "primary" : "transparent"} onClick={() => setTab(t)}>
            {label}
            {t === "pending" && data?.pending ? ` (${data.pending})` : ""}
          </Button>
        ))}
        <Input size="small" type="search" placeholder="Search name or words" className="ml-auto w-56" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!data ? (
        <Text size="small" className="px-6 py-4">
          Loading…
        </Text>
      ) : data.reviews.length === 0 ? (
        <Text size="small" className="px-6 py-8 text-center text-ui-fg-subtle">
          {tab === "pending" ? "Nothing waiting. New reviews from shoppers appear here." : "No reviews here yet."}
        </Text>
      ) : (
        data.reviews.map((r) => <ReviewCard key={r.id} r={r} storeUrl={storeUrl ?? ""} />)
      )}
      <AddReview open={adding} onOpenChange={setAdding} />
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Reviews", icon: StarSolid, rank: 4 })

export default ReviewsPage
