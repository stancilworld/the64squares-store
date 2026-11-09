import { Button, Heading, Input, Label, RadioGroup, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../sdk"
import type { MarketingView, Settings } from "./types"

// Cookie banner and data deletion.
export function Privacy({ view }: { view: MarketingView }) {
  const qc = useQueryClient()
  const [c, setC] = useState<Settings["consent"]>(view.settings.consent)
  const [orderId, setOrderId] = useState("")
  const [email, setEmail] = useState("")
  const save = useMutation({
    mutationFn: () => sdk.client.fetch<MarketingView>("/admin/marketing", { method: "POST", body: { consent: c } }),
    onSuccess: (r) => {
      qc.setQueryData(["marketing"], r)
      toast.success("Saved. The website picks it up within a few minutes.")
    },
    onError: (e: Error) => toast.error("Not saved", { description: e.message }),
  })
  const del = useMutation({
    mutationFn: () => sdk.client.fetch<{ events: number; deliveries: number }>("/admin/marketing/delete-data", { method: "POST", body: { ...(orderId.trim() ? { order_id: orderId.trim() } : {}), ...(email.trim() ? { email: email.trim() } : {}) } }),
    onSuccess: (r) => {
      toast.success(`Deleted ${r.events} ${r.events === 1 ? "event" : "events"} and ${r.deliveries} delivery records.`)
      setOrderId("")
      setEmail("")
    },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <div className="flex flex-col divide-y">
      <div className="flex flex-col gap-4 px-6 py-4">
        <div>
          <Heading level="h2">Cookie banner</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Shown at the bottom of the website once any integration is switched on. Visitors choose Analytics and Marketing separately; essential cookies (cart, sign-in) are always on. Google gets the choice through Consent Mode v2, Meta and Clarity through their own consent settings. Visitors can change their mind with &quot;Cookie settings&quot; in the footer.
          </Text>
        </div>
        <RadioGroup value={c.mode} onValueChange={(v) => setC({ ...c, mode: v as "ask" | "notice" })} className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <RadioGroup.Item value="ask" id="mode-ask" />
            <div>
              <Label htmlFor="mode-ask" weight="plus">
                Ask first (recommended)
              </Label>
              <Text size="small" className="text-ui-fg-subtle">
                Nothing is tracked until the visitor chooses. Fits India&apos;s DPDP Act and Europe&apos;s GDPR.
              </Text>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <RadioGroup.Item value="notice" id="mode-notice" />
            <div>
              <Label htmlFor="mode-notice" weight="plus">
                Notice only
              </Label>
              <Text size="small" className="text-ui-fg-subtle">
                Tracking is on unless the visitor turns it off. More data, but less safe legally.
              </Text>
            </div>
          </div>
        </RadioGroup>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="consent-text" weight="plus">
            Banner text
          </Label>
          <Textarea id="consent-text" rows={2} value={c.text} onChange={(e) => setC({ ...c, text: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="consent-policy" weight="plus">
            Privacy policy link
          </Label>
          <Input id="consent-policy" value={c.policy_url} placeholder="/help/privacy" onChange={(e) => setC({ ...c, policy_url: e.target.value })} />
          <Text size="small" className="text-ui-fg-subtle">
            A page on your website (Website → Help pages), e.g. /help/privacy. Mention the tools you use (Meta, Google, Clarity).
          </Text>
        </div>
        <div>
          <Button size="small" isLoading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 py-4">
        <div>
          <Heading level="h2">Delete a customer&apos;s tracking data</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            For a deletion request. Removes the Event Manager&apos;s records of an order, or of a customer&apos;s orders and account sign-up (found by email). Meta and Google keep their own copies: delete those in their tools. The Event Manager never stores names, emails or phone numbers, only a scrambled version of the email to find them here.
          </Text>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Order ID (order_…)" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          <Input placeholder="Customer email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Button size="small" variant="danger" disabled={!orderId.trim() && !email.trim()} isLoading={del.isPending} onClick={() => del.mutate()}>
            Delete tracking data
          </Button>
        </div>
      </div>
    </div>
  )
}
