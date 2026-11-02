import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowDownMini, ArrowUpMini, ArrowUpRightOnBox, BarsThree, Photo } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { BadgePicker, type BadgeValue } from "../../lib/badge-picker"
import { sdk } from "../../lib/sdk"
import { useStoreUrl } from "../../lib/site"

type Row = { id: string; title: string; handle: string; thumbnail: string | null; status: string; badge: BadgeValue }

const key = (rows: Row[]) => JSON.stringify(rows.map((r) => [r.id, r.badge]))

// Products → Shop order & badges: drag products into the order the shop shows them, and pick
// each one's badge. New products show at the top until the order is saved again.
const ShopOrderPage = () => {
  const qc = useQueryClient()
  const storeUrl = useStoreUrl()
  const { data } = useQuery({ queryKey: ["shop-order"], queryFn: () => sdk.client.fetch<{ products: Row[] }>("/admin/shop-order") })
  const [rows, setRows] = useState<Row[] | null>(null)
  const [saved, setSaved] = useState("")
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [filter, setFilter] = useState("")
  useEffect(() => {
    if (data) {
      setRows(data.products)
      setSaved(key(data.products))
    }
  }, [data])
  const dirty = !!rows && key(rows) !== saved
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const save = useMutation({
    mutationFn: (list: Row[]) =>
      sdk.client.fetch<{ products: Row[] }>("/admin/shop-order", {
        method: "POST",
        body: { order: list.map((r) => r.id), badges: Object.fromEntries(list.map((r) => [r.id, r.badge])) },
      }),
    onSuccess: (r) => {
      qc.setQueryData(["shop-order"], r)
      toast.success("Saved. The shop shows the new order within a minute.")
    },
    onError: (e: Error) => toast.error("Couldn't save", { description: e.message }),
  })

  if (!rows) {
    return (
      <Container className="px-6 py-4">
        <Text size="small">Loading…</Text>
      </Container>
    )
  }

  const moveTo = (from: number, to: number) => {
    if (from === to || to < 0 || to >= rows.length) return
    const next = [...rows]
    const [r] = next.splice(from, 1)
    next.splice(to, 0, r)
    setRows(next)
  }
  const setBadge = (i: number, badge: BadgeValue) => setRows(rows.map((r, j) => (j === i ? { ...r, badge } : r)))
  const q = filter.trim().toLowerCase()

  return (
    <div className="flex flex-col gap-y-3 pb-20">
      <Container className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div className="max-w-2xl">
          <Heading level="h1">Shop order &amp; badges</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Drag products (or use the arrows) into the order you want on the shop page; the first ones are seen first. Pick
            a badge to put a little label like “New” or “Bestseller” on a product's photo. Products you add later show at
            the top until you save here again.
          </Text>
        </div>
        {storeUrl && (
          <Button size="small" variant="secondary" asChild>
            <a href={`${storeUrl}/shop`} target="_blank" rel="noreferrer">
              <ArrowUpRightOnBox />
              View shop
            </a>
          </Button>
        )}
      </Container>

      <Container className="divide-y p-0">
        <div className="flex items-center justify-between gap-3 px-6 py-3">
          <Text size="small" className="text-ui-fg-subtle">
            {rows.length} products
          </Text>
          <Input size="small" type="search" className="w-56" placeholder="Find a product" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {rows.length === 0 && (
          <Text size="small" className="px-6 py-6 text-ui-fg-subtle">
            No products yet.
          </Text>
        )}
        {rows.map((r, i) =>
          q && !r.title.toLowerCase().includes(q) ? null : (
            <div
              key={r.id}
              data-row={r.id}
              draggable={!q}
              onDragStart={(e) => {
                setDragging(i)
                e.dataTransfer.effectAllowed = "move"
              }}
              onDragOver={(e) => {
                if (dragging === null) return
                e.preventDefault()
                setOver(i)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragging !== null) moveTo(dragging, i)
                setDragging(null)
                setOver(null)
              }}
              onDragEnd={() => {
                setDragging(null)
                setOver(null)
              }}
              className={`flex flex-wrap items-center gap-3 px-6 py-3 ${dragging === i ? "opacity-40" : ""} ${
                over === i && dragging !== null && dragging !== i ? "bg-ui-bg-highlight" : ""
              }`}
            >
              <span className={q ? "text-ui-fg-disabled" : "cursor-grab text-ui-fg-muted"} title="Drag to move">
                <BarsThree />
              </span>
              <span className="w-6 text-right txt-compact-small text-ui-fg-subtle">{i + 1}</span>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ui-bg-subtle">
                {r.thumbnail ? <img src={r.thumbnail} alt="" className="h-full w-full object-cover" /> : <Photo className="text-ui-fg-muted" />}
              </div>
              <div className="min-w-[160px] flex-1">
                <a href={`/app/product-editor/${r.id}`} className="txt-compact-small-plus hover:underline">
                  {r.title}
                </a>
                {r.status !== "published" && (
                  <Badge size="2xsmall" color="grey" className="ms-2">
                    Draft
                  </Badge>
                )}
              </div>
              <BadgePicker value={r.badge} onChange={(b) => setBadge(i, b)} />
              <div className="flex">
                <button type="button" aria-label="Move to top" title="Move to top" className="rounded px-1.5 py-1 txt-compact-xsmall hover:bg-ui-bg-base-hover disabled:opacity-30" disabled={i === 0} onClick={() => moveTo(i, 0)}>
                  Top
                </button>
                <button type="button" aria-label="Move up" className="rounded p-1 hover:bg-ui-bg-base-hover disabled:opacity-30" disabled={i === 0} onClick={() => moveTo(i, i - 1)}>
                  <ArrowUpMini />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  className="rounded p-1 hover:bg-ui-bg-base-hover disabled:opacity-30"
                  disabled={i === rows.length - 1}
                  onClick={() => moveTo(i, i + 1)}
                >
                  <ArrowDownMini />
                </button>
              </div>
            </div>
          )
        )}
      </Container>

      <div className="sticky bottom-0 z-10">
        <Container className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 shadow-elevation-card-hover">
          <Text size="small" className="text-ui-fg-subtle">
            {dirty ? "You have unsaved changes." : "All changes saved."}
          </Text>
          <div className="flex gap-x-2">
            {dirty && (
              <Button size="small" variant="secondary" onClick={() => data && setRows(data.products)}>
                Undo changes
              </Button>
            )}
            <Button size="small" disabled={!dirty} isLoading={save.isPending} onClick={() => save.mutate(rows)}>
              Save
            </Button>
          </div>
        </Container>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Shop order & badges",
  nested: "/products",
})

export default ShopOrderPage
