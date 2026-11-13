import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { Badge, Container, Heading, Switch, Table, Tabs, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"

// Live commentary: an AI commentator (no person) for spectators, 25 seconds behind the game,
// never heard by the two players. Switch it on for one live game or a whole tournament;
// "Featured" adds the ElevenLabs voice, within the daily allowance.

type Setting = { enabled: boolean; voice: boolean }
type Game = {
  id: string
  mode: string
  white_name: string
  black_name: string
  white_rating: number | null
  black_rating: number | null
  initial_ms: number
  increment_ms: number
  started_at: string
  tournament_id: string | null
  tournament: string | null
  own: Setting | null
  from_tournament: boolean
  enabled: boolean
  voice: boolean
}
type Tourney = { id: string; title: string; handle: string; format: string; time_control: string; starts_at: string; ends_at: string | null; phase: string | null; players: number; enabled: boolean; voice: boolean }
type Overview = { ready: boolean; site: Setting; games: Game[]; tournaments: Tourney[]; voice: { connected: boolean; used: number; limit: number } }

const FORMAT: Record<string, string> = { arena: "Arena", swiss: "Swiss", round_robin: "Round robin", knockout: "Knockout" }
const MODE: Record<string, string> = { online: "Online", friend: "With a friend", arena: "Tournament" }
const tc = (g: Game) => (g.initial_ms ? `${g.initial_ms / 60000}+${g.increment_ms / 1000}` : "")
const when = (d: string) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

function Toggles({ s, onChange, disabled }: { s: Setting; onChange: (s: Setting) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-5">
      <label className="flex items-center gap-2">
        <Switch checked={s.enabled} disabled={disabled} onCheckedChange={(v) => onChange({ enabled: v, voice: v && s.voice })} />
        <Text size="small">Commentary</Text>
      </label>
      <label className="flex items-center gap-2">
        <Switch checked={s.voice} disabled={disabled || !s.enabled} onCheckedChange={(v) => onChange({ enabled: s.enabled, voice: v })} />
        <Text size="small">Featured (voice)</Text>
      </label>
    </div>
  )
}

const CommentaryPage = () => {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ["commentary"], queryFn: () => sdk.client.fetch<Overview>("/admin/commentary"), refetchInterval: 8000 })
  const set = useMutation({
    mutationFn: (body: { scope: string } & Setting) => sdk.client.fetch<{ message: string }>("/admin/commentary", { method: "POST", body }),
    onSuccess: (r) => {
      toast.success(r.message)
      qc.invalidateQueries({ queryKey: ["commentary"] })
    },
    onError: (e: Error) => toast.error("Could not change it", { description: e.message }),
  })
  const d = q.data
  const off = !!d && !d.site.enabled

  return (
    <Container className="flex flex-col gap-5">
      <div>
        <Heading level="h1">Live commentary</Heading>
        <Text size="small" className="mt-1 max-w-[760px] text-ui-fg-subtle">
          An AI commentator for spectators: it follows the game with the chess engine and describes the moments that matter. Spectators get it 25 seconds behind the game, and the two players never see or hear it. It never says what a player should play. Featured games are voiced by ElevenLabs; the rest are text.
        </Text>
      </div>

      {d && !d.ready && <Text size="small">The game server sets commentary up the first time it starts after this update.</Text>}

      {d?.ready && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-ui-border-base p-4">
          <div>
            <Text weight="plus">Whole website</Text>
            <Text size="small" className="text-ui-fg-subtle">
              Off stops all commentary at once. Voice off keeps commentary as text everywhere.
            </Text>
          </div>
          <Toggles s={d.site} onChange={(s) => set.mutate({ scope: "site", ...s })} />
          <div>
            <Text size="small">
              Voice today: {d.voice.used.toLocaleString("en-IN")} of {d.voice.limit.toLocaleString("en-IN")} characters
            </Text>
            {!d.voice.connected && (
              <Text size="small" className="text-ui-fg-subtle">
                No ElevenLabs key: commentary is text only (Settings → Payments & delivery → Keys).
              </Text>
            )}
          </div>
        </div>
      )}

      <Tabs defaultValue="games">
        <Tabs.List>
          <Tabs.Trigger value="games">Live games ({d?.games.length ?? 0})</Tabs.Trigger>
          <Tabs.Trigger value="tournaments">Tournaments ({d?.tournaments.length ?? 0})</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="games" className="mt-4">
          {!d?.games.length ? (
            <Text size="small" className="text-ui-fg-subtle">
              No games are being played right now.
            </Text>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Game</Table.HeaderCell>
                  <Table.HeaderCell>Where</Table.HeaderCell>
                  <Table.HeaderCell>Started</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {d.games.map((g) => (
                  <Table.Row key={g.id}>
                    <Table.Cell>
                      <Text size="small" weight="plus">
                        {g.white_name} {g.white_rating ? `(${g.white_rating})` : ""} – {g.black_name} {g.black_rating ? `(${g.black_rating})` : ""}
                      </Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {tc(g)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      {g.tournament ?? MODE[g.mode] ?? g.mode}
                      {g.from_tournament && (
                        <Badge size="2xsmall" className="ml-2">
                          From tournament
                        </Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">{when(g.started_at)}</Table.Cell>
                    <Table.Cell>
                      <Toggles s={{ enabled: g.enabled, voice: g.voice }} disabled={off} onChange={(s) => set.mutate({ scope: `game:${g.id}`, ...s })} />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Tabs.Content>
        <Tabs.Content value="tournaments" className="mt-4">
          <Text size="small" className="mb-3 text-ui-fg-subtle">
            Switched on for a tournament, every game in it gets commentary (you can still switch single games off in Live games). Featured voices all of them, so keep it for the big events.
          </Text>
          {!d?.tournaments.length ? (
            <Text size="small" className="text-ui-fg-subtle">
              No online tournaments on now or coming up.
            </Text>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Tournament</Table.HeaderCell>
                  <Table.HeaderCell>Starts</Table.HeaderCell>
                  <Table.HeaderCell>Players</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {d.tournaments.map((t) => (
                  <Table.Row key={t.id}>
                    <Table.Cell>
                      <Text size="small" weight="plus">
                        {t.title}
                      </Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {FORMAT[t.format] ?? t.format} · {t.time_control}
                        {t.phase === "running" || new Date(t.starts_at).getTime() < Date.now() ? " · on now" : ""}
                      </Text>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">{when(t.starts_at)}</Table.Cell>
                    <Table.Cell>{t.players}</Table.Cell>
                    <Table.Cell>
                      <Toggles s={{ enabled: t.enabled, voice: t.voice }} disabled={off} onChange={(s) => set.mutate({ scope: `tourney:${t.id}`, ...s })} />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Tabs.Content>
      </Tabs>
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Live commentary", icon: ChatBubbleLeftRight, rank: 3 })

export default CommentaryPage
