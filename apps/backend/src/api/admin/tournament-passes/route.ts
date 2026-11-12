import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { loadPassRules, PASS_RULES_KEY, REASON_LABELS } from "../../../lib/passes"
import { saveSettingWorkflow } from "../../../workflows/setting"
import type { PassRulesBodyType } from "../validators"

type Row = Record<string, any>

// GET /admin/tournament-passes: the earning rules, totals and the latest pass changes
// (?q= an email or name to see one player's wallet).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as { raw: (q: string, b?: unknown[]) => Promise<{ rows: Row[] }> }
  const q = String(req.query.q ?? "").trim().toLowerCase()
  const where = q ? "and (lower(c.email) like ? or lower(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) like ?)" : ""
  const args = q ? [`%${q}%`, `%${q}%`] : []
  const { rows: entries } = await pg.raw(
    `select p.id, p.customer_id, p.delta, p.reason, p.note, p.created_at, c.email, trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) as name,
            (select coalesce(sum(x.delta),0)::int from pass_entry x where x.customer_id = p.customer_id and x.deleted_at is null) as balance
       from pass_entry p left join customer c on c.id = p.customer_id
      where p.deleted_at is null ${where} order by p.created_at desc limit 100`,
    args
  )
  const { rows: totals } = await pg.raw(
    `select coalesce(sum(delta) filter (where delta > 0), 0)::int as earned, coalesce(-sum(delta) filter (where reason = 'join'), 0)::int as spent,
            count(distinct customer_id)::int as players from pass_entry where deleted_at is null`
  )
  res.json({ rules: await loadPassRules(req.scope), entries: entries.map((e) => ({ ...e, reason_label: REASON_LABELS[e.reason] ?? e.reason })), totals: totals[0] })
}

// POST /admin/tournament-passes: change how passes are earned.
export const POST = async (req: AuthenticatedMedusaRequest<PassRulesBodyType>, res: MedusaResponse) => {
  await saveSettingWorkflow(req.scope).run({ input: { key: PASS_RULES_KEY, value: req.validatedBody } })
  res.json({ rules: await loadPassRules(req.scope) })
}
