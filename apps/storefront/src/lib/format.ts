const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })

// "₹4,499", or "₹4,499.50" when there are paise.
export const formatPrice = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return ""
  const whole = Number.isInteger(amount)
  return `₹${whole ? inr.format(amount) : amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const ordinal = (n: number) => {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) {
    return "th"
  }
  return ["th", "st", "nd", "rd"][n % 10] ?? "th"
}

// "20th June, 2027" as parts, so the "th" can be shown raised. Dates are shown in IST.
export const postDateParts = (iso: string | null) => {
  if (!iso) {
    return null
  }
  const d = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000)
  const day = d.getUTCDate()
  return { day, suffix: ordinal(day), rest: ` ${MONTHS[d.getUTCMonth()]}, ${d.getUTCFullYear()}` }
}
