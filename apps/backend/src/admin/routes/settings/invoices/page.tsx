import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Select, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sdk } from "../../../lib/sdk"

type Settings = {
  enabled: boolean
  legal_name: string
  brand_line: string
  gstin: string
  pan: string
  address: string
  state: string
  email: string
  phone: string
  prefix: string
  gst_rate: number
  default_hsn: string
  signatory: string
  footer: string
}
type Response = { settings: Settings; missing: string[]; states: string[] }

const F = ({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) => (
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

const InvoicesPage = () => {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["invoice-settings"], queryFn: () => sdk.client.fetch<Response>("/admin/invoice-settings") })
  const [form, setForm] = useState<Settings | null>(null)
  const [rate, setRate] = useState("")
  useEffect(() => {
    if (data) {
      setForm(data.settings)
      setRate(String(data.settings.gst_rate))
    }
  }, [data])
  const save = useMutation({
    mutationFn: (body: Settings) => sdk.client.fetch<Response>("/admin/invoice-settings", { method: "POST", body }),
    onSuccess: (r) => {
      qc.setQueryData(["invoice-settings"], r)
      toast.success(r.settings.enabled ? "Saved. New orders get a GST invoice." : "Saved")
    },
    onError: (e: Error) => toast.error("Couldn't save", { description: e.message }),
  })
  if (!data || !form) {
    return (
      <Container className="px-6 py-4">
        <Text size="small">Loading…</Text>
      </Container>
    )
  }
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm({ ...form, [k]: v })
  const gstinOk = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(form.gstin.trim().toUpperCase())
  const rateNum = Number(rate)
  const badRate = !(rate.trim() !== "" && rateNum >= 0 && rateNum <= 28)
  return (
    <Container className="divide-y p-0">
      <div className="flex items-start justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h1">Invoices</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Every new order gets a numbered GST tax invoice, linked in the confirmation email, on the order page, in the
            shopper's account and here in the admin. Details are frozen on each invoice when the order is placed.
          </Text>
        </div>
        <Badge size="2xsmall" color={data.settings.enabled ? "green" : "grey"}>
          {data.settings.enabled ? "On" : "Off"}
        </Badge>
      </div>
      <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2">
        <F label="Company name (seller)" htmlFor="iv-legal" hint="The GST-registered company, as on the GST certificate.">
          <Input id="iv-legal" value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
        </F>
        <F label="Line under the name" htmlFor="iv-brand" hint="e.g. The 64 Squares · a brand of your company">
          <Input id="iv-brand" value={form.brand_line} onChange={(e) => set("brand_line", e.target.value)} />
        </F>
        <F label="GSTIN" htmlFor="iv-gstin" hint={form.gstin && !gstinOk ? "That doesn't look like a 15-character GSTIN." : "15 characters, e.g. 27ABCDE1234F1Z5"}>
          <Input id="iv-gstin" value={form.gstin} aria-invalid={!!form.gstin && !gstinOk} onChange={(e) => set("gstin", e.target.value.toUpperCase().replace(/\s/g, ""))} />
        </F>
        <F label="PAN (optional)" htmlFor="iv-pan">
          <Input id="iv-pan" value={form.pan} onChange={(e) => set("pan", e.target.value.toUpperCase().replace(/\s/g, ""))} />
        </F>
        <F label="Registered address" htmlFor="iv-addr" hint="As on the GST certificate.">
          <Textarea id="iv-addr" rows={3} value={form.address} onChange={(e) => set("address", e.target.value)} />
        </F>
        <div className="flex flex-col gap-4">
          <F label="State" hint="Orders delivered inside this state show CGST + SGST; others show IGST.">
            <Select value={form.state || undefined} onValueChange={(v) => set("state", v)}>
              <Select.Trigger aria-label="State">
                <Select.Value placeholder="Choose the state" />
              </Select.Trigger>
              <Select.Content>
                {data.states.map((s) => (
                  <Select.Item key={s} value={s}>
                    {s}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </F>
          <div className="grid grid-cols-2 gap-4">
            <F label="Email (optional)" htmlFor="iv-email">
              <Input id="iv-email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </F>
            <F label="Phone (optional)" htmlFor="iv-phone">
              <Input id="iv-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </F>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-4">
        <F label="Invoice number start" htmlFor="iv-prefix" hint={`e.g. ${form.prefix || "STN"}/2026-27/0001`}>
          <Input id="iv-prefix" value={form.prefix} onChange={(e) => set("prefix", e.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 10))} />
        </F>
        <F label="GST rate (%)" htmlFor="iv-rate" hint="Prices on the website include it. Check with your accountant.">
          <Input id="iv-rate" inputMode="decimal" value={rate} aria-invalid={badRate} onChange={(e) => setRate(e.target.value)} />
        </F>
        <F label="Default HSN" htmlFor="iv-hsn" hint="Used when a product has no HS code. 9504 = chess sets and board games.">
          <Input id="iv-hsn" value={form.default_hsn} onChange={(e) => set("default_hsn", e.target.value.replace(/\D/g, "").slice(0, 8))} />
        </F>
        <F label="Signature line" htmlFor="iv-sign">
          <Input id="iv-sign" value={form.signatory} onChange={(e) => set("signatory", e.target.value)} />
        </F>
      </div>
      <div className="px-6 py-4">
        <F label="Note at the bottom" htmlFor="iv-foot">
          <Textarea id="iv-foot" rows={2} value={form.footer} onChange={(e) => set("footer", e.target.value)} />
        </F>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-x-3">
          <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} aria-label="Give new orders a GST invoice" />
          <Text size="small">Give every new order a GST invoice</Text>
        </div>
        <Button size="small" isLoading={save.isPending} disabled={badRate} onClick={() => save.mutate({ ...form, gst_rate: rateNum })}>
          Save
        </Button>
      </div>
      {data.missing.length > 0 && (
        <Text size="small" className="px-6 py-3 text-ui-tag-orange-text">
          Still needed before invoices can be switched on: {data.missing.join(", ")}.
        </Text>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Invoices",
  rank: 1,
})

export default InvoicesPage
