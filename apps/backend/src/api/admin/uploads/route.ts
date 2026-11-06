import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { checkUpload, resolveLimits, UPLOAD_LIMITS_KEY } from "../../../lib/upload-limits"
import { OTHER_MAX_SIDE, optimiseImage, PRODUCT_MAX_SIDE, UnreadableImageError } from "../../../lib/image-convert"
import { CONTENT_MODULE } from "../../../modules/content"
import ContentModuleService from "../../../modules/content/service"

// A file as parsed by Medusa's upload middleware (multer, kept in memory).
type ParsedFile = { originalname: string; mimetype: string; size: number; buffer: Buffer }

// POST /admin/uploads: replaces Medusa's built-in upload handler (same path, so Medusa's
// own file parsing still runs first). Pictures are converted first (HEIC to WebP, resized,
// turned upright; see lib/image-convert.ts), then the limits set under "Upload limits"
// are checked against the converted size. Every admin upload goes through here,
// including product photos.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const input = (req as unknown as { files?: ParsedFile[] }).files ?? []
  if (!input.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "No files were uploaded")
  }

  const service: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const limits = resolveLimits(await service.getSettingValue(UPLOAD_LIMITS_KEY))
  // Medusa's product screens upload from /app/products/...; those files use the product photo limit.
  const referer = req.get("referer") ?? ""
  const productPhoto = /\/app\/(products|product-editor)(\/|\?|$)/.test(new URL(referer, "http://x").pathname)
  // One at a time: a decoded phone photo takes about 50 MB of memory.
  const files: { name: string; mime: string; buffer: Buffer }[] = []
  for (const f of input) {
    try {
      files.push(
        await optimiseImage(
          { name: f.originalname, mime: f.mimetype, buffer: f.buffer },
          { maxSide: productPhoto ? PRODUCT_MAX_SIDE : OTHER_MAX_SIDE }
        )
      )
    } catch (e) {
      if (e instanceof UnreadableImageError) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, e.message)
      }
      throw e
    }
  }
  for (const f of files) {
    const problem = checkUpload(
      limits,
      { name: f.name, size: f.buffer.length, mime: f.mime },
      { productPhoto }
    )
    if (problem) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, problem)
    }
  }

  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: files.map((f) => ({
        filename: f.name,
        mimeType: f.mime,
        content: f.buffer.toString("base64"),
        access: "public" as const,
      })),
    },
  })
  res.status(200).json({ files: result })
}
