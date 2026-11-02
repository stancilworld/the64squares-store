import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { ArrowUpRightOnBox } from "@medusajs/icons"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { BACKEND_URL, sdk } from "../lib/sdk"

type Info = { invoice: { number: string; date: string } | null; enabled: boolean; missing: string[] }

// "GST invoice" box at the top of each order page: open/print the invoice, or create it for
// an order placed before invoices were switched on.
const OrderInvoice = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const qc = useQueryClient()
  const key = ["order-invoice", order.id]
  const { data } = useQuery({ queryKey: key, queryFn: () => sdk.client.fetch<Info>(`/admin/invoices/${order.id}`) })
  const create = useMutation({
    mutationFn: () => sdk.client.fetch<Info>(`/admin/invoices/${order.id}`, { method: "POST" }),
    onSuccess: (r) => {
      qc.setQueryData(key, r)
      if (r.invoice) toast.success(`Invoice ${r.invoice.number} created`)
    },
    onError: (e: Error) => toast.error("Couldn't create the invoice", { description: e.message }),
  })
  const base = BACKEND_URL === "/" ? "" : BACKEND_URL
  return (
    <Container className="flex flex-col gap-y-2 px-6 py-4" style={{ order: -1 }}>
      <Heading level="h2">GST invoice</Heading>
      {!data ? (
        <Text size="small">Loading…</Text>
      ) : data.invoice ? (
        <>
          <Text size="small">
            <span className="font-medium">{data.invoice.number}</span>{" "}
            <span className="text-ui-fg-subtle">
              · {new Date(data.invoice.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </Text>
          <Button size="small" variant="secondary" asChild>
            <a href={`${base}/invoice/${order.id}`} target="_blank" rel="noreferrer">
              <ArrowUpRightOnBox />
              Open / print invoice
            </a>
          </Button>
        </>
      ) : !data.enabled || data.missing.length ? (
        <Text size="small" className="text-ui-fg-subtle">
          Invoices are off.{" "}
          <Link to="/settings/invoices" className="underline">
            Set them up
          </Link>{" "}
          to give every order a GST invoice.
        </Text>
      ) : (
        <>
          <Text size="small" className="text-ui-fg-subtle">
            This order was placed before invoices were switched on.
          </Text>
          <Button size="small" variant="secondary" isLoading={create.isPending} onClick={() => create.mutate()}>
            Create invoice
          </Button>
        </>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.before",
  id: "stancil-order-invoice",
})

export default OrderInvoice
