import crypto from "node:crypto"
import { clean, commandHash, isFailed, isPaid, newTxnId, type PayFields, payuUrls, requestHash, responseHash, sameHash, toAmount } from "../payu"

const sha512 = (s: string) => crypto.createHash("sha512").update(s).digest("hex")

const fields: PayFields = {
  key: "gtKFFx",
  txnid: "t64abc123",
  amount: "2499.00",
  productinfo: "The 64 Squares order",
  firstname: "Asha",
  email: "asha@example.com",
  phone: "9876543210",
  surl: "https://the64squares.in/checkout/payu/return",
  furl: "https://the64squares.in/checkout/payu/return",
  udf1: "payses_01ABC",
  udf2: "cart_01XYZ",
  udf3: "",
  udf4: "",
  udf5: "",
}

describe("PayU hashes (as documented)", () => {
  it("request: key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||SALT", () => {
    expect(requestHash(fields, "SALT")).toBe(sha512("gtKFFx|t64abc123|2499.00|The 64 Squares order|Asha|asha@example.com|payses_01ABC|cart_01XYZ|||||||||SALT"))
  })
  it("response: SALT|status||||||udf5..udf1|email|firstname|productinfo|amount|txnid|key", () => {
    const p = { ...fields, status: "success" }
    expect(responseHash(p, "SALT")).toBe(sha512("SALT|success|||||||||cart_01XYZ|payses_01ABC|asha@example.com|Asha|The 64 Squares order|2499.00|t64abc123|gtKFFx"))
    // With extra charges, they come first.
    expect(responseHash({ ...p, additionalCharges: "10.00" }, "SALT")).toBe(sha512("10.00|SALT|success|||||||||cart_01XYZ|payses_01ABC|asha@example.com|Asha|The 64 Squares order|2499.00|t64abc123|gtKFFx"))
  })
  it("a changed field or another salt doesn't match", () => {
    const good = responseHash({ ...fields, status: "success" }, "SALT")
    expect(sameHash(good, responseHash({ ...fields, status: "success", amount: "1.00" }, "SALT"))).toBe(false)
    expect(sameHash(good, responseHash({ ...fields, status: "success" }, "OTHER"))).toBe(false)
    expect(sameHash(good, good.toUpperCase())).toBe(true)
  })
  it("server commands: key|command|var1|salt", () => {
    expect(commandHash("gtKFFx", "verify_payment", "t64abc123", "SALT")).toBe(sha512("gtKFFx|verify_payment|t64abc123|SALT"))
  })
})

describe("PayU details", () => {
  it("uses PayU's test and live addresses", () => {
    expect(payuUrls("test", "")).toEqual({ pay: "https://test.payu.in/_payment", api: "https://test.payu.in/merchant/postservice?form=2" })
    expect(payuUrls("live", "")).toEqual({ pay: "https://secure.payu.in/_payment", api: "https://info.payu.in/merchant/postservice?form=2" })
  })
  it("transaction ids are unique, short and plain", () => {
    const ids = new Set(Array.from({ length: 500 }, newTxnId))
    expect(ids.size).toBe(500)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{10,25}$/)
  })
  it("amounts have two decimals", () => {
    expect(toAmount(2499)).toBe("2499.00")
    expect(toAmount(10.5)).toBe("10.50")
    expect(toAmount(0.1 + 0.2)).toBe("0.30")
  })
  it("only success counts as paid", () => {
    expect(isPaid({ txnid: "a", status: "success", unmappedstatus: "captured" })).toBe(true)
    expect(isPaid({ txnid: "a", status: "pending", unmappedstatus: "in progress" })).toBe(false)
    expect(isPaid({ txnid: "a", status: "success", unmappedstatus: "bounced" })).toBe(false)
    expect(isPaid({ txnid: "a", status: "Not Found" })).toBe(false)
    expect(isFailed({ txnid: "a", status: "failure" })).toBe(true)
  })
  it("cleans what customers type (no | that would break the signature)", () => {
    expect(clean("Asha | <b>Rao</b>", 60)).toBe("Asha bRao/b")
    expect(clean("a|b", 60)).toBe("ab")
    expect(clean("x".repeat(100), 10)).toHaveLength(10)
  })
})
