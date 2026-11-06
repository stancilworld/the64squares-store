import { ContainerRegistrationKeys, MedusaError, QueryContext } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { cleanEngravingText } from "../lib/personalisation"
import { readEngraving } from "../lib/product-form"

// Adds a personalised item whose personalisation costs extra (the product's engraving fee).
// The line gets the variant's current price plus the fee as a fixed price (and the pre-sale
// price plus the fee as its MRP), which Medusa keeps when the quantity or address changes. Free personalisation uses the normal
// add-to-cart and doesn't come through here.

export type PersonalisedItemInput = { cart_id: string; variant_id: string; quantity: number; text: string }

const personalisedItemPriceStep = createStep("personalised-item-price", async (input: PersonalisedItemInput, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    fields: ["id", "region_id", "currency_code", "completed_at"],
    filters: { id: input.cart_id },
  })
  if (!cart || cart.completed_at) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found")
  }
  const {
    data: [variant],
  } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product.metadata", "calculated_price.*"],
    filters: { id: input.variant_id },
    context: {
      calculated_price: QueryContext({ region_id: cart.region_id, currency_code: cart.currency_code }),
    },
  })
  const engraving = variant && readEngraving((variant.product?.metadata ?? {}) as Record<string, unknown>)
  if (!variant || !engraving) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "This product can't be personalised")
  }
  const prices = (variant as { calculated_price?: { calculated_amount?: number | null; original_amount?: number | null } })
    .calculated_price
  const base = prices?.calculated_amount
  if (typeof base !== "number") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "This product has no price yet")
  }
  const text = cleanEngravingText(input.text, engraving.max)
  if (!text) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Please fill in “${engraving.label}”.`)
  }
  // The price before any sale, plus the fee, so the cart's "MRP" and discount stay right.
  const original = typeof prices?.original_amount === "number" ? Math.max(prices.original_amount, base) : base
  return new StepResponse({
    unit_price: base + engraving.fee,
    compare_at_unit_price: original + engraving.fee,
    fee: engraving.fee,
    text,
  })
})

export const addPersonalisedItemWorkflow = createWorkflow(
  "add-personalised-item",
  (input: PersonalisedItemInput) => {
    const price = personalisedItemPriceStep(input)
    const cartInput = transform({ input, price }, ({ input, price }) => ({
      cart_id: input.cart_id,
      items: [
        {
          variant_id: input.variant_id,
          quantity: input.quantity,
          unit_price: price.unit_price,
          compare_at_unit_price: price.compare_at_unit_price,
          metadata: { engraving: price.text, engraving_fee: price.fee },
        },
      ],
    }))
    addToCartWorkflow.runAsStep({ input: cartInput })
    return new WorkflowResponse(price)
  }
)
