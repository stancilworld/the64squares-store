// Lets the product photos follow the colour/variant the shopper picks.
export const VARIANT_SELECTED = "stancil:variant-selected"

export const notifyVariantSelected = (variantId: string) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VARIANT_SELECTED, { detail: variantId }))
  }
}
