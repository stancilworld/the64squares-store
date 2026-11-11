import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { OTHER_MAX_SIDE, optimiseImage, UnreadableImageError } from "../../../../../lib/image-convert"
import { photoSig } from "../../../../../lib/reviews"
import { loadSiteFeatures } from "../../../../../lib/site-features"

const MAX_FILES = 3
const MAX_BYTES = 10 * 1024 * 1024

// POST /store/account/reviews/photos { files: [{ name, type, data (base64) }] }: photos for
// the shopper's review (Website → Site features → Review photos). Converted and shrunk like
// admin uploads; each comes back with a signature the review must carry.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const f = (await loadSiteFeatures(req.scope)).reviews
  if (!f.enabled || !f.photos) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Photos can't be added to reviews right now.")
  const input = ((req.body ?? {}) as { files?: unknown }).files
  if (!Array.isArray(input) || !input.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "No photos were sent.")
  if (input.length > MAX_FILES) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Up to ${MAX_FILES} photos.`)
  const files: { name: string; mime: string; buffer: Buffer }[] = []
  for (const raw of input) {
    const { name, type, data } = (raw ?? {}) as { name?: unknown; type?: unknown; data?: unknown }
    if (typeof data !== "string" || typeof type !== "string" || !/^image\//.test(type)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Only photos can be added.")
    const buffer = Buffer.from(data, "base64")
    if (!buffer.length || buffer.length > MAX_BYTES) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Each photo must be under 10 MB.")
    try {
      files.push(await optimiseImage({ name: typeof name === "string" ? name.slice(0, 80) : "review.jpg", mime: type, buffer }, { maxSide: OTHER_MAX_SIDE }))
    } catch (e) {
      if (e instanceof UnreadableImageError) throw new MedusaError(MedusaError.Types.INVALID_DATA, "That photo couldn't be read. Please try a JPG or PNG.")
      throw e
    }
  }
  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: { files: files.map((x) => ({ filename: `review-${x.name}`, mimeType: x.mime, content: x.buffer.toString("base64"), access: "public" as const })) },
  })
  res.json({ photos: result.map((r) => ({ url: r.url, sig: photoSig(r.url) })) })
}
