import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Users } from "@medusajs/icons"
import { Badge, Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { useStoreUrl } from "../../lib/site"

// Online now: who is connected to Play this minute and what they're doing. Refreshes every
// few seconds. (Visitors who only browse the shop aren't connected to Play.)

type Tourney = { id: string; title: string; handle: string | null }
type Player = {
  id: string
  name: string
  since: number
  playing: { game_id: string; opponent: string | null; mode: string; time_control: string; tournament: Tourney | null }[]
  lobbies: Tourney[]
  watching: string[]
}
type Online = { now: number; live_games: number; guests: number; players: Player[] }

const MODE: Record<string, string> = { online: "Rated game", friend: "With a friend", arena: "Arena", tournament: "Tournament", house: "Against a House Player" }

const duration = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000))
  if (m < 1) return "just now"
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

const OnlinePage = () => {
  const storeUrl = useStoreUrl()
  const q = useQuery({ queryKey: ["online-now"], queryFn: () => sdk.client.fetch<Online>("/admin/online"), refetchInterval: 5000, retry: false })
  const d = q.data
  const playing = d?.players.filter((p) => p.playing.length).length ?? 0
  const link = (path: string, label: string) =>
    storeUrl ? (
      <a href={`${storeUrl}${path}`} target="_blank" rel="noopener noreferrer" className="text-ui-fg-interactive hover:underline">
        {label}
      </a>
    ) : (
      label
    )

  return (
    <div className="flex flex-col gap-4">
      <Container className="flex flex-col gap-3">
        <div>
          <Heading level="h1">Online now</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Players connected to Play right now (games, tournament lobbies, watching). Updates every 5 seconds. Shop-only visitors aren&apos;t counted here; see Analytics for visits.
          </Text>
        </div>
        {q.isError && <Text size="small">{(q.error as Error).message}</Text>}
        {d && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Signed-in players", d.players.length],
              ["Playing now", playing],
              ["Live games", d.live_games],
              ["Guests (not signed in)", d.guests],
            ].map(([label, n]) => (
              <div key={label} className="rounded-lg border border-ui-border-base px-4 py-3">
                <Text size="small" className="text-ui-fg-subtle">
                  {label}
                </Text>
                <Text size="xlarge" weight="plus">
                  {n}
                </Text>
              </div>
            ))}
          </div>
        )}
      </Container>

      <Container className="p-0">
        {!d ? (
          <Text className="p-6">{q.isLoading ? "Loading…" : ""}</Text>
        ) : !d.players.length ? (
          <Text className="p-6 text-ui-fg-subtle">Nobody signed in is on Play right now.</Text>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Player</Table.HeaderCell>
                <Table.HeaderCell>Doing</Table.HeaderCell>
                <Table.HeaderCell>Online for</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {d.players.map((p) => (
                <Table.Row key={p.id}>
                  <Table.Cell>
                    <a href={`/app/customers/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </a>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-col gap-1 py-2">
                      {p.playing.map((g) => (
                        <span key={g.game_id} className="flex flex-wrap items-center gap-2">
                          <Badge size="2xsmall" color="green">
                            Playing
                          </Badge>
                          {g.opponent ? `vs ${g.opponent}` : "a game"} · {g.time_control} · {g.tournament ? g.tournament.title : (MODE[g.mode] ?? g.mode)} · {link(`/play/${g.game_id}`, "Watch")}
                        </span>
                      ))}
                      {p.lobbies.map((t) => (
                        <span key={t.id} className="flex flex-wrap items-center gap-2">
                          <Badge size="2xsmall" color="blue">
                            Lobby
                          </Badge>
                          {t.handle ? link(`/play/tournaments/${t.handle}/lobby`, t.title) : t.title}
                        </span>
                      ))}
                      {p.watching.map((id) => (
                        <span key={id} className="flex flex-wrap items-center gap-2">
                          <Badge size="2xsmall" color="grey">
                            Watching
                          </Badge>
                          {link(`/play/${id}`, "a live game")}
                        </span>
                      ))}
                      {!p.playing.length && !p.lobbies.length && !p.watching.length && <span className="text-ui-fg-subtle">On the Play pages</span>}
                    </div>
                  </Table.Cell>
                  <Table.Cell>{duration(d.now - p.since)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({ label: "Online now", icon: Users })

export default OnlinePage
