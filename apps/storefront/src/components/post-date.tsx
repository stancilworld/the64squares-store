import { postDateParts } from "@/lib/format"

export function PostDate({ iso, className = "" }: { iso: string | null; className?: string }) {
  const parts = postDateParts(iso)
  if (!parts) {
    return null
  }
  return (
    <time dateTime={iso ?? undefined} className={`italic text-[#949494] ${className}`}>
      {parts.day}
      <sup className="text-[0.6em]">{parts.suffix}</sup>
      {parts.rest}
    </time>
  )
}
