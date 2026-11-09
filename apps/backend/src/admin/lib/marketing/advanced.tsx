import { Button, Checkbox, Heading, Input, Label, Select, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../sdk"
import { EVENT_LABELS, EVENT_NAMES, type EventName, type MarketingView, PLATFORM_LABELS, type Platform, type Settings } from "./types"

const PLATFORMS: Platform[] = ["meta_pixel", "meta_capi", "ga4", "ga4_mp", "google_ads", "gtm", "clarity"]
// Events each platform can receive at all.
const POSSIBLE: Record<Platform, EventName[]> = {
  meta_pixel: ["PageView", "ViewContent", "Search", "AddToCart", "RemoveFromCart", "ViewCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead"],
  meta_capi: ["PageView", "ViewContent", "Search", "AddToCart", "RemoveFromCart", "ViewCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "CompleteRegistration", "Lead"],
  ga4: ["PageView", "ViewContent", "Search", "AddToCart", "RemoveFromCart", "ViewCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead"],
  ga4_mp: ["Purchase", "Refund", "CompleteRegistration"],
  google_ads: ["Purchase", "Lead"],
  gtm: ["PageView", "ViewContent", "Search", "AddToCart", "RemoveFromCart", "ViewCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead"],
  clarity: ["ViewContent", "Search", "AddToCart", "RemoveFromCart", "ViewCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead"],
}

export function Advanced({ view }: { view: MarketingView }) {
  const qc = useQueryClient()
  const [contentId, setContentId] = useState<Settings["content_id"]>(view.settings.content_id)
  const [days, setDays] = useState(String(view.settings.retention_days))
  const [excluded, setExcluded] = useState<Settings["excluded"]>(view.settings.excluded)
  const save = useMutation({
    mutationFn: () => sdk.client.fetch<MarketingView>("/admin/marketing", { method: "POST", body: { content_id: contentId, retention_days: Number(days), excluded } }),
    onSuccess: (r) => {
      qc.setQueryData(["marketing"], r)
      toast.success("Saved.")
    },
    onError: (e: Error) => toast.error("Not saved", { description: e.message }),
  })
  const isOn = (p: Platform, e: EventName) => !(excluded[p] ?? []).includes(e)
  const flip = (p: Platform, e: EventName, on: boolean) => {
    const list = new Set(excluded[p] ?? [])
    if (on) list.delete(e)
    else list.add(e)
    setExcluded({ ...excluded, [p]: [...list] })
  }
  return (
    <div className="flex flex-col divide-y">
      <div className="grid gap-4 px-6 py-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label weight="plus">Product ID sent to the platforms</Label>
          <Select value={contentId} onValueChange={(v) => setContentId(v as Settings["content_id"])}>
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="variant">Version ID (variant_…), recommended</Select.Item>
              <Select.Item value="product">Product ID (prod_…)</Select.Item>
              <Select.Item value="sku">SKU</Select.Item>
            </Select.Content>
          </Select>
          <Text size="small" className="text-ui-fg-subtle">
            If you upload a product catalogue to Meta or Google Merchant Center, choose the ID used there, so ads can show the right product.
          </Text>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label weight="plus" htmlFor="retention">
            Keep events for (days)
          </Label>
          <Input id="retention" type="number" min={7} max={400} value={days} onChange={(e) => setDays(e.target.value)} />
          <Text size="small" className="text-ui-fg-subtle">
            The Event Manager deletes older events every night. Prices are in the store&apos;s currency (INR). Campaign tags (utm_…, gclid, fbclid) are recorded automatically.
          </Text>
        </div>
      </div>
      <div className="px-6 py-4">
        <Heading level="h2">Which events each platform gets</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Untick an event to stop sending it to that platform. Grey: the platform doesn&apos;t take that event.
        </Text>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Event</Table.HeaderCell>
                {PLATFORMS.map((p) => (
                  <Table.HeaderCell key={p} className="text-center">
                    {PLATFORM_LABELS[p]}
                  </Table.HeaderCell>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {EVENT_NAMES.map((e) => (
                <Table.Row key={e}>
                  <Table.Cell>{EVENT_LABELS[e]}</Table.Cell>
                  {PLATFORMS.map((p) => (
                    <Table.Cell key={p} className="text-center">
                      {POSSIBLE[p].includes(e) ? (
                        <Checkbox aria-label={`${EVENT_LABELS[e]} to ${PLATFORM_LABELS[p]}`} checked={isOn(p, e)} onCheckedChange={(v) => flip(p, e, v === true)} />
                      ) : (
                        <span className="text-ui-fg-disabled">—</span>
                      )}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </div>
      <div className="px-6 py-4">
        <Button size="small" isLoading={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
    </div>
  )
}
