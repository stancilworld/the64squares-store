import { Badge, Button, Checkbox, Container, Heading, Input, Label, Select, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "./sdk"
import type { Tournament } from "./tournaments"

// The tournament's lobby: who moderates it (website accounts, for this tournament or every
// tournament), the chat settings, and the full chat log with questions to the arbiter.
// Moderators do the live work from the lobby on the website; this is the staff view.

type Msg = { id: string; channel: string; thread: string | null; author_id: string; author_name: string; role: string; kind: string; text: string; created_at: string; deleted_at: string | null }
type Lobby = {
  ready: boolean
  settings: { players_chat: string; spectator_chat: string; pinned: string | null } | null
  moderators: { scope: string; player_id: string; name: string | null; email: string | null; all: boolean }[]
  messages: Msg[]
  mutes: { player_id: string; until: string | null; removed: boolean }[]
}

const CHANNEL: Record<string, string> = { players: "Players", spectators: "Spectators", arbiter: "Arbiter", all: "Everyone" }

export function LobbyPanel({ t, storeUrl }: { t: Tournament; storeUrl: string | null }) {
  const qc = useQueryClient()
  const key = ["tournament", t.id, "lobby"]
  const q = useQuery({ queryKey: key, queryFn: () => sdk.client.fetch<Lobby>(`/admin/tournaments/${t.id}/lobby`), refetchInterval: 10_000 })
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => sdk.client.fetch<{ message: string }>(`/admin/tournaments/${t.id}/lobby`, { method: "POST", body }),
    onSuccess: (r) => {
      toast.success(r.message)
      qc.invalidateQueries({ queryKey: key })
    },
    onError: (e: Error) => toast.error("Could not do that", { description: e.message }),
  })
  const [email, setEmail] = useState("")
  const [all, setAll] = useState(false)
  const [filter, setFilter] = useState("every")
  const d = q.data
  const muted = new Map((d?.mutes ?? []).map((m) => [m.player_id, m]))
  const msgs = (d?.messages ?? []).filter((m) => filter === "every" || m.channel === filter)

  return (
    <Container className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level="h2">Lobby</Heading>
        {storeUrl && (
          <a className="txt-compact-small text-ui-fg-interactive underline" href={`${storeUrl}/play/tournaments/${t.handle}/lobby`} target="_blank" rel="noreferrer">
            Open the lobby
          </a>
        )}
      </div>
      <Text size="small" className="text-ui-fg-subtle">
        The lobby opens with check-in (at least 30 minutes before the start) and closes an hour after the end. Moderators are website accounts: they get moderator tools in the lobby and see players&apos; questions to the arbiter.
      </Text>
      {d && !d.ready && <Text size="small">The game server sets lobbies up the first time it starts after this update.</Text>}

      <div className="flex flex-col gap-2">
        <Text weight="plus">Moderators</Text>
        {d?.moderators.length ? (
          <div className="flex flex-wrap gap-2">
            {d.moderators.map((m) => (
              <span key={`${m.scope}-${m.player_id}`} className="flex items-center gap-2 rounded-md border border-ui-border-base px-2 py-1">
                <Text size="small">
                  {m.name ?? m.player_id}
                  {m.email ? ` · ${m.email}` : ""}
                </Text>
                {m.all && <Badge size="2xsmall">All tournaments</Badge>}
                <button type="button" className="txt-compact-small text-ui-fg-error" onClick={() => act.mutate({ action: "remove_moderator", player_id: m.player_id, all: m.all })}>
                  Remove
                </button>
              </span>
            ))}
          </div>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">
            No moderators yet.
          </Text>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-[300px]" placeholder="Their website account email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex items-center gap-2">
            <Checkbox id="mod-all" checked={all} onCheckedChange={(v) => setAll(v === true)} />
            <Label htmlFor="mod-all" className="txt-compact-small">
              For every tournament
            </Label>
          </div>
          <Button size="small" disabled={!email.includes("@")} isLoading={act.isPending} onClick={() => act.mutate({ action: "add_moderator", email, all }, { onSuccess: () => setEmail("") })}>
            Add moderator
          </Button>
        </div>
      </div>

      {d?.settings && (
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <Label className="txt-compact-small">Players&apos; chat</Label>
            <Select value={d.settings.players_chat} onValueChange={(v) => act.mutate({ action: "settings", players_chat: v })}>
              <Select.Trigger className="w-[220px]">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="open">Open</Select.Item>
                <Select.Item value="quick">Quick messages only</Select.Item>
                <Select.Item value="off">Moderators only</Select.Item>
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="txt-compact-small">Spectators&apos; chat</Label>
            <Select value={d.settings.spectator_chat} onValueChange={(v) => act.mutate({ action: "settings", spectator_chat: v })}>
              <Select.Trigger className="w-[220px]">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="open">Open</Select.Item>
                <Select.Item value="slow">Slow (one message per 15 s)</Select.Item>
                <Select.Item value="off">Off</Select.Item>
              </Select.Content>
            </Select>
          </div>
          {d.settings.pinned && (
            <div className="flex flex-col gap-1">
              <Label className="txt-compact-small">Pinned</Label>
              <div className="flex items-center gap-2">
                <Text size="small">{d.settings.pinned}</Text>
                <Button size="small" variant="secondary" onClick={() => act.mutate({ action: "settings", pinned: null })}>
                  Unpin
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text weight="plus">Chat log ({d?.messages.length ?? 0})</Text>
          <Select value={filter} onValueChange={setFilter}>
            <Select.Trigger className="w-[180px]">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="every">Every chat</Select.Item>
              <Select.Item value="players">Players</Select.Item>
              <Select.Item value="spectators">Spectators</Select.Item>
              <Select.Item value="arbiter">Questions to the arbiter</Select.Item>
              <Select.Item value="all">Announcements</Select.Item>
            </Select.Content>
          </Select>
        </div>
        {msgs.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            No messages.
          </Text>
        ) : (
          <div className="max-h-[480px] overflow-y-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Time</Table.HeaderCell>
                  <Table.HeaderCell>Chat</Table.HeaderCell>
                  <Table.HeaderCell>From</Table.HeaderCell>
                  <Table.HeaderCell>Message</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {msgs.map((m) => {
                  const mute = muted.get(m.author_id)
                  return (
                    <Table.Row key={m.id} className={m.deleted_at ? "opacity-50" : ""}>
                      <Table.Cell className="whitespace-nowrap">{new Date(m.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</Table.Cell>
                      <Table.Cell>{CHANNEL[m.channel] ?? m.channel}</Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        {m.author_name} <Badge size="2xsmall">{m.role}</Badge>
                      </Table.Cell>
                      <Table.Cell className="max-w-[420px] whitespace-normal break-words">
                        {m.text}
                        {m.deleted_at && " (deleted)"}
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        {!m.deleted_at && m.kind !== "system" && (
                          <button type="button" className="txt-compact-small text-ui-fg-error" onClick={() => act.mutate({ action: "delete_message", id: m.id })}>
                            Delete
                          </button>
                        )}
                        {mute && (
                          <button type="button" className="txt-compact-small ml-3 text-ui-fg-interactive" onClick={() => act.mutate({ action: "lift_mute", player_id: m.author_id })}>
                            {mute.removed ? "Let back in" : "Unmute"}
                          </button>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  )
                })}
              </Table.Body>
            </Table>
          </div>
        )}
      </div>
    </Container>
  )
}
