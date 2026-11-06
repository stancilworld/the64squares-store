import { cartsLabelCount } from "../product-extras"
import { cleanEngravingText } from "../personalisation"

describe("cart count label", () => {
  it("shows nothing below the minimum", () => {
    expect(cartsLabelCount(4, 5)).toBeNull()
  })
  it("rounds down to a step", () => {
    expect(cartsLabelCount(5, 5)).toBe(5)
    expect(cartsLabelCount(9, 5)).toBe(5)
    expect(cartsLabelCount(14, 5)).toBe(10)
    expect(cartsLabelCount(27, 5)).toBe(20)
    expect(cartsLabelCount(340, 5)).toBe(200)
  })
  it("starts at a custom minimum", () => {
    expect(cartsLabelCount(12, 12)).toBe(12)
    expect(cartsLabelCount(25, 12)).toBe(20)
  })
})

describe("personalisation text", () => {
  it("keeps one clean line within the limit", () => {
    expect(cleanEngravingText("  Ravi\n  Kumar\t", 30)).toBe("Ravi Kumar")
    expect(cleanEngravingText("abcdef", 3)).toBe("abc")
  })
})
