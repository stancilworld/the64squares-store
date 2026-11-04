import { publicName, summarise } from "../reviews"

describe("reviews", () => {
  it("summarises ratings", () => {
    expect(summarise([])).toEqual({ count: 0, average: 0, stars: [0, 0, 0, 0, 0] })
    expect(summarise([5, 4, 4, 1])).toEqual({ count: 4, average: 3.5, stars: [1, 0, 0, 2, 1] })
    expect(summarise([5, 5, 4]).average).toBe(4.7)
    // Out-of-range values are clamped.
    expect(summarise([9, 0]).stars).toEqual([1, 0, 0, 0, 1])
  })

  it("shows only first name and initial", () => {
    expect(publicName("Ravi Kumar")).toBe("Ravi K.")
    expect(publicName("  meera  ")).toBe("meera")
    expect(publicName("Anil Raj Sharma")).toBe("Anil S.")
    expect(publicName("")).toBe("Customer")
  })
})
