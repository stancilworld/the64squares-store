// Tells the cart icon in the header to update its counter after the cart changes.
export const CART_CHANGED = "stancil:cart-changed"

export const notifyCartChanged = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CART_CHANGED))
  }
}
