import { Badge, Button, Checkbox, Container, Heading, Input, Label, Select, Table, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "./sdk"
import type { Registration, Tournament } from "./tournaments"

// The tournament page's tools for online events: the control room while it runs, every
// game (to correct a result), the results and fair-play review, prizes, messages, and the
// funnel from page visits to players who played.

type EngineGame = {
  round: number
  board: number
  game_no: number
  white_id: string
  black_id: string | null
  game_id: string | null
  result: string | null
  forfeit: boolean
  armageddon: boolean
  fixed_by: string | null
  fix_note: string | null
  white_name: string | null
  black_name: string | null
  game_status: string | null
}

type Engine = {
  state: { phase: "running" | "finished" | "cancelled_low"; round: number; note: string | null; started_at: string; finished_at: string | null } | null
  games: EngineGame[]
  entrants: { player_id: string; name: string; rating: number; seed: number }[]
  arena: { player_id: string; name: string; score: number; games: number; wins: number }[]
}

type Funnel = { total: Row; sources: Row[] }
type Row = { source: string; visits: number; registered: number; joined: number; played: number }

const RESULT_LABEL: Record<string, string> = { "1-0": "White won", "0-1": "Black won", "1/2-1/2": "Draw" }
const score = (r: string | null) => (r === "1/2-1/2" ? "½–½" : r ? r.replace("-", "–") : "")

const useControl = (id: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => sdk.client.fetch<{ message: string }>(`/admin/tournaments/${id}/control`, { method: "POST", body }),
    onSuccess: (r) => {
      toast.success(r.message)
      qc.invalidateQueries({ queryKey: ["tournament", id] })
      qc.invalidateQueries({ queryKey: ["tournaments"] })
    },
    onError: (e: Error) => toast.error("Could not do that", { description: e.message }),
  })
}

export const useEngine = (t: Tournament) =>
  useQuery({
    queryKey: ["tournament", t.id, "engine"],
    queryFn: () => sdk.client.fetch<Engine>(`/admin/tournaments/${t.id}/engine`),
    enabled: t.mode === "online",
    refetchInterval: t.status === "published" && new Date(t.starts_at).getTime() < Date.now() + 3600_000 ? 5000 : false,
  })

const phaseOf = (t: Tournament, e: Engine | undefined) => {
  if (t.status === "cancelled") return { label: "Called off", color: "red" as const, text: t.cancel_reason ?? "" }
  if (t.status === "completed") return t.results_final_at ? { label: "Results final", color: "green" as const, text: "Prizes confirmed." } : { label: "Fair-play review", color: "orange" as const, text: "Results are provisional until the prize places are reviewed." }
  const started = new Date(t.starts_at).getTime() <= Date.now()
  if (!started) return { label: "Not started", color: "grey" as const, text: "" }
  if (t.format === "arena") return { label: t.paused ? "Paused" : "Live", color: t.paused ? ("orange" as const) : ("red" as const), text: `${e?.arena.length ?? 0} players have played.${t.paused ? " The clock keeps running to the end time." : ""}` }
  if (!e?.state) return { label: "Starting", color: "orange" as const, text: "Pairing the first round…" }
  if (e.state.phase === "finished") return { label: "Finished", color: "blue" as const, text: "Results are being written." }
  if (e.state.phase === "cancelled_low") return { label: "Too few players", color: "red" as const, text: e.state.note ?? "" }
  return { label: t.paused ? "Paused" : "Live", color: t.paused ? ("orange" as const) : ("red" as const), text: `Round ${e.state.round} · ${e.entrants.length} players` }
}

// Start, pause, call off; the state of the event at a glance.
export function ControlRoom({ t, engine }: { t: Tournament; engine: Engine | undefined }) {
  const prompt = usePrompt()
  const control = useControl(t.id)
  const [reason, setReason] = useState("")
  const [cancelling, setCancelling] = useState(false)
  const p = phaseOf(t, engine)
  const before = new Date(t.starts_at).getTime() > Date.now()
  const open = t.status === "published"
  return (
    <Container className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Heading level="h2">Control room</Heading>
          <Badge size="2xsmall" color={p.color}>
            {p.label}
          </Badge>
          {p.text && (
            <Text size="small" className="text-ui-fg-subtle">
              {p.text}
            </Text>
          )}
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            {before && (
              <Button
                size="small"
                variant="secondary"
                isLoading={control.isPending}
                onClick={async () => {
                  if (await prompt({ title: "Start it now?", description: "Registration closes and players who checked in are paired straight away.", confirmText: "Start now" })) control.mutate({ action: "start_now" })
                }}
              >
                Start now
              </Button>
            )}
            <Button size="small" variant="secondary" isLoading={control.isPending} onClick={() => control.mutate({ action: t.paused ? "resume" : "pause" })}>
              {t.paused ? "Resume pairing" : "Pause pairing"}
            </Button>
            <Button size="small" variant="danger" onClick={() => setCancelling((c) => !c)}>
              Call it off
            </Button>
          </div>
        )}
      </div>
      {t.paused && open && (
        <Text size="small" className="rounded-md bg-ui-bg-subtle px-3 py-2">
          Paused: no new games start. Games being played carry on. Players see "Paused by the arbiter" on the page.
        </Text>
      )}
      {cancelling && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <Label htmlFor="cancel-reason">Why? (players are told, and every pass goes back)</Label>
          <Input id="cancel-reason" value={reason} placeholder="e.g. Server maintenance; we'll run it next Sunday." onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button size="small" variant="danger" disabled={reason.trim().length < 3} isLoading={control.isPending} onClick={() => control.mutate({ action: "cancel", reason }, { onSuccess: () => setCancelling(false) })}>
              Call off and return passes
            </Button>
            <Button size="small" variant="transparent" onClick={() => setCancelling(false)}>
              Keep it on
            </Button>
          </div>
        </div>
      )}
    </Container>
  )
}

// Every game, newest round first; staff can correct a result (with a reason players see).
export function GamesPanel({ t, engine, storeUrl }: { t: Tournament; engine: Engine | undefined; storeUrl: string | null }) {
  const control = useControl(t.id)
  const [fixing, setFixing] = useState<string | null>(null)
  const [result, setResult] = useState("1-0")
  const [note, setNote] = useState("")
  const games = engine?.games ?? []
  if (t.format === "arena" || !games.length) return null
  const rounds = [...new Set(games.map((g) => g.round))]
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Games</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Correct a result after an arbiter's decision. Standings, pairings and the bracket update by themselves.
        </Text>
      </div>
      {rounds.map((round) => (
        <div key={round} className="px-6 py-3">
          <Text size="small" weight="plus" className="mb-2">
            Round {round}
          </Text>
          <div className="flex flex-col gap-1">
            {games
              .filter((g) => g.round === round)
              .map((g) => {
                const key = `${g.round}-${g.board}-${g.game_no}`
                return (
                  <div key={key} className="flex flex-col gap-2 rounded-md px-2 py-1.5 hover:bg-ui-bg-subtle">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="w-14 text-ui-fg-subtle">Board {g.board}{g.game_no > 1 ? `.${g.game_no}` : ""}</span>
                      <span className="min-w-0 flex-1">
                        {g.white_name ?? "?"} <span className="text-ui-fg-subtle">vs</span> {g.black_id ? (g.black_name ?? "?") : <em>bye</em>}
                      </span>
                      <span className="w-14 font-semibold tabular-nums">{g.black_id ? (score(g.result) || (g.game_id ? "playing" : "–")) : "1"}</span>
                      {g.forfeit && <Badge size="2xsmall">Forfeit</Badge>}
                      {g.armageddon && <Badge size="2xsmall">Sudden death</Badge>}
                      {g.fixed_by && <Badge size="2xsmall" color="orange">Corrected: {g.fix_note}</Badge>}
                      {g.game_id && storeUrl && (
                        <a className="text-ui-fg-interactive text-sm" href={`${storeUrl}/play/${g.result ? "analysis/" : ""}${g.game_id}`} target="_blank" rel="noreferrer">
                          {g.result ? "Replay" : "Watch"}
                        </a>
                      )}
                      {g.black_id && (
                        <Button size="small" variant="transparent" onClick={() => (setFixing(fixing === key ? null : key), setResult(g.result ?? "1-0"), setNote(""))}>
                          Correct
                        </Button>
                      )}
                    </div>
                    {fixing === key && (
                      <div className="flex flex-wrap items-end gap-2 pb-2 pl-14">
                        <Select size="small" value={result} onValueChange={setResult}>
                          <Select.Trigger className="w-36">
                            <Select.Value />
                          </Select.Trigger>
                          <Select.Content>
                            {Object.entries(RESULT_LABEL).map(([v, l]) => (
                              <Select.Item key={v} value={v}>
                                {l}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select>
                        <Input size="small" className="min-w-[260px] flex-1" placeholder="Reason, e.g. Arbiter upheld an illegal-move claim" value={note} onChange={(e) => setNote(e.target.value)} />
                        <Button
                          size="small"
                          disabled={note.trim().length < 3}
                          isLoading={control.isPending}
                          onClick={() => control.mutate({ action: "fix_result", round: g.round, board: g.board, game_no: g.game_no, result, note }, { onSuccess: () => setFixing(null) })}
                        >
                          Save result
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      ))}
    </Container>
  )
}

const REVIEW: Record<string, { label: string; color: "orange" | "green" | "red" }> = {
  pending: { label: "Review", color: "orange" },
  cleared: { label: "Cleared", color: "green" },
  disqualified: { label: "Disqualified", color: "red" },
}
const PRIZE: Record<string, string> = { due: "Waiting for review", address: "Waiting for address", shipped: "Sent", delivered: "Delivered" }

// Placings, the fair-play review of the prize places, prize delivery and certificates.
export function ResultsPanel({ t, regs, storeUrl }: { t: Tournament; regs: Registration[]; storeUrl: string | null }) {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const control = useControl(t.id)
  const [tracking, setTracking] = useState<Record<string, string>>({})
  const update = useMutation({
    mutationFn: ({ r, body }: { r: Registration; body: Record<string, unknown> }) => sdk.client.fetch(`/admin/tournaments/${t.id}/registrations/${r.id}/result`, { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tournament", t.id] }),
    onError: (e: Error) => toast.error("Could not update", { description: e.message }),
  })
  const placed = regs.filter((r) => r.final_rank != null && r.status === "confirmed").sort((a, b) => a.final_rank! - b.final_rank!)
  if (!placed.length) return null
  const pending = placed.filter((r) => r.review === "pending").length
  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h2">Results</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t.results_final_at
              ? "Final. Prize winners were asked for their address."
              : pending
                ? `${pending} prize place${pending === 1 ? "" : "s"} to review. Check their games (Fair play lists any flags), then clear or disqualify. Results become final automatically 48 hours after the end once nothing is left to review.`
                : "Reviewed. Make the results final to ask winners for their address."}
          </Text>
        </div>
        {!t.results_final_at && (
          <Button
            size="small"
            isLoading={control.isPending}
            onClick={async () => {
              if (pending && !(await prompt({ title: "Make the results final?", description: `${pending} player${pending === 1 ? " hasn't" : "s haven't"} been reviewed yet; they'll be marked cleared.`, confirmText: "Make final" }))) return
              control.mutate({ action: "finalize", force: pending > 0 })
            }}
          >
            Make results final
          </Button>
        )}
      </div>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>#</Table.HeaderCell>
            <Table.HeaderCell>Player</Table.HeaderCell>
            <Table.HeaderCell>Score</Table.HeaderCell>
            <Table.HeaderCell>Fair play</Table.HeaderCell>
            <Table.HeaderCell>Prize</Table.HeaderCell>
            <Table.HeaderCell>Certificate</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {placed.map((r) => (
            <Table.Row key={r.id}>
              <Table.Cell className="font-semibold tabular-nums">{r.final_rank}</Table.Cell>
              <Table.Cell>
                <span className="font-medium">{r.player_name}</span>
                <span className="block text-ui-fg-subtle txt-compact-xsmall">{r.city ?? r.email}</span>
              </Table.Cell>
              <Table.Cell className="tabular-nums">{r.score ?? "–"}</Table.Cell>
              <Table.Cell>
                {r.review ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge size="2xsmall" color={REVIEW[r.review].color}>
                      {REVIEW[r.review].label}
                    </Badge>
                    {r.review !== "cleared" && (
                      <Button size="small" variant="transparent" onClick={() => update.mutate({ r, body: { review: "cleared", review_note: null } })}>
                        Clear
                      </Button>
                    )}
                    {r.review !== "disqualified" && (
                      <Button
                        size="small"
                        variant="transparent"
                        onClick={async () => {
                          const note = window.prompt(`Why is ${r.player_name} disqualified? (kept with the result)`)
                          if (note && note.trim().length > 2) update.mutate({ r, body: { review: "disqualified", review_note: note.trim() } })
                        }}
                      >
                        Disqualify
                      </Button>
                    )}
                    {r.review_note && <span className="text-ui-fg-subtle txt-compact-xsmall">{r.review_note}</span>}
                  </div>
                ) : (
                  <span className="text-ui-fg-subtle">–</span>
                )}
              </Table.Cell>
              <Table.Cell>
                {r.prize_title ? (
                  <div className="flex flex-col gap-1 py-1">
                    <span>{r.prize_title}</span>
                    <span className="text-ui-fg-subtle txt-compact-xsmall">{PRIZE[r.prize_status ?? "due"]}</span>
                    {r.prize_address && (
                      <span className="txt-compact-xsmall">
                        {r.prize_address.name}, {r.prize_address.line1}
                        {r.prize_address.line2 ? `, ${r.prize_address.line2}` : ""}, {r.prize_address.city}, {r.prize_address.state} {r.prize_address.pincode} · {r.prize_address.phone}
                      </span>
                    )}
                    {r.prize_status === "address" && r.prize_address && (
                      <div className="flex gap-1">
                        <Input size="small" placeholder="Courier and tracking" value={tracking[r.id] ?? ""} onChange={(e) => setTracking((s) => ({ ...s, [r.id]: e.target.value }))} />
                        <Button size="small" variant="secondary" onClick={() => update.mutate({ r, body: { prize_status: "shipped", prize_tracking: tracking[r.id] || null } })}>
                          Mark sent
                        </Button>
                      </div>
                    )}
                    {r.prize_status === "shipped" && (
                      <Button size="small" variant="transparent" className="self-start" onClick={() => update.mutate({ r, body: { prize_status: "delivered" } })}>
                        Mark delivered{r.prize_tracking ? ` (${r.prize_tracking})` : ""}
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-ui-fg-subtle">–</span>
                )}
              </Table.Cell>
              <Table.Cell>
                {r.certificate_no && storeUrl ? (
                  <a className="font-mono text-ui-fg-interactive txt-compact-xsmall" href={`${storeUrl}/certificates/${r.certificate_no}`} target="_blank" rel="noreferrer">
                    {r.certificate_no}
                  </a>
                ) : (
                  "–"
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

// Email (and WhatsApp, when set up) to everyone registered.
export function MessagePanel({ t }: { t: Tournament }) {
  const control = useControl(t.id)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [onlyIn, setOnlyIn] = useState(false)
  return (
    <Container className="flex flex-col gap-3">
      <Heading level="h2">Message the players</Heading>
      <Input placeholder="Subject, e.g. Round 3 starts in 5 minutes" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} />
      <Textarea rows={3} placeholder="Message" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Checkbox id="only-in" checked={onlyIn} onCheckedChange={(v) => setOnlyIn(v === true)} />
          <Label htmlFor="only-in" className="txt-compact-small">
            Only players who checked in
          </Label>
        </div>
        <Button
          size="small"
          disabled={subject.trim().length < 3 || body.trim().length < 3}
          isLoading={control.isPending}
          onClick={() => control.mutate({ action: "message", subject, body, only_checked_in: onlyIn }, { onSuccess: () => (setSubject(""), setBody("")) })}
        >
          Send
        </Button>
      </div>
    </Container>
  )
}

// Visits → registered → joined → played, by where people came from.
export function FunnelPanel({ t }: { t: Tournament }) {
  const { data } = useQuery({ queryKey: ["tournament", t.id, "funnel"], queryFn: () => sdk.client.fetch<Funnel>(`/admin/tournaments/${t.id}/funnel`) })
  if (!data) return null
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–")
  const steps: [keyof Row, string][] = [
    ["visits", "Visited the page"],
    ["registered", "Registered"],
    ["joined", "Joined (checked in or played)"],
    ["played", "Finished"],
  ]
  const top = Math.max(1, data.total.visits, data.total.registered)
  return (
    <Container className="flex flex-col gap-4">
      <div>
        <Heading level="h2">Funnel</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Where players came from (utm_source on your links, or the site that sent them).
        </Text>
      </div>
      <div className="flex flex-col gap-2">
        {steps.map(([k, label], i) => {
          const n = data.total[k] as number
          const prev = i ? (data.total[steps[i - 1][0]] as number) : null
          return (
            <div key={k} className="grid grid-cols-[200px_1fr_90px] items-center gap-3 text-sm">
              <span>{label}</span>
              <span className="h-6 overflow-hidden rounded bg-ui-bg-subtle">
                <span className="block h-full rounded bg-ui-fg-interactive" style={{ width: `${Math.max(2, (n / top) * 100)}%` }} />
              </span>
              <span className="tabular-nums">
                {n}
                {prev != null && <span className="ml-1 text-ui-fg-subtle">{pct(n, prev)}</span>}
              </span>
            </div>
          )
        })}
      </div>
      {data.sources.length > 1 && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Source</Table.HeaderCell>
              <Table.HeaderCell>Visits</Table.HeaderCell>
              <Table.HeaderCell>Registered</Table.HeaderCell>
              <Table.HeaderCell>Joined</Table.HeaderCell>
              <Table.HeaderCell>Finished</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.sources.map((s) => (
              <Table.Row key={s.source}>
                <Table.Cell>{s.source}</Table.Cell>
                <Table.Cell>{s.visits}</Table.Cell>
                <Table.Cell>{s.registered}</Table.Cell>
                <Table.Cell>{s.joined}</Table.Cell>
                <Table.Cell>{s.played}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}
