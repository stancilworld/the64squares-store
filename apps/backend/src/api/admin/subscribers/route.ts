import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /admin/subscribers            -> JSON list, newest first
// GET /admin/subscribers?format=csv -> CSV download
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "subscriber",
    fields: ["id", "email", "source", "created_at"],
  })
  const subscribers = [...data].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  if (req.query.format === "csv") {
    const cell = (v: string) => `"${v.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`
    const csv = ["date,email,source"]
      .concat(
        subscribers.map((s) =>
          [new Date(s.created_at).toISOString().slice(0, 19).replace("T", " "), s.email, s.source]
            .map((v) => cell(String(v)))
            .join(",")
        )
      )
      .join("\n")
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", 'attachment; filename="subscribers.csv"')
    res.send(csv)
    return
  }
  res.json({ subscribers })
}
