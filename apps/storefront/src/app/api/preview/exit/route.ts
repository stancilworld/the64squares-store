import { draftMode } from "next/headers"
import { redirect } from "next/navigation"

// Leaves preview and shows the page as shoppers see it.
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("path") ?? "/"
  const path = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/"
  ;(await draftMode()).disable()
  redirect(path)
}
