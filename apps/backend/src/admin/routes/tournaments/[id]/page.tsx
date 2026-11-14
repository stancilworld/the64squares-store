import { ArrowDownTray } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { BACKEND_URL, sdk } from "../../../lib/sdk"
import { useStoreUrl } from "../../../lib/site"
import { useMe } from "../../../lib/staff"
import { LobbyPanel } from "../../../lib/tournament-lobby"
import { PairingsPanel } from "../../../lib/tournament-pairings"
import { ControlRoom, FunnelPanel, GamesPanel, MessagePanel, ResultsPanel, useEngine } from "../../../lib/tournament-live"
import { formatEventDate, type Registration, STATUS_LABELS, type Tournament, TournamentDrawer } from "../../../lib/tournaments"

const TournamentPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const prompt = usePrompt()
  const { can } = useMe()
  const storeUrl = useStoreUrl()
  const [editing, setEditing] = useState(false)
  const [search, setSearch] = useState("")

  const { data: t } = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => sdk.client.fetch<{ tournament: Tournament }>(`/admin/tournaments/${id}`),
  })
  const engine = useEngine(t?.tournament ?? ({ id: id!, mode: "offline", status: "draft", starts_at: "" } as Tournament))
  const { data: regs, isLoading } = useQuery({
    queryKey: ["tournament", id, "registrations"],
    queryFn: () => sdk.client.fetch<{ registrations: Registration[] }>(`/admin/tournaments/${id}/registrations`),
    enabled: can("tournaments.checkin"),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tournament", id] })
    qc.invalidateQueries({ queryKey: ["tournaments"] })
  }

  const checkIn = useMutation({
    mutationFn: (r: Registration) =>
      sdk.client.fetch("/admin/tournament-checkin", { method: "POST", body: { code: r.ticket_code, undo: !!r.checked_in_at } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error("Could not update", { description: e.message }),
  })
  const setStatus = useMutation({
    mutationFn: ({ r, status }: { r: Registration; status: "confirmed" | "cancelled" | "withdrawn" }) =>
      sdk.client.fetch(`/admin/tournaments/${id}/registrations/${r.id}`, { method: "POST", body: { status } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error("Could not update", { description: e.message }),
  })
  const remove = useMutation({
    mutationFn: () => sdk.client.fetch(`/admin/tournaments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournaments"] })
      toast.success("Tournament deleted")
      navigate("/tournaments")
    },
  })

  const download = async () => {
    const res = await fetch(`${BACKEND_URL === "/" ? "" : BACKEND_URL}/admin/tournaments/${id}/registrations?format=csv`, { credentials: "include" })
    if (!res.ok) {
      toast.error("Could not download the list")
      return
    }
    const a = document.createElement("a")
    a.href = URL.createObjectURL(await res.blob())
    a.download = `${t?.tournament.handle ?? "players"}-players.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const all = regs?.registrations ?? []
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? all.filter((r) => [r.player_name, r.email, r.ticket_code, r.phone ?? "", r.fide_id ?? ""].some((v) => v.toLowerCase().includes(q))) : all
  }, [all, search])
  const confirmed = all.filter((r) => r.status === "confirmed")
  const arrived = confirmed.filter((r) => r.checked_in_at)

  if (!t) {
    return (
      <Container>
        <Text>Loading...</Text>
      </Container>
    )
  }
  const ev = t.tournament
  const started = new Date(ev.starts_at).getTime() <= Date.now() && ev.status === "published"

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
          <div>
            <Link to="/tournaments" className="text-ui-fg-subtle txt-compact-small hover:text-ui-fg-base">
              Tournaments
            </Link>
            <div className="mt-1 flex items-center gap-x-2">
              <Heading level="h1">{ev.title}</Heading>
              <Badge size="2xsmall" color={STATUS_LABELS[ev.status].color}>
                {STATUS_LABELS[ev.status].label}
              </Badge>
            </div>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              {formatEventDate(ev.starts_at)} · {ev.mode === "online" ? "Online" : ev.venue} · {ev.time_control}
            </Text>
          </div>
          <div className="flex flex-wrap gap-2">
            {storeUrl && ev.status !== "draft" && (
              <Button size="small" variant="secondary" onClick={() => window.open(`${storeUrl}/${ev.mode === "online" ? "play/" : ""}tournaments/${ev.handle}`, "_blank", "noopener")}>
                View on website
              </Button>
            )}
            {can("tournaments.manage") && (
              <Button size="small" onClick={() => setEditing(true)}>
                Edit details
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x">
          {[
            ["Registered", `${confirmed.length}${ev.capacity != null ? ` of ${ev.capacity}` : ""}`],
            ["Checked in", String(arrived.length)],
            ["Cancelled", String(all.length - confirmed.length)],
          ].map(([k, v]) => (
            <div key={k} className="px-6 py-4">
              <Text size="small" className="text-ui-fg-subtle">
                {k}
              </Text>
              <Text size="xlarge" weight="plus">
                {v}
              </Text>
            </div>
          ))}
        </div>
      </Container>

      {ev.mode === "online" && ev.format !== "arena" && ev.status !== "draft" && can("tournaments.manage") && <PairingsPanel t={ev} storeUrl={storeUrl} />}
      {ev.mode === "online" && can("tournaments.manage") && <ControlRoom t={ev} engine={engine.data} />}
      {ev.mode === "online" && can("tournaments.checkin") && <ResultsPanel t={ev} regs={all} storeUrl={storeUrl} />}
      {ev.mode === "online" && can("tournaments.manage") && <GamesPanel t={ev} engine={engine.data} storeUrl={storeUrl} />}

      {can("tournaments.checkin") ? (
        <Container className="divide-y p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <Heading level="h2">Players</Heading>
            <div className="flex flex-wrap gap-2">
              <Input size="small" type="search" placeholder="Search name, email, ticket" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Button size="small" variant="secondary" onClick={() => navigate(`/tournaments/check-in`)}>
                Check in by code
              </Button>
              <Button size="small" variant="secondary" onClick={download} disabled={!all.length}>
                <ArrowDownTray />
                Download list
              </Button>
            </div>
          </div>
          {isLoading ? (
            <Text className="px-6 py-4">Loading...</Text>
          ) : !shown.length ? (
            <Text className="px-6 py-6 text-ui-fg-subtle">{all.length ? "No player matches that search." : "Nobody has registered yet."}</Text>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Player</Table.HeaderCell>
                  <Table.HeaderCell>Ticket</Table.HeaderCell>
                  <Table.HeaderCell>Rating</Table.HeaderCell>
                  <Table.HeaderCell>{ev.mode === "online" ? "From" : "Phone"}</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {shown.map((r) => (
                  <Table.Row key={r.id}>
                    <Table.Cell>
                      <div className="flex flex-col py-1">
                        <span className="font-medium">{r.player_name}</span>
                        <span className="text-ui-fg-subtle txt-compact-xsmall">{r.email}</span>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="font-mono">{r.ticket_code}</Table.Cell>
                    <Table.Cell>
                      {r.rating ?? "–"}
                      {r.fide_id ? <span className="block text-ui-fg-subtle txt-compact-xsmall">FIDE {r.fide_id}</span> : null}
                    </Table.Cell>
                    <Table.Cell>{ev.mode === "online" ? (r.source ?? "direct") : (r.phone ?? "–")}</Table.Cell>
                    <Table.Cell>
                      {r.status === "cancelled" ? (
                        <Badge size="2xsmall" color="red">
                          Cancelled
                        </Badge>
                      ) : r.status === "withdrawn" ? (
                        <Badge size="2xsmall" color="orange">
                          Removed
                        </Badge>
                      ) : r.checked_in_at ? (
                        <Badge size="2xsmall" color="green">
                          Checked in
                        </Badge>
                      ) : (
                        <Badge size="2xsmall" color="grey">
                          Registered
                        </Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex justify-end gap-2">
                        {r.status === "confirmed" && (
                          <Button size="small" variant={r.checked_in_at ? "transparent" : "secondary"} onClick={() => checkIn.mutate(r)}>
                            {r.checked_in_at ? "Undo check-in" : "Check in"}
                          </Button>
                        )}
                        {started && r.status === "confirmed" && ev.mode === "online" && ev.format !== "arena" && (
                          <Button
                            size="small"
                            variant="transparent"
                            onClick={async () => {
                              if (await prompt({ title: `Remove ${r.player_name} from the event?`, description: "They aren't paired again and lose any match still to play. Their pass isn't returned." })) {
                                setStatus.mutate({ r, status: "withdrawn" })
                              }
                            }}
                          >
                            Remove from event
                          </Button>
                        )}
                        {!(started && r.status === "confirmed" && ev.mode === "online") && (
                        <Button
                          size="small"
                          variant="transparent"
                          onClick={async () => {
                            if (r.status !== "confirmed") {
                              setStatus.mutate({ r, status: "confirmed" })
                            } else if (await prompt({ title: `Cancel ${r.player_name}'s place?`, description: ev.mode === "online" ? "Their Tournament Pass goes back to them. You can restore the place later." : "Their ticket stops working. You can restore it later." })) {
                              setStatus.mutate({ r, status: "cancelled" })
                            }
                          }}
                        >
                          {r.status !== "confirmed" ? "Restore" : "Cancel place"}
                        </Button>
                        )}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>
      ) : (
        <Container>
          <Text size="small" className="text-ui-fg-subtle">
            Seeing players needs the "Players &amp; check-in" permission.
          </Text>
        </Container>
      )}

      {ev.mode === "online" && can("tournaments.moderate") && ev.status !== "draft" && <LobbyPanel t={ev} storeUrl={storeUrl} />}
      {ev.mode === "online" && can("tournaments.manage") && ev.status !== "draft" && <MessagePanel t={ev} />}
      {ev.mode === "online" && can("tournaments.manage") && <FunnelPanel t={ev} />}

      {can("tournaments.manage") && (
        <Container className="flex items-center justify-between gap-4">
          <Text size="small" className="text-ui-fg-subtle">
            Deleting removes the tournament from the website. To keep its page, set it to Cancelled instead.
          </Text>
          <Button
            size="small"
            variant="danger"
            onClick={async () => {
              if (await prompt({ title: `Delete ${ev.title}?`, description: "Its page and players' tickets stop working." })) {
                remove.mutate()
              }
            }}
          >
            Delete tournament
          </Button>
        </Container>
      )}
      <TournamentDrawer tournament={ev} open={editing} onClose={() => setEditing(false)} />
    </div>
  )
}

export default TournamentPage
