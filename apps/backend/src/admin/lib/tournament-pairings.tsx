import { Badge, Button, Container, Heading, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "./sdk"
import type { Tournament } from "./tournaments"

// A tournament's pairings and schedule, from the game server. For a scheduled tournament
// staff close registration (or it closes by itself), check the pairings, swap players if
// needed (knockout: seeds, before the start), and share the schedule on WhatsApp.

type Side = { id: string; name: string; rating: number | null; seed: number | null } | null
type View = {
  format: string
  start_mode: "checkin" | "scheduled"
  round_times: (number | null)[]
  join_minutes: number
  locks_at: number | null
  state: { phase: string; round: number } | null
  entrants: { id: string; name: string; rating: number; seed: number; withdrawn: boolean }[]
  upcoming: { round: number; at: number | null; fixed: boolean; games: { board: number; white: Side; black: Side }[] } | null
  bracket?: { rounds: { round: number; name: string; matches: { board: number; a: Side; b: Side }[] }[] }
}

const when = (at: number | null | undefined) =>
  at ? new Date(at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "after the break"

// The schedule as a WhatsApp message.
export const scheduleText = (t: Tournament, v: View | null, storeUrl: string | null) => {
  const link = storeUrl ? `${storeUrl}/play/tournaments/${t.handle}` : ""
  const lines = [`♟ *${t.title}*`, `${t.time_control} · ${t.format === "round_robin" ? "Round robin" : t.format[0].toUpperCase() + t.format.slice(1)}`]
  if (v?.round_times?.length) {
    lines.push("", "*Schedule*")
    v.round_times.forEach((at, i) => lines.push(`Round ${i + 1}: ${when(at)}`))
  }
  const pairs =
    v?.upcoming?.games.map((g) => `${g.board}. ${g.white?.name ?? "?"} vs ${g.black?.name ?? "bye"}`) ??
    (v?.format === "knockout" && v.bracket?.rounds[0] ? v.bracket.rounds[0].matches.map((m) => `${m.board}. ${m.a?.name ?? "?"} vs ${m.b?.name ?? "bye"}`) : [])
  if (pairs.length) lines.push("", `*${v?.upcoming ? `Round ${v.upcoming.round} pairings` : "First round"}*`, ...pairs)
  lines.push("", v?.state ? `Be in the lobby at your match time, you have ${v.join_minutes} minutes to press Ready:` : "Register here:", `${link}${v?.state ? "/lobby" : ""}`)
  return lines.join("\n")
}

export function PairingsPanel({ t, storeUrl }: { t: Tournament; storeUrl: string | null }) {
  const qc = useQueryClient()
  const key = ["tournament", t.id, "pairings"]
  const q = useQuery({ queryKey: key, queryFn: () => sdk.client.fetch<{ view: View | null }>(`/admin/tournaments/${t.id}/pairings`), refetchInterval: 10_000, retry: false })
  const [pick, setPick] = useState<string[]>([])
  const prompt = usePrompt()
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => sdk.client.fetch<{ message: string }>(`/admin/tournaments/${t.id}/pairings`, { method: "POST", body }),
    onSuccess: (r) => {
      toast.success(r.message)
      setPick([])
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ["tournament", t.id] })
    },
    onError: (e: Error) => toast.error("Couldn't do that", { description: e.message }),
  })
  const v = q.data?.view ?? null
  const scheduled = t.start_mode === "scheduled"
  const locked = !!v?.state
  const ko = t.format === "knockout"
  const choose = (id?: string) => id && setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]))
  const name = (id: string) => v?.entrants.find((e) => e.id === id)?.name ?? "?"
  const text = scheduleText(t, v, storeUrl)
  const Player = ({ s }: { s: Side }) =>
    s ? (
      <button type="button" onClick={() => choose(s.id)} className={`rounded px-2 py-1 text-left ${pick.includes(s.id) ? "bg-ui-bg-interactive text-ui-fg-on-color" : "hover:bg-ui-bg-base-hover"}`}>
        {s.name} <span className="text-ui-fg-subtle">{s.rating ?? ""}</span>
      </button>
    ) : (
      <span className="px-2 text-ui-fg-subtle">bye</span>
    )

  return (
    <Container className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level="h2">Pairings & schedule</Heading>
        <div className="flex gap-2">
          <Button size="small" variant="secondary" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener")}>
            Share on WhatsApp
          </Button>
          <Button
            size="small"
            variant="transparent"
            onClick={async () => {
              await navigator.clipboard?.writeText(text)
              toast.success("Copied. Paste it into WhatsApp.")
            }}
          >
            Copy text
          </Button>
        </div>
      </div>

      {q.isError && <Text size="small">{(q.error as Error).message}</Text>}

      <Text size="small" className="text-ui-fg-subtle">
        {scheduled
          ? locked
            ? `Registration is closed: ${v?.entrants.length ?? 0} players. ${v?.state?.phase === "locked" ? `Round 1 starts ${when(new Date(t.starts_at).getTime())}.` : ""} Players have ${v?.join_minutes ?? t.join_minutes} minutes at each match time to press Ready.`
            : `Scheduled: the pairings are made when registration closes (${when(v?.locks_at ?? null)}). Until then, share the registration link.`
          : "Check-in tournament: pairings are made at the start from the players who checked in. You can still swap players in a round before it starts."}
      </Text>
      {scheduled && !locked && t.status === "published" && (
        <div>
          <Button
            size="small"
            isLoading={act.isPending}
            onClick={async () => {
              const ok = await prompt({
                title: "Close registration now?",
                description: "Nobody else can register after this, and the pairings are made from the players registered now. This can't be undone.",
                confirmText: "Close registration",
                cancelText: "Cancel",
              })
              if (ok) act.mutate({ action: "lock" })
            }}
          >
            Close registration and make the pairings now
          </Button>
        </div>
      )}

      {v && v.round_times.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {v.round_times.map((at, i) => (
            <Badge key={i} size="small" color={v.state && v.state.round > i ? "grey" : "blue"}>
              Round {i + 1}: {when(at)}
            </Badge>
          ))}
        </div>
      )}

      {v?.upcoming && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Text weight="plus">
              Round {v.upcoming.round} pairings · {when(v.upcoming.at)}
            </Text>
            {v.upcoming.fixed && <Badge size="2xsmall">Changed by staff</Badge>}
            {v.upcoming.fixed && (
              <Button size="small" variant="transparent" onClick={() => act.mutate({ action: "reset" })}>
                Back to the system&apos;s pairings
              </Button>
            )}
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            Tap two players to swap them.
          </Text>
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {v.upcoming.games.map((g) => (
              <div key={g.board} className="flex items-center gap-2 rounded-md border border-ui-border-base px-2 py-1 text-[13px]">
                <span className="w-6 text-ui-fg-subtle">{g.board}</span>
                <Player s={g.white} />
                <span className="text-ui-fg-subtle">vs</span>
                <Player s={g.black} />
              </div>
            ))}
          </div>
          {pick.length === 2 && (
            <div>
              <Button size="small" isLoading={act.isPending} onClick={() => act.mutate({ action: "swap", a: pick[0], b: pick[1] })}>
                Swap {name(pick[0])} and {name(pick[1])}
              </Button>
            </div>
          )}
        </div>
      )}

      {ko && locked && v?.state?.round === 0 && v.entrants.length > 0 && (
        <div className="flex flex-col gap-2">
          <Text weight="plus">Seeds (they decide the bracket)</Text>
          <Text size="small" className="text-ui-fg-subtle">
            Tap two players to swap their places. Seed 1 meets the lowest seed in round 1.
          </Text>
          <div className="grid grid-cols-1 gap-1 md:grid-cols-3">
            {[...v.entrants]
              .sort((a, b) => a.seed - b.seed)
              .map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-[13px]">
                  <span className="w-6 text-ui-fg-subtle">{e.seed}</span>
                  <Player s={{ id: e.id, name: e.name, rating: e.rating, seed: e.seed }} />
                </div>
              ))}
          </div>
          {v.bracket?.rounds[0] && (
            <>
              <Text weight="plus">{v.bracket.rounds[0].name} · {when(v.round_times[0])}</Text>
              <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                {v.bracket.rounds[0].matches.map((m) => (
                  <div key={m.board} className="flex items-center gap-2 rounded-md border border-ui-border-base px-2 py-1 text-[13px]">
                    <span className="w-6 text-ui-fg-subtle">{m.board}</span>
                    <span>{m.a?.name ?? "bye"}</span>
                    <span className="text-ui-fg-subtle">vs</span>
                    <span>{m.b?.name ?? "bye"}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {pick.length === 2 && (
            <div>
              <Button size="small" isLoading={act.isPending} onClick={() => act.mutate({ action: "seeds", a: pick[0], b: pick[1] })}>
                Swap the seeds of {name(pick[0])} and {name(pick[1])}
              </Button>
            </div>
          )}
        </div>
      )}
    </Container>
  )
}
