// Upload size limits per file type, set in the admin under "Upload limits".
// Stored as the "upload_limits" setting: { [type]: max size in MB }. Types without a
// saved value use the default below.

export const UPLOAD_LIMITS_KEY = "upload_limits"

// nginx accepts request bodies up to 100 MB (deploy/nginx/stancil.conf), so no limit
// can go above that.
export const MAX_ALLOWED_MB = 100

export type FileTypeInfo = {
  type: string
  label: string
  group: "Product photos" | "Pictures" | "Animations" | "Videos" | "Other"
  extensions: string[]
  mimes: string[]
  default_mb: number
  // Shown in the admin instead of the file endings, for rows that are not about one file type.
  applies?: string
}

// Uploads made from the admin's product pages (Medusa's own media screen) use this one
// limit instead of the per-type limits, so product photos can be kept small.
export const PRODUCT_PHOTO = "product_photo"

export const FILE_TYPES: FileTypeInfo[] = [
  {
    type: PRODUCT_PHOTO,
    label: "Product photos",
    group: "Product photos",
    extensions: [],
    mimes: [],
    default_mb: 3,
    applies: "Pictures, GIFs and videos added on a product page",
  },
  { type: "jpg", label: "JPG / JPEG", group: "Pictures", extensions: ["jpg", "jpeg"], mimes: ["image/jpeg"], default_mb: 5 },
  { type: "png", label: "PNG", group: "Pictures", extensions: ["png"], mimes: ["image/png"], default_mb: 10 },
  { type: "webp", label: "WebP", group: "Pictures", extensions: ["webp"], mimes: ["image/webp"], default_mb: 5 },
  { type: "avif", label: "AVIF", group: "Pictures", extensions: ["avif"], mimes: ["image/avif"], default_mb: 5 },
  { type: "svg", label: "SVG", group: "Pictures", extensions: ["svg"], mimes: ["image/svg+xml"], default_mb: 2 },
  { type: "gif", label: "GIF", group: "Animations", extensions: ["gif"], mimes: ["image/gif"], default_mb: 20 },
  { type: "mp4", label: "MP4", group: "Videos", extensions: ["mp4", "m4v"], mimes: ["video/mp4", "video/x-m4v"], default_mb: 50 },
  { type: "webm", label: "WebM", group: "Videos", extensions: ["webm"], mimes: ["video/webm"], default_mb: 50 },
  { type: "mov", label: "MOV", group: "Videos", extensions: ["mov"], mimes: ["video/quicktime"], default_mb: 50 },
  { type: "other", label: "Any other file", group: "Other", extensions: [], mimes: [], default_mb: 10, applies: "Anything else" },
]

export const FILE_TYPE_KEYS = FILE_TYPES.map((t) => t.type) as [string, ...string[]]

export type UploadLimit = FileTypeInfo & { max_mb: number }

// Merges saved values over the defaults.
export const resolveLimits = (stored: Record<string, unknown> | null): UploadLimit[] =>
  FILE_TYPES.map((t) => {
    const saved = stored?.[t.type]
    const max_mb = typeof saved === "number" && saved > 0 ? Math.min(saved, MAX_ALLOWED_MB) : t.default_mb
    return { ...t, max_mb }
  })

// Works out the file type from the name, falling back to the browser's MIME type.
export const fileTypeOf = (filename: string, mime?: string): FileTypeInfo => {
  const ext = filename.toLowerCase().split(".").pop() ?? ""
  return (
    FILE_TYPES.find((t) => t.extensions.includes(ext)) ??
    FILE_TYPES.find((t) => !!mime && t.mimes.includes(mime.toLowerCase())) ??
    FILE_TYPES[FILE_TYPES.length - 1]
  )
}

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

// Returns a plain-language reason when the file is over its limit, otherwise null.
export const checkUpload = (
  limits: UploadLimit[],
  file: { name: string; size: number; mime?: string },
  options: { productPhoto?: boolean } = {}
): string | null => {
  const type = fileTypeOf(file.name, file.mime).type
  // Only pictures, GIFs and videos count as product photos (not e.g. a product import CSV).
  const asPhoto = !!options.productPhoto && type !== "other"
  const limit = limits.find((l) => l.type === (asPhoto ? PRODUCT_PHOTO : type))
  if (!limit || file.size <= limit.max_mb * 1024 * 1024) {
    return null
  }
  const what = asPhoto ? "product photos" : `${limit.label} files`
  return `"${file.name}" is ${formatMb(file.size)}. The limit for ${what} is ${limit.max_mb} MB (Settings → Upload limits).`
}
