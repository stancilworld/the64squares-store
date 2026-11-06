import sharp from "sharp"
import heicDecode from "heic-decode"

// Every picture uploaded in the admin passes through here before it is stored:
// iPhone HEIC photos are converted, photos are turned the right way up, shrunk (product
// photos to PRODUCT_MAX_SIDE pixels, banners and other pictures to OTHER_MAX_SIDE), saved as WebP and stripped of hidden data (camera details, location).
// GIFs (may be animated), SVGs, videos and other files are left as they are.

export const PRODUCT_MAX_SIDE = 2000
// Website banners are designed at 2880 px wide.
export const OTHER_MAX_SIDE = 3000
export const WEBP_QUALITY = 84

// Small PNG/WebP files under this size are usually logos or icons: kept as they are so
// sharp edges don't pick up compression marks.
const KEEP_SMALL_GRAPHIC = 400 * 1024

export type ImageInput = { name: string; mime?: string; buffer: Buffer }
export type ImageOutput = { name: string; mime: string; buffer: Buffer; converted: boolean }

const extOf = (name: string) => name.toLowerCase().split(".").pop() ?? ""

// HEIC/HEIF files start with an "ftyp" box naming one of these brands.
const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]
export const isHeic = (file: { name: string; mime?: string; buffer: Buffer }) => {
  if (["heic", "heif"].includes(extOf(file.name))) return true
  if (file.mime && /image\/hei[cf]/i.test(file.mime)) return true
  if (file.buffer.length < 12 || file.buffer.toString("ascii", 4, 8) !== "ftyp") return false
  const brand = file.buffer.toString("ascii", 8, 12)
  // AVIF also uses mif1, so check the brand list but leave AVIF to sharp.
  return HEIF_BRANDS.includes(brand) && !file.buffer.toString("ascii", 8, 40).includes("avif")
}

const RASTER = ["jpg", "jpeg", "png", "webp", "avif", "tif", "tiff"]
const RASTER_MIMES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/tiff"]
export const isConvertible = (file: ImageInput) =>
  isHeic(file) || RASTER.includes(extOf(file.name)) || (!!file.mime && RASTER_MIMES.includes(file.mime.toLowerCase()))

export const webpName = (name: string) => {
  const base = name.replace(/\.[^./\\]+$/, "") || "photo"
  return `${base}.webp`
}

export class UnreadableImageError extends Error {}

// Opens the picture with sharp. HEIC is decoded first (sharp's build can't read it); the
// decoder already applies the photo's rotation.
const open = async (file: ImageInput) => {
  if (isHeic(file)) {
    let img: { width: number; height: number; data: Uint8ClampedArray }
    try {
      img = await heicDecode({ buffer: file.buffer })
    } catch {
      throw new UnreadableImageError(`"${file.name}" couldn't be read as a HEIC photo.`)
    }
    return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), {
      raw: { width: img.width, height: img.height, channels: 4 },
    })
  }
  return sharp(file.buffer, { failOn: "error" })
}

export const optimiseImage = async (
  file: ImageInput,
  { maxSide = PRODUCT_MAX_SIDE }: { maxSide?: number } = {}
): Promise<ImageOutput> => {
  const unchanged = { name: file.name, mime: file.mime ?? "application/octet-stream", buffer: file.buffer, converted: false }
  if (!isConvertible(file)) return unchanged

  const heic = isHeic(file)
  let meta: sharp.Metadata | null = null
  if (!heic) {
    try {
      meta = await sharp(file.buffer).metadata()
    } catch {
      throw new UnreadableImageError(`"${file.name}" couldn't be read as a picture.`)
    }
    const fits = (meta.width ?? 0) <= maxSide && (meta.height ?? 0) <= maxSide
    const upright = !meta.orientation || meta.orientation === 1
    const graphic = meta.format === "png" || (meta.format === "webp" && !!meta.hasAlpha)
    if (graphic && fits && file.buffer.length <= KEEP_SMALL_GRAPHIC) return unchanged
  }

  let out: Buffer
  try {
    const pipeline = await open(file)
    out = await pipeline
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .toColourspace("srgb")
      .webp({ quality: WEBP_QUALITY, alphaQuality: 100, effort: 5, smartSubsample: true })
      .toBuffer()
  } catch (e) {
    if (e instanceof UnreadableImageError) throw e
    throw new UnreadableImageError(`"${file.name}" couldn't be read as a picture.`)
  }

  // An already small, upright WebP stays as it is if converting would only make it bigger.
  if (
    meta &&
    meta.format === "webp" &&
    (!meta.orientation || meta.orientation === 1) &&
    (meta.width ?? 0) <= maxSide &&
    (meta.height ?? 0) <= maxSide &&
    out.length >= file.buffer.length
  ) {
    return unchanged
  }
  return { name: webpName(file.name), mime: "image/webp", buffer: out, converted: true }
}
