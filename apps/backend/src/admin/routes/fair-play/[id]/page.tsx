import { Badge, Button, Container, Heading, Table, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { sdk } from "../../../lib/sdk"
import { useStoreUrl } from "../../../lib/site"
import { scoreColour, STATUS_BADGE } from "../page"

type Game = {
  game_id: string
  colour: "w" | "b"
  rating: number | null
  analysed: number
  accuracy: number
  match_pct: number
  acpl: number
  time_cv: number | null
  focus_losses: number
  away_ms: number
  risk: number
  reasons: string[]
  white_name: string
  black_name: string
  result: string
  initial_ms: number
  increment_ms: number
  mode: string
  ended_at: string
}
type Detail = {
  flag: { id: number; player_id: string; name: string; username: string | null; email: string | null; score: number; reasons: string[]; status: string; note: string | null; reviewed_at: string | null }
  games: Game[]
  ratings: { speed: string; rating: number; games: number }[]
}

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

const FairPlayDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const store = useStoreUrl()
  const [note, setNote] = useState("")
  const { data, isLoading } = useQuery({
    queryKey: ["fair-play-flag", id],
    queryFn: () => sdk.client.fetch<Detail>(`/admin/fair-play/${id}`),
  })
  const decide = useMutation({
    mutationFn: (body: { action: string; scope?: string; note?: string }) => sdk.client.fetch<{ status: string; refunded: number }>(`/admin/fair-play/${id}`, { method: "POST", body }),
    onSuccess: (r) => {
      toast.success(r.refunded ? `Done. Gave back rating points to ${r.refunded} opponents.` : "Done.")
      qc.invalidateQueries({ queryKey: ["fair-play"] })
      qc.invalidateQueries({ queryKey: ["fair-play-flag", id] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading || !data) return <Container className="p-6">Loading...</Container>
  const { flag, games, ratings } = data
  const go = (action: string, scope?: string) => {
    if (action === "ban" && !window.confirm(`Ban ${flag.name} from ${scope === "all" ? "all games with other players" : "rated games and tournaments"}?`)) return
    decide.mutate({ action, scope, note: note.trim() || undefined })
  }

  return (
    <div className="flex flex-col gap-3">
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
          <div>
            <button type="button" className="text-[13px] text-ui-fg-subtle hover:underline" onClick={() => navigate("/fair-play")}>
              ← Fair play
            </button>
            <Heading level="h1" className="mt-1">
              {flag.name}
            </Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {flag.username ? `@${flag.username} · ` : ""}
              {flag.email ?? flag.player_id}
            </Text>
            <div className="mt-2 flex gap-2">
              <Badge size="2xsmall" color={scoreColour(flag.score)}>
                Suspicion {flag.score} / 100
              </Badge>
              <Badge size="2xsmall" color={STATUS_BADGE[flag.status]?.color ?? "grey"}>
                {STATUS_BADGE[flag.status]?.label ?? flag.status}
              </Badge>
              {ratings.map((r) => (
                <Badge key={r.speed} size="2xsmall" color="grey">
                  {r.speed} {r.rating} ({r.games} games)
                </Badge>
              ))}
            </div>
          </div>
          {flag.username && store && (
            <a href={`${store}/play/player/${flag.username}`} target="_blank" rel="noreferrer" className="text-[13px] text-ui-fg-interactive hover:underline">
              Public profile ↗
            </a>
          )}
        </div>
        <div className="px-6 py-4">
          <Text size="small" weight="plus">
            Why they were flagged
          </Text>
          <ul className="mt-1 list-disc pl-5">
            {flag.reasons.map((r) => (
              <li key={r}>
                <Text size="small">{r}</Text>
              </li>
            ))}
          </ul>
          <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
            Accuracy is how close the moves were to the engine&apos;s (100% = perfect). Strong humans have good games too, so look at several games
            together, and at the game replays, before deciding.
          </Text>
        </div>
        <div className="flex flex-col gap-3 px-6 py-4">
          <Textarea placeholder="Note for the record (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button size="small" variant="secondary" disabled={decide.isPending} onClick={() => go("clear")}>
              Looks fair: clear
            </Button>
            <Button size="small" variant="secondary" disabled={decide.isPending} onClick={() => go("warn")}>
              Warn the player
            </Button>
            <Button size="small" variant="danger" disabled={decide.isPending} onClick={() => go("ban", "rated")}>
              Ban from rated games
            </Button>
            <Button size="small" variant="danger" disabled={decide.isPending} onClick={() => go("ban", "all")}>
              Ban from all play
            </Button>
            {flag.status === "banned" && (
              <Button size="small" variant="secondary" disabled={decide.isPending} onClick={() => go("unban")}>
                Lift the ban
              </Button>
            )}
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            A ban gives back the rating points opponents lost to this player in the last 90 days, and removes them from the leaderboard. Warned and
            banned players see a notice in Play.
          </Text>
        </div>
      </Container>

      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Checked games</Heading>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Game</Table.HeaderCell>
              <Table.HeaderCell>Accuracy</Table.HeaderCell>
              <Table.HeaderCell>Engine match</Table.HeaderCell>
              <Table.HeaderCell>Avg. loss</Table.HeaderCell>
              <Table.HeaderCell>Left the game</Table.HeaderCell>
              <Table.HeaderCell>Even timing</Table.HeaderCell>
              <Table.HeaderCell>Risk</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {games.map((g) => (
              <Table.Row key={g.game_id}>
                <Table.Cell>
                  {store ? (
                    <a href={`${store}/play/${g.game_id}`} target="_blank" rel="noreferrer" className="text-ui-fg-interactive hover:underline">
                      {g.white_name} – {g.black_name}
                    </a>
                  ) : (
                    `${g.white_name} – ${g.black_name}`
                  )}
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {g.result} · {g.initial_ms / 60000}+{g.increment_ms / 1000} · {g.mode} · played {g.colour === "w" ? "white" : "black"} at {g.rating ?? "?"} ·{" "}
                    {when(g.ended_at)}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  {g.accuracy}% <span className="text-ui-fg-subtle">({g.analysed} moves)</span>
                </Table.Cell>
                <Table.Cell>{g.match_pct}%</Table.Cell>
                <Table.Cell>{g.acpl} cp</Table.Cell>
                <Table.Cell>{g.focus_losses ? `${g.focus_losses}× (${Math.round(g.away_ms / 1000)} s)` : "—"}</Table.Cell>
                <Table.Cell>{g.time_cv == null ? "—" : g.time_cv < 0.35 ? `Yes (${g.time_cv})` : `No (${g.time_cv})`}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={scoreColour(g.risk)}>
                    {g.risk}
                  </Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Container>
    </div>
  )
}

export default FairPlayDetail
