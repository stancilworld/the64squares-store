import { Input, Select } from "@medusajs/ui"

// The little label on a product's photo ("New", "Bestseller", "Sale" or your own words).
// Used by the simple product form and Products → Shop order & badges.

export type BadgeKind = "auto" | "none" | "new" | "bestseller" | "sale" | "custom"
export type BadgeColour = "black" | "red" | "yellow" | "blue"
export type BadgeValue = { kind: BadgeKind; text?: string | null; colour?: BadgeColour | null }

export const BADGE_OPTIONS: { value: BadgeKind; label: string }[] = [
  { value: "auto", label: "Automatic (Sale when on sale)" },
  { value: "none", label: "No badge" },
  { value: "new", label: "New" },
  { value: "bestseller", label: "Bestseller" },
  { value: "sale", label: "Sale" },
  { value: "custom", label: "My own words…" },
]

const COLOURS: { value: BadgeColour; label: string; className: string }[] = [
  { value: "black", label: "Black", className: "bg-black text-white" },
  { value: "red", label: "Red", className: "bg-[#e53935] text-white" },
  { value: "yellow", label: "Yellow", className: "bg-[#f6c445] text-black" },
  { value: "blue", label: "Blue", className: "bg-[#7fb2e5] text-black" },
]

// Same look as the website.
const PRESET: Record<"new" | "bestseller" | "sale", { text: string; colour: BadgeColour }> = {
  new: { text: "New", colour: "yellow" },
  bestseller: { text: "Bestseller", colour: "black" },
  sale: { text: "Sale", colour: "red" },
}

export const badgeLook = (b: BadgeValue): { text: string; className: string } | null => {
  if (b.kind === "auto" || b.kind === "none") return null
  const p = b.kind === "custom" ? { text: (b.text ?? "").trim(), colour: b.colour ?? "black" } : PRESET[b.kind]
  if (!p.text) return null
  return { text: p.text, className: COLOURS.find((c) => c.value === p.colour)!.className }
}

export function BadgePill({ badge }: { badge: BadgeValue }) {
  const look = badgeLook(badge)
  if (!look) return null
  return <span className={`inline-block rounded-full px-2.5 py-0.5 txt-compact-xsmall-plus ${look.className}`}>{look.text}</span>
}

export function BadgePicker({ value, onChange, id }: { value: BadgeValue; onChange: (b: BadgeValue) => void; id?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-60">
        <Select size="small" value={value.kind} onValueChange={(k) => onChange({ kind: k as BadgeKind, text: value.text, colour: value.colour ?? "black" })}>
          <Select.Trigger id={id} aria-label="Badge">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {BADGE_OPTIONS.map((o) => (
              <Select.Item key={o.value} value={o.value}>
                {o.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
      {value.kind === "custom" && (
        <>
          <Input
            size="small"
            className="w-36"
            maxLength={24}
            placeholder="e.g. Only 3 left"
            aria-label="Badge words"
            value={value.text ?? ""}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
          />
          <div className="w-28">
            <Select size="small" value={value.colour ?? "black"} onValueChange={(c) => onChange({ ...value, colour: c as BadgeColour })}>
              <Select.Trigger aria-label="Badge colour">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {COLOURS.map((c) => (
                  <Select.Item key={c.value} value={c.value}>
                    {c.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </>
      )}
      <BadgePill badge={value} />
    </div>
  )
}
