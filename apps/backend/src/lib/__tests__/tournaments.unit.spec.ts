import { newTicketCode, normaliseTicketCode, registrationState, registrationsCsv } from "../tournaments"

const HOUR = 60 * 60 * 1000
const base = { status: "published", starts_at: new Date(Date.now() + 48 * HOUR).toISOString(), registration_closes_at: null, capacity: null }

describe("ticket codes", () => {
  it("are T64- and six characters without look-alike letters", () => {
    for (let i = 0; i < 200; i++) {
      expect(newTicketCode()).toMatch(/^T64-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
    }
  })

  it("accept what staff type or scan", () => {
    expect(normaliseTicketCode("t64-7kq4mx")).toBe("T64-7KQ4MX")
    expect(normaliseTicketCode(" T64 7KQ4MX ")).toBe("T64-7KQ4MX")
    expect(normaliseTicketCode("7kq4mx")).toBe("T64-7KQ4MX")
    expect(normaliseTicketCode("hello")).toBeNull()
    expect(normaliseTicketCode("T64-7KQ4MXX")).toBeNull()
  })
})

describe("registrationState", () => {
  it("is open for a published event before it starts", () => {
    expect(registrationState(base, 0)).toEqual({ open: true, reason: null })
  })

  it("is closed for drafts, cancelled and finished events", () => {
    expect(registrationState({ ...base, status: "draft" }, 0).open).toBe(false)
    expect(registrationState({ ...base, status: "cancelled" }, 0).reason).toMatch(/cancelled/)
    expect(registrationState({ ...base, status: "completed" }, 0).reason).toMatch(/finished/)
  })

  it("a scheduled online event closes an hour before the start (its pairings are made then)", () => {
    const sched = { ...base, mode: "online", format: "swiss", start_mode: "scheduled", starts_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }
    expect(registrationState(sched, 0).open).toBe(false)
    expect(registrationState({ ...sched, starts_at: new Date(Date.now() + 2 * HOUR).toISOString() }, 0).open).toBe(true)
    expect(registrationState({ ...sched, format: "arena" }, 0).open).toBe(true)
    expect(registrationState({ ...sched, start_mode: "checkin" }, 0).open).toBe(true)
  })

  it("closes at the deadline, or at the start when there is none", () => {
    expect(registrationState({ ...base, registration_closes_at: new Date(Date.now() - HOUR).toISOString() }, 0).open).toBe(false)
    expect(registrationState({ ...base, starts_at: new Date(Date.now() - HOUR).toISOString() }, 0).open).toBe(false)
  })

  it("closes when every place is taken", () => {
    expect(registrationState({ ...base, capacity: 2 }, 1).open).toBe(true)
    expect(registrationState({ ...base, capacity: 2 }, 2)).toEqual({ open: false, reason: "All places are taken." })
  })
})

describe("registrationsCsv", () => {
  it("defuses spreadsheet formulas but keeps phone numbers readable", () => {
    const csv = registrationsCsv([
      { ticket_code: "T64-AAAAAA", status: "confirmed", player_name: "=HYPERLINK(\"x\")", email: "a@b.in", phone: "+91 98765 43210" },
    ])
    const row = csv.split("\n")[1]
    expect(row).toContain(`"'=HYPERLINK(""x"")"`)
    expect(row).toContain(",+91 98765 43210,")
  })
})
