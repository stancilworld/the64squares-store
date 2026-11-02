import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { sdk } from "../lib/sdk"
import { useMe } from "../lib/staff"

// "Prices" box on every product page: the ₹ price of each colour/material, editable in place.
// Medusa only offers prices in a spreadsheet hidden in the Variants "…" menu, which staff
// couldn't find. Needs "Change prices" (Settings → Staff & permissions) for moderators.

type Price = { id: string; amount: number; currency_code: string; rules?: Record<string, string> | null }
type Variant = { id: string; title: string | null; prices: Price[] }

const fmt = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)

const ProductPrices = ({ data: product }: DetailWidgetProps<HttpTypes.AdminProduct>) => {
  const qc = useQueryClient()
  const { can } = useMe()
  const allowed = can("products.prices")
  const key = ["product-prices", product.id]
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () =>
      sdk.client.fetch<{ product: { variants: Variant[] } }>(`/admin/products/${product.id}`, {
        query: { fields: "id,variants.id,variants.title,*variants.prices" },
      }),
  })
  const variants = useMemo(
    () => [...(data?.product.variants ?? [])].sort((a, b) => String(a.title).localeCompare(String(b.title))),
    [data]
  )
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [all, setAll] = useState("")

  // The price shoppers pay in India: the INR price (and any India-only price) of the variant.
  const inrOf = (v: Variant) => v.prices.find((p) => p.currency_code === "inr" && !Object.keys(p.rules ?? {}).length)
  const shown = (v: Variant) => draft[v.id] ?? (inrOf(v) ? String(inrOf(v)!.amount) : "")
  const parsed = (s: string) => {
    const n = Number(s.replace(/[,₹\s]/g, ""))
    return s.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
  }
  const changed = variants.filter((v) => draft[v.id] !== undefined && parsed(draft[v.id]) !== (inrOf(v)?.amount ?? null))
  const invalid = changed.some((v) => parsed(draft[v.id]) === null)

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/products/${product.id}/variants/batch`, {
        method: "POST",
        body: {
          update: changed.map((v) => {
            const amount = parsed(draft[v.id])!
            const inr = inrOf(v)
            // Keep the variant's other prices; India-only prices follow the new amount too.
            const prices = v.prices.map((p) => {
              const regionOnly = p.currency_code === "inr" && Object.keys(p.rules ?? {}).length > 0
              return p.id === inr?.id || regionOnly
                ? { id: p.id, currency_code: p.currency_code, amount, ...(p.rules && Object.keys(p.rules).length ? { rules: p.rules } : {}) }
                : { id: p.id, currency_code: p.currency_code, amount: p.amount, ...(p.rules && Object.keys(p.rules).length ? { rules: p.rules } : {}) }
            })
            if (!inr) {
              prices.push({ currency_code: "inr", amount } as never)
            }
            return { id: v.id, prices }
          }),
        },
      }),
    onSuccess: () => {
      toast.success(`Saved ${changed.length} price${changed.length === 1 ? "" : "s"}. The website shows them within a minute.`)
      setDraft({})
      setAll("")
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ["products"] })
    },
    onError: (e: Error) => toast.error("Couldn't save the prices", { description: e.message }),
  })

  return (
    // order -1: Medusa adds boxes at the end of the column; prices belong at the top.
    <Container className="divide-y p-0" style={{ order: -1 }}>
      <div className="flex items-start justify-between gap-x-3 px-6 py-4">
        <div>
          <Heading level="h2">Prices</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            What shoppers pay, including GST.
          </Text>
        </div>
        <Button size="small" variant="secondary" asChild>
          <Link to={`/product-editor/${product.id}`}>Simple editor</Link>
        </Button>
      </div>
      {isLoading ? (
        <Text size="small" className="px-6 py-4">
          Loading…
        </Text>
      ) : !variants.length ? (
        <Text size="small" className="px-6 py-4 text-ui-fg-subtle">
          Add colours or materials (Variants) first, then set their prices here.
        </Text>
      ) : (
        <>
          {allowed && variants.length > 1 && (
            <div className="flex items-center gap-x-2 px-6 py-3">
              <Text size="small" className="shrink-0 text-ui-fg-subtle">
                Same price for all
              </Text>
              <Input
                size="small"
                inputMode="decimal"
                placeholder="₹"
                value={all}
                onChange={(e) => setAll(e.target.value)}
                aria-label="Same price for all"
              />
              <Button
                size="small"
                variant="secondary"
                disabled={parsed(all) === null}
                onClick={() => setDraft(Object.fromEntries(variants.map((v) => [v.id, all])))}
              >
                Apply
              </Button>
            </div>
          )}
          <div className="divide-y">
            {variants.map((v) => {
              const value = shown(v)
              const bad = draft[v.id] !== undefined && parsed(draft[v.id]) === null
              const isChanged = changed.includes(v)
              return (
                <div key={v.id} className="flex items-center justify-between gap-x-3 px-6 py-2.5">
                  <Text size="small" className="min-w-0 flex-1 truncate" title={v.title ?? ""}>
                    {v.title}
                  </Text>
                  {allowed ? (
                    <div className="flex w-[130px] shrink-0 items-center gap-x-1.5">
                      <Text size="small" className="text-ui-fg-subtle">
                        ₹
                      </Text>
                      <Input
                        size="small"
                        inputMode="decimal"
                        value={value}
                        aria-label={`Price of ${v.title}`}
                        aria-invalid={bad}
                        className={isChanged ? "font-medium" : ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [v.id]: e.target.value }))}
                      />
                    </div>
                  ) : (
                    <Text size="small">{inrOf(v) ? `₹ ${fmt(inrOf(v)!.amount)}` : "No price"}</Text>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex flex-col gap-y-2 px-6 py-3">
            {allowed ? (
              <div className="flex items-center justify-between gap-x-3">
                <Button size="small" variant="transparent" asChild>
                  <Link to={`/products/${product.id}/prices`}>Spreadsheet view</Link>
                </Button>
                <div className="flex gap-x-2">
                  {changed.length > 0 && (
                    <Button size="small" variant="secondary" onClick={() => setDraft({})}>
                      Undo
                    </Button>
                  )}
                  <Button size="small" disabled={!changed.length || invalid} isLoading={save.isPending} onClick={() => save.mutate()}>
                    {changed.length ? `Save ${changed.length} price${changed.length === 1 ? "" : "s"}` : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              <Text size="xsmall" className="text-ui-fg-subtle">
                To change prices, ask the admin to switch on "Change prices" for you.
              </Text>
            )}
            {invalid && (
              <Text size="xsmall" className="text-ui-tag-red-text">
                Prices must be numbers above 0, e.g. 4499.
              </Text>
            )}
            <Text size="xsmall" className="text-ui-fg-subtle">
              For a sale with a crossed-out price, use Sales &amp; price lists.
            </Text>
          </div>
        </>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.before",
  id: "t64-product-prices",
})

export default ProductPrices
