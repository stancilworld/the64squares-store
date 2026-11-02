import { useQuery } from "@tanstack/react-query"
import { sdk } from "./sdk"

// Mirrors the GET /admin/upload-limits response (see src/lib/upload-limits.ts).
export type UploadLimit = {
  type: string
  label: string
  group: string
  extensions: string[]
  mimes: string[]
  default_mb: number
  max_mb: number
  applies?: string
}
export type UploadLimitsResponse = { limits: UploadLimit[]; max_allowed_mb: number }

export const UPLOAD_LIMITS_QUERY = ["upload-limits"]

export const useUploadLimits = () =>
  useQuery({
    queryKey: UPLOAD_LIMITS_QUERY,
    queryFn: () => sdk.client.fetch<UploadLimitsResponse>("/admin/upload-limits"),
    staleTime: 60_000,
  })

// The limit that applies to a file, found by its ending, then by its type, else "other".
export const limitFor = (limits: UploadLimit[], file: File): UploadLimit | undefined => {
  const ext = file.name.toLowerCase().split(".").pop() ?? ""
  return (
    limits.find((l) => l.extensions.includes(ext)) ??
    limits.find((l) => l.mimes.includes(file.type.toLowerCase())) ??
    limits.find((l) => l.type === "other")
  )
}
