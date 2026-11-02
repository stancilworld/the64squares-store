// Swatch colours for product colour options. Colours added in the admin's simple product form
// carry their own swatch (served by GET /store/colours); these are the built-in ones.
export const DEFAULT_SWATCHES: Record<string, string> = {
  "natural": "#e2c99a",
  "maple": "#e8d8b8",
  "walnut": "#6b4423",
  "rosewood": "#65231f",
  "sheesham": "#8a5a35",
  "ebony black": "#1c1a18",
  "white": "#ffffff",
  "black": "#1c1a18",
}

export const swatchFrom = (palette: Record<string, string>, colour: string) => {
  const key = colour.trim().toLowerCase()
  return palette[key] ?? DEFAULT_SWATCHES[key] ?? "#d9d9d9"
}
