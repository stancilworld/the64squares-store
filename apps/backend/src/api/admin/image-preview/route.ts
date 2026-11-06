import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { OTHER_MAX_SIDE, optimiseImage, UnreadableImageError } from "../../../lib/image-convert"

// Largest photo accepted for a preview (nginx allows up to 100 MB).
const MAX_BYTES = 60 * 1024 * 1024

const readBody = (req: AuthenticatedMedusaRequest) =>
  new Promise<Buffer>((resolve, reject) => {
    const parts: Buffer[] = []
    let size = 0
    req.on("data", (c: Buffer) => {
      size += c.length
      if (size > MAX_BYTES) {
        reject(new MedusaError(MedusaError.Types.INVALID_DATA, "This photo is over 60 MB."))
        req.destroy()
        return
      }
      parts.push(c)
    })
    req.on("end", () => resolve(Buffer.concat(parts)))
    req.on("error", reject)
  })

// POST /admin/image-preview: the raw photo as the body (file name in ?name=). Returns the
// photo as a WebP the browser can show, for the crop window when the browser can't open
// the original itself (HEIC on Chrome and Windows). Nothing is stored.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const name = typeof req.query.name === "string" && req.query.name ? req.query.name : "photo"
  const buffer = await readBody(req)
  if (!buffer.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "No photo was sent")
  }
  try {
    const out = await optimiseImage({ name, mime: req.get("content-type"), buffer }, { maxSide: OTHER_MAX_SIDE })
    res.setHeader("Content-Type", out.mime)
    res.setHeader("Cache-Control", "no-store")
    res.status(200).send(out.buffer)
  } catch (e) {
    if (e instanceof UnreadableImageError) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, e.message)
    }
    throw e
  }
}
