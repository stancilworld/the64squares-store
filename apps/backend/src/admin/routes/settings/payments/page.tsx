import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Switch, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { KeysEditor } from "../../../lib/keys-editor"
import { sdk } from "../../../lib/sdk"
import { useMe } from "../../../lib/staff"

type Settings = {
  cod_enabled: boolean
  cod_max: number | null
  online_enabled: boolean
  payu_enabled: boolean
  delivery_text: string
  order_alert_email: string
  dispatch_days: number
  transit_days: number
  dispatch_from: string
  returns_text: string
  in_carts_enabled: boolean
  in_carts_min: number
}
type Keys = {
  payu: boolean
  payu_test_mode: boolean
  payu_webhook_at: string | null
  payu_webhook_url: string
  payu_checked_at: string | null
  razorpay: boolean
  razorpay_webhook: boolean
  razorpay_test_mode: boolean
  resend: boolean
  email_from: string
  email_reply_to: string | null
  google: boolean
  delhivery: boolean
  webhook_url: string
}
type Response = { settings: Settings; keys: Keys }

const Status = ({ on, onText = "Connected", offText = "Not set up" }: { on: boolean; onText?: string; offText?: string }) => (
  <Badge size="2xsmall" color={on ? "green" : "orange"}>
    {on ? onText : offText}
  </Badge>
)

const Row = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-x-6 px-6 py-4">
    <div className="flex flex-col">
      <Text size="small" weight="plus">
        {title}
      </Text>
      {hint && (
        <Text size="small" className="text-ui-fg-subtle">
          {hint}
        </Text>
      )}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
)

const PaymentsPage = () => {
  const qc = useQueryClient()
  const { me } = useMe()
  const { data, isLoading } = useQuery({
    queryKey: ["checkout-settings"],
    queryFn: () => sdk.client.fetch<Response>("/admin/checkout-settings"),
  })
  const [form, setForm] = useState<Settings | null>(null)
  const [codMax, setCodMax] = useState("")
  useEffect(() => {
    if (data) {
      setForm(data.settings)
      setCodMax(data.settings.cod_max ? String(data.settings.cod_max) : "")
    }
  }, [data])

  const save = useMutation({
    mutationFn: (body: Partial<Settings>) =>
      sdk.client.fetch<Response>("/admin/checkout-settings", { method: "POST", body }),
    onSuccess: (r) => {
      qc.setQueryData(["checkout-settings"], r)
      toast.success("Saved. The website uses the new settings straight away.")
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })

  if (isLoading || !data || !form) {
    return (
      <Container className="px-6 py-4">
        <Text size="small">Loading...</Text>
      </Container>
    )
  }
  const k = data.keys
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm({ ...form, [key]: value })
  const codMaxNumber = codMax.trim() ? Number(codMax) : null
  const codMaxBad = codMax.trim() !== "" && (!Number.isFinite(codMaxNumber) || (codMaxNumber ?? 0) < 1)
  const noMethod = !form.cod_enabled && !(form.online_enabled && k.razorpay) && !(form.payu_enabled && k.payu)
  const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null)

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Payments & delivery</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            How shoppers can pay, what they see about delivery, and where new-order alerts go.
          </Text>
        </div>
        <Row
          title="Online payment (Razorpay)"
          hint={
            k.razorpay
              ? k.razorpay_test_mode
                ? "Test mode: payments are pretend. Switch to live keys before launch."
                : "UPI, cards, net banking and wallets."
              : "Add the Razorpay keys under Keys below to switch this on."
          }
        >
          <div className="flex items-center gap-x-3">
            <Status on={k.razorpay} onText={k.razorpay_test_mode ? "Test mode" : "Live"} />
            <Switch
              checked={form.online_enabled}
              onCheckedChange={(v) => set("online_enabled", v)}
              disabled={!k.razorpay}
              aria-label="Online payment"
            />
          </div>
        </Row>
        <Row
          title="Online payment (PayU)"
          hint={
            k.payu
              ? `${k.payu_test_mode ? "Test mode: payments are pretend. Switch to live keys before launch. " : "UPI, cards, net banking and wallets on PayU's secure page. "}${
                  k.payu_webhook_at ? `Webhook working (last ${ago(k.payu_webhook_at)}).` : "Payments are confirmed with PayU directly; the optional webhook isn't set up yet."
                }`
              : "Add the PayU Merchant Key and Salt under Keys below to switch this on."
          }
        >
          <div className="flex items-center gap-x-3">
            <Status on={k.payu} onText={k.payu_test_mode ? "Test mode" : "Live"} />
            <Switch checked={form.payu_enabled} onCheckedChange={(v) => set("payu_enabled", v)} disabled={!k.payu} aria-label="PayU" />
          </div>
        </Row>
        {form.online_enabled && k.razorpay && form.payu_enabled && k.payu && (
          <Text size="small" className="px-6 py-3 text-ui-fg-subtle">
            Both gateways are on: checkout offers &ldquo;Pay with Razorpay&rdquo; and &ldquo;Pay with PayU&rdquo;. Switch one off to offer a single &ldquo;Pay online&rdquo;.
          </Text>
        )}
        <Row title="Cash on Delivery" hint="Shoppers pay the delivery person. Mark the order as paid in Orders once the cash arrives.">
          <Switch checked={form.cod_enabled} onCheckedChange={(v) => set("cod_enabled", v)} aria-label="Cash on Delivery" />
        </Row>
        {form.cod_enabled && (
          <Row title="Cash on Delivery limit" hint="Highest order value allowed for Cash on Delivery. Leave empty for no limit.">
            <div className="flex items-center gap-x-2">
              <Text size="small">₹</Text>
              <Input
                className="w-32"
                inputMode="numeric"
                placeholder="No limit"
                value={codMax}
                onChange={(e) => setCodMax(e.target.value.replace(/[^\d]/g, ""))}
                aria-invalid={codMaxBad}
              />
            </div>
          </Row>
        )}
        {noMethod && (
          <Text size="small" className="px-6 py-3 text-ui-tag-red-text">
            With both switched off, nobody can place an order.
          </Text>
        )}
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <Label htmlFor="delivery-text">Delivery message</Label>
          <Input
            id="delivery-text"
            value={form.delivery_text}
            maxLength={200}
            onChange={(e) => set("delivery_text", e.target.value)}
          />
          <Text size="xsmall" className="text-ui-fg-subtle">
            Shown at checkout under the address and in the order summary.
          </Text>
        </div>
        <div className="px-6 pb-1 pt-5">
          <Text size="small" weight="plus">On the product page</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            The lines under the Add to cart button. The &ldquo;Arrives by&rdquo; date is today + days to pack + days in
            transit; a product&apos;s own &ldquo;Days to make&rdquo; replaces the days to pack.
          </Text>
        </div>
        <Row title="Days to pack an order" hint="For products in stock: days before the parcel leaves.">
          <Input
            className="w-20"
            type="number"
            min={0}
            max={60}
            value={form.dispatch_days}
            onChange={(e) => set("dispatch_days", Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0))))}
          />
        </Row>
        <Row title="Days in transit" hint="The latest a parcel usually takes to reach a customer, so the date is one you can keep.">
          <Input
            className="w-20"
            type="number"
            min={1}
            max={60}
            value={form.transit_days}
            onChange={(e) => set("transit_days", Math.max(1, Math.min(60, Math.round(Number(e.target.value) || 1))))}
          />
        </Row>
        <div className="grid gap-4 px-6 py-4 sm:grid-cols-2">
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="dispatch-from">Dispatched from</Label>
            <Input id="dispatch-from" value={form.dispatch_from} maxLength={60} placeholder="India" onChange={(e) => set("dispatch_from", e.target.value)} />
            <Text size="xsmall" className="text-ui-fg-subtle">Leave empty to hide the line.</Text>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="returns-text">Returns</Label>
            <Input id="returns-text" value={form.returns_text} maxLength={120} onChange={(e) => set("returns_text", e.target.value)} />
            <Text size="xsmall" className="text-ui-fg-subtle">
              Personalised items always say they can&apos;t be returned. Leave empty to hide the line.
            </Text>
          </div>
        </div>
        <Row
          title="Show how many carts hold a product"
          hint="“In 5+ carts”: a real count of shoppers' carts from the last 3 days, shown only when it reaches the minimum."
        >
          <div className="flex items-center gap-x-3">
            {form.in_carts_enabled && (
              <div className="flex items-center gap-x-2">
                <Text size="small" className="text-ui-fg-subtle">From</Text>
                <Input
                  className="w-20"
                  type="number"
                  min={2}
                  max={1000}
                  value={form.in_carts_min}
                  aria-label="Minimum carts"
                  onChange={(e) => set("in_carts_min", Math.max(2, Math.min(1000, Math.round(Number(e.target.value) || 2))))}
                />
              </div>
            )}
            <Switch checked={form.in_carts_enabled} onCheckedChange={(v) => set("in_carts_enabled", v)} aria-label="Show cart count" />
          </div>
        </Row>
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <Label htmlFor="alert-email">New order alerts</Label>
          <Input
            id="alert-email"
            type="email"
            value={form.order_alert_email}
            placeholder="you@example.com"
            onChange={(e) => set("order_alert_email", e.target.value)}
          />
          <Text size="xsmall" className="text-ui-fg-subtle">
            An email arrives here for every new order. Leave empty to turn alerts off.
          </Text>
        </div>
        <div className="flex justify-end px-6 py-4">
          <Button
            size="small"
            isLoading={save.isPending}
            disabled={codMaxBad}
            onClick={() => save.mutate({ ...form, cod_max: codMaxNumber })}
          >
            Save
          </Button>
        </div>
      </Container>

      {me?.owner ? (
        <KeysEditor />
      ) : (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Setup</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Which services are connected. Only the main admin can add or change their keys.
          </Text>
        </div>
        <Row title="Razorpay" hint="Online payments.">
          <Status on={k.razorpay} />
        </Row>
        <Row
          title="Razorpay webhook"
          hint="Lets an order go through even if the shopper closes the page right after paying."
        >
          <Status on={k.razorpay_webhook} />
        </Row>
        <Row title="PayU" hint="Online payments.">
          <Status on={k.payu} />
        </Row>
        <Row title="Emails (Resend)" hint={`Order confirmations, shipping updates and sign-in codes. Sent from ${k.email_from}. ${k.email_reply_to ? `Customer replies go to ${k.email_reply_to}.` : "Customer replies go nowhere yet: set \"Customer replies go to\" in Keys."}`}>
          <Status on={k.resend} />
        </Row>
        <Row title="Sign in with Google" hint="An extra way for shoppers to sign in. Email code and password sign-in always work.">
          <Status on={k.google} />
        </Row>
        <Row
          title="Delhivery"
          hint="Checks whether Delhivery delivers to a pincode. Without it, every valid Indian pincode is accepted."
        >
          <Status on={k.delhivery} />
        </Row>
      </Container>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Payments & delivery",
  rank: 0,
})

export default PaymentsPage
