"use client"

import { createContext, useCallback, useContext } from "react"
import { swatchFrom } from "@/lib/colours"

// The colour → swatch list from the admin, available to every colour button and filter.
const Palette = createContext<Record<string, string>>({})

export function ColoursProvider({ palette, children }: { palette: Record<string, string>; children: React.ReactNode }) {
  return <Palette.Provider value={palette}>{children}</Palette.Provider>
}

export const useSwatch = () => {
  const palette = useContext(Palette)
  return useCallback((colour: string) => swatchFrom(palette, colour), [palette])
}
