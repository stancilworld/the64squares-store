"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

// "My List": products a visitor saves for later. Kept in this browser for now; it moves
// into the customer's account once logins are added.
export type ListItem = { productId: string; variantId: string | null; addedAt: number }

type ListApi = {
  items: ListItem[]
  ready: boolean
  has: (productId: string, variantId?: string | null) => boolean
  add: (productId: string, variantId: string | null) => void
  remove: (productId: string, variantId?: string | null) => void
}

const KEY = "t64_list_v1"
const ListContext = createContext<ListApi | null>(null)

const read = (): ListItem[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]")
    return Array.isArray(raw) ? raw.filter((i) => i && typeof i.productId === "string") : []
  } catch {
    return []
  }
}

const write = (items: ListItem[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // Storage unavailable (private mode): the list lasts for this visit only.
  }
}

const same = (a: ListItem, productId: string, variantId?: string | null) =>
  a.productId === productId && (variantId === undefined || a.variantId === variantId)

export function ListProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ListItem[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Loaded after mount: localStorage only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external store on mount
    setItems(read())
    setReady(true)
    const sync = (e: StorageEvent) => e.key === KEY && setItems(read())
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])

  const update = useCallback((next: (prev: ListItem[]) => ListItem[]) => {
    setItems((prev) => {
      const value = next(prev)
      write(value)
      return value
    })
  }, [])

  const api = useMemo<ListApi>(
    () => ({
      items,
      ready,
      has: (productId, variantId) => items.some((i) => same(i, productId, variantId)),
      add: (productId, variantId) =>
        update((prev) =>
          prev.some((i) => same(i, productId, variantId))
            ? prev
            : [{ productId, variantId, addedAt: Date.now() }, ...prev]
        ),
      remove: (productId, variantId) => update((prev) => prev.filter((i) => !same(i, productId, variantId))),
    }),
    [items, ready, update]
  )

  return <ListContext.Provider value={api}>{children}</ListContext.Provider>
}

// Used where the provider is absent (e.g. a page rendered on its own): an empty list.
const EMPTY: ListApi = { items: [], ready: false, has: () => false, add: () => {}, remove: () => {} }

export function useList(): ListApi {
  return useContext(ListContext) ?? EMPTY
}
