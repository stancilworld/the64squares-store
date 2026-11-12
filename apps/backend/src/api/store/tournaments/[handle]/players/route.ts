import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

type Pg = { raw: (q: string, b?: unknown[]) => Promise<{ rows: Record<string, any>[] }> }

// GET /store/tournaments/:handle/players: who is registered, as shown publicly: the name they
// play under (their username's display name, else first name and an initial), rating, state,
// and whether they've checked in. No contact details.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Pg
  const { rows: ts } = await pg.raw(`select id from tournament where (handle = ? or id = ?) and deleted_at is null and status <> 'draft'`, [req.params.handle, req.params.handle])
  if (!ts[0]) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Tournament not found")
  let rows: Record<string, any>[] = []
  try {
    rows = (
      await pg.raw(
        `select r.customer_id as id, r.player_name, r.rating, r.checked_in_at is not null as checked_in, r.created_at,
                p.display_name, p.username, p.avatar, c.metadata->'t64_player'->>'state' as state
           from tournament_registration r
           left join play.profile p on p.player_id = r.customer_id
           left join customer c on c.id = r.customer_id
          where r.tournament_id = ? and r.status = 'confirmed' and r.deleted_at is null
          order by r.rating desc nulls last, r.created_at asc`,
        [ts[0].id]
      )
    ).rows
  } catch {
    rows = (await pg.raw(`select customer_id as id, player_name, rating, checked_in_at is not null as checked_in from tournament_registration where tournament_id = ? and status = 'confirmed' and deleted_at is null`, [ts[0].id])).rows
  }
  const shortName = (full: string) => {
    const [first, ...rest] = String(full ?? "").trim().split(/\s+/)
    return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first || "Player"
  }
  res.set("Cache-Control", "public, max-age=15")
  res.json({
    players: rows.map((r) => ({
      id: r.id,
      name: r.display_name || shortName(r.player_name),
      username: r.username ?? null,
      avatar: r.avatar ?? null,
      rating: r.rating ?? null,
      state: r.state ?? null,
      checked_in: !!r.checked_in,
    })),
  })
}
