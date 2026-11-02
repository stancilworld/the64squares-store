"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import { useSwatch } from "./colours-provider"
import { ChevronDown } from "./icons"

export type FilterGroup = {
  key: string
  label: string
  options: { value: string; label: string; disabled?: boolean; swatch?: boolean }[]
  note?: string
}

function Group({ group, selected, toggle }: { group: FilterGroup; selected: string[]; toggle: (v: string) => void }) {
  const swatch = useSwatch()
  const [open, setOpen] = useState(selected.length > 0 || group.key === "category")
  const id = `filter-${group.key}`
  return (
    <div className="border-b border-rule py-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-[15px] font-medium"
      >
        {group.label}
        <ChevronDown className={`h-[12px] w-[12px] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={id} className="mt-3 flex flex-col gap-2.5">
          {group.note && <p className="text-[14px] leading-snug text-muted">{group.note}</p>}
          {group.options.map((o) => {
            const checked = selected.includes(o.value)
            return (
              <label
                key={o.value}
                className={`flex items-center gap-2.5 text-[14px] ${o.disabled ? "text-muted" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={checked}
                  disabled={o.disabled}
                  onChange={() => toggle(o.value)}
                />
                <span
                  aria-hidden="true"
                  className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[3px] border border-black peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${o.disabled ? "border-muted" : ""}`}
                >
                  {checked && <span className="h-[10px] w-[10px] rounded-[1px] bg-velvet" />}
                </span>
                {o.swatch && (
                  <span
                    aria-hidden="true"
                    className="h-[14px] w-[14px] rounded-full border border-black/15"
                    style={{ backgroundColor: swatch(o.label) }}
                  />
                )}
                {o.label}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ShopFilters({ groups }: { groups: FilterGroup[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  const [mobileOpen, setMobileOpen] = useState(false)

  const selectedFor = (key: string) => params.get(key)?.split(",").filter(Boolean) ?? []

  const toggle = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    const current = selectedFor(key)
    const values = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    if (values.length) {
      next.set(key, values.join(","))
    } else {
      next.delete(key)
    }
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  const active = groups.reduce((n, g) => n + selectedFor(g.key).length, 0)

  return (
    <aside aria-label="Filters" className={pending ? "opacity-70 transition-opacity" : ""}>
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        className="flex h-[44px] w-full items-center justify-between rounded-md border border-rule px-4 text-[15px] lg:hidden"
      >
        Filters{active ? ` (${active})` : ""}
        <ChevronDown className={`h-4 w-4 ${mobileOpen ? "rotate-180" : ""}`} />
      </button>
      <div className={`${mobileOpen ? "block" : "hidden"} lg:block`}>
        <h2 className="hidden text-[13px] font-medium text-muted lg:block">Filter</h2>
        <div className="flex flex-col lg:mt-1">
          {groups.map((g) => (
            <Group key={g.key} group={g} selected={selectedFor(g.key)} toggle={(v) => toggle(g.key, v)} />
          ))}
        </div>
        {active > 0 && (
          <button
            type="button"
            onClick={() => start(() => router.replace(pathname, { scroll: false }))}
            className="mt-5 text-[14px] underline underline-offset-4"
          >
            Clear all filters
          </button>
        )}
      </div>
    </aside>
  )
}
