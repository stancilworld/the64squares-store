import { toBackend } from "../forward"

// The tags to load during a tag test started in the admin (not cached).
export async function GET(request: Request) {
  const check = new URL(request.url).searchParams.get("check") ?? ""
  if (!/^[a-f0-9]{32}$/.test(check)) return Response.json({ message: "Missing test code." }, { status: 400 })
  return toBackend(request, `/store/marketing/config?check=${check}`, { method: "GET" })
}
