import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Text } from "@medusajs/ui"

// "Personalisation" box on an order: the text each shopper typed for engraved items, so it's
// seen before the order is made or packed. Hidden when nothing in the order is personalised.
const OrderPersonalisation = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const items = (order.items ?? [])
    .map((i) => ({ i, text: typeof i.metadata?.engraving === "string" ? (i.metadata.engraving as string) : "" }))
    .filter((x) => x.text)
  if (!items.length) return null
  return (
    <Container className="flex flex-col gap-y-3 px-6 py-4" style={{ order: -2 }}>
      <Heading level="h2">Personalisation</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        Make these exactly as written. Copy the text rather than retyping it.
      </Text>
      <ul className="flex flex-col gap-y-2">
        {items.map(({ i, text }) => (
          <li key={i.id} className="rounded-md bg-ui-bg-subtle px-3 py-2">
            <Text size="small" className="text-ui-fg-subtle">
              {i.product_title ?? i.title}
              {i.variant_title && i.variant_title !== "Default" ? ` · ${i.variant_title}` : ""} · Qty {i.quantity}
            </Text>
            <Text weight="plus" className="select-all break-words font-mono">
              {text}
            </Text>
          </li>
        ))}
      </ul>
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "order.details.side.before" })

export default OrderPersonalisation
