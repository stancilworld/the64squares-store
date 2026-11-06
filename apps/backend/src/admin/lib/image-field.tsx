import { Button, Label, Text, toast } from "@medusajs/ui"
import { useRef, useState } from "react"
import { isConvertedPicture, uploadImage } from "./upload"
import { limitFor, useUploadLimits } from "./upload-limits"

// The size to export for a spot (2x what it shows on a laptop), plus an optional tip.
// anyShape: the spot fits the whole file (no cropping), so only the size is checked.
export type RecommendedSize = { width: number; height: number; note?: string; anyShape?: boolean }

type Props = {
  label: string
  value: string | null
  onChange: (url: string | null) => void
  // Accept animations and videos (GIF, MP4, WebM) as well as pictures. On by default.
  allowVideo?: boolean
  recommended?: RecommendedSize
  // Called with the picked file once it is uploaded (e.g. to measure it).
  onFile?: (file: File, url: string) => void
}

const IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml,image/avif,image/heic,image/heif,.heic,.heif"
const MEDIA_TYPES = `${IMAGE_TYPES},image/gif,video/mp4,video/webm,video/quicktime`

export const isVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(url)

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

// Compares an uploaded file with the recommended size and returns plain-language warnings.
const checkFile = (
  actual: { width: number; height: number },
  want: RecommendedSize | undefined,
  bytes: number | null,
  video: boolean
): string[] => {
  const notes: string[] = []
  if (want && actual.width && actual.height) {
    if (actual.width < want.width * 0.6 || actual.height < want.height * 0.6) {
      notes.push(`Smaller than recommended, so it may look blurry on large screens.`)
    }
    const shape = actual.width / actual.height / (want.width / want.height)
    if (!want.anyShape && (shape < 0.9 || shape > 1.1)) {
      notes.push(
        `A different shape from ${want.width} × ${want.height}, so the website will crop its ${shape > 1 ? "left and right" : "top and bottom"} edges.`
      )
    }
  }
  if (bytes !== null) {
    if (video && bytes > 5 * 1024 * 1024) {
      notes.push(`${mb(bytes)} is heavy for phones. Under 5 MB loads faster.`)
    } else if (!video && bytes > 1024 * 1024) {
      notes.push(`${mb(bytes)} is heavy for phones. Under 500 KB loads faster.`)
    }
  }
  return notes
}

// Shows the current image (or video) with Upload / Remove buttons.
export const ImageField = ({ label, value, onChange, allowVideo = true, recommended, onFile }: Props) => {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const { data: limitData } = useUploadLimits()
  // Pixel size of what is shown, and the byte size of a file uploaded in this session.
  const [dims, setDims] = useState<{ url: string; width: number; height: number } | null>(null)
  const [upload, setUpload] = useState<{ url: string; bytes: number } | null>(null)
  const video = !!value && isVideoUrl(value)
  const svg = !!value && /\.svg(\?|#|$)/i.test(value)
  const current = dims && dims.url === value ? dims : null
  const warnings =
    value && current && !svg
      ? checkFile(current, recommended, upload?.url === value ? upload.bytes : null, video)
      : []

  const pick = async (file?: File) => {
    if (!file) {
      return
    }
    // Checked here for a quick answer; the server checks the same limits again. Pictures are
    // shrunk on the server first, so only their converted size counts.
    const converted = isConvertedPicture(file)
    const limit = !converted && limitData && limitFor(limitData.limits, file)
    if (limit && file.size > limit.max_mb * 1024 * 1024) {
      toast.error("File too large", {
        description: `This ${limit.label} is ${mb(file.size)}. The limit for ${limit.label} files is ${limit.max_mb} MB. Compress it, or raise the limit in Settings → Upload limits.`,
      })
      if (input.current) {
        input.current.value = ""
      }
      return
    }
    setBusy(true)
    try {
      const url = await uploadImage(file)
      if (!converted) setUpload({ url, bytes: file.size })
      onChange(url)
      onFile?.(file, url)
    } catch (e) {
      toast.error("Upload failed", { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-y-2">
      <Label>{label}</Label>
      {recommended && (
        <Text size="xsmall" className="-mt-1 text-ui-fg-subtle">
          Recommended: <span className="font-medium text-ui-fg-base">{recommended.width} × {recommended.height} px</span>
          {allowVideo ? " · picture, GIF or video" : ""}
          {recommended.note ? `. ${recommended.note}` : ""}
        </Text>
      )}
      {value && video ? (
        <video
          src={value}
          autoPlay
          muted
          loop
          playsInline
          onLoadedMetadata={(e) =>
            setDims({ url: value, width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })
          }
          className="h-32 w-full rounded-lg border object-contain bg-ui-bg-subtle"
        />
      ) : value ? (
        <img
          src={value}
          alt=""
          onLoad={(e) =>
            setDims({ url: value, width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
          }
          className="h-32 w-full rounded-lg border object-contain bg-ui-bg-subtle"
        />
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed bg-ui-bg-subtle">
          <Text size="small" className="text-ui-fg-subtle">
            {allowVideo ? "Nothing uploaded yet" : "No image yet"}
          </Text>
        </div>
      )}
      {value && current && !svg && (
        <div className="flex flex-col gap-y-0.5">
          <Text size="xsmall" className={warnings.length ? "text-ui-fg-subtle" : "text-ui-tag-green-text"}>
            This file: {current.width} × {current.height} px{warnings.length ? "" : ". Good fit."}
          </Text>
          {warnings.map((w) => (
            <Text key={w} size="xsmall" className="text-ui-tag-orange-text">
              {w}
            </Text>
          ))}
        </div>
      )}
      <div className="flex gap-x-2">
        <Button
          type="button"
          size="small"
          variant="secondary"
          isLoading={busy}
          onClick={() => input.current?.click()}
        >
          Upload
        </Button>
        {value && (
          <Button
            type="button"
            size="small"
            variant="transparent"
            onClick={() => onChange(null)}
          >
            Remove
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={allowVideo ? MEDIA_TYPES : IMAGE_TYPES}
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </div>
  )
}
