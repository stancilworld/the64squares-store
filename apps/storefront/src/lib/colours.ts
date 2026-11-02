// Swatch colours for product colour options. Colours added in the admin's simple product form
// carry their own swatch (served by GET /store/colours); these are the built-in ones.
export const DEFAULT_SWATCHES: Record<string, string> = {
  "sunshine yellow": "#f6c445",
  "sky blue": "#7fb2e5",
  "crayon red": "#e5484d",
  "leaf green": "#5dbb63",
  "natural": "#d8b98a",
  "white": "#ffffff",
  "black": "#1e1e1e",
}

export const swatchFrom = (palette: Record<string, string>, colour: string) => {
  const key = colour.trim().toLowerCase()
  return palette[key] ?? DEFAULT_SWATCHES[key] ?? "#d9d9d9"
}
