// Shown on the product page next to the price (api/store/product-extras).

// "In N+ carts": the count is rounded down to a step so the number reads naturally and
// doesn't twitch with every cart. Below the minimum nothing is shown.
export const cartsLabelCount = (carts: number, min: number): number | null => {
  if (carts < min) return null
  const steps = [min, 10, 20, 50, 100, 200, 500, 1000].filter((s) => s >= min)
  return steps.filter((s) => carts >= s).pop() ?? min
}

// How far back an open cart still counts.
export const CART_WINDOW_DAYS = 3
