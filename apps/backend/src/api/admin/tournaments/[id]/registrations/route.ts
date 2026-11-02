import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { registrationsCsv } from "../../../../../lib/tournaments"

// GET /admin/tournaments/:id/registrations (?format=csv for a spreadsheet file).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "tournament_registration",
    fields: ["*"],
    filters: { tournament_id: req.params.id } as never,
  })
  const rows = [...data].sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime())
  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="players-${req.params.id}.csv"`)
    return res.send("﻿" + registrationsCsv(rows))
  }
  res.json({ registrations: rows })
}
