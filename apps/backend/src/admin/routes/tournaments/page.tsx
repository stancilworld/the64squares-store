import { defineRouteConfig } from "@medusajs/admin-sdk"
import { GridLayout } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { sdk } from "../../lib/sdk"
import { useMe } from "../../lib/staff"
import { formatEventDate, STATUS_LABELS, type Tournament, TournamentDrawer } from "../../lib/tournaments"

const TournamentsPage = () => {
  const navigate = useNavigate()
  const { can } = useMe()
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ["tournaments"],
    queryFn: () => sdk.client.fetch<{ tournaments: Tournament[] }>("/admin/tournaments"),
  })

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h1">Tournaments</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Online and over-the-board events. Players register on the website and get a ticket with a QR code.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("tournaments.manage") && (
            <Button size="small" variant="secondary" onClick={() => navigate("/tournaments/passes")}>
              Tournament Passes
            </Button>
          )}
          {can("tournaments.checkin") && (
            <Button size="small" variant="secondary" onClick={() => navigate("/tournaments/check-in")}>
              Check in players
            </Button>
          )}
          {can("tournaments.manage") && (
            <Button size="small" onClick={() => setCreating(true)}>
              New tournament
            </Button>
          )}
        </div>
      </div>
      {isLoading ? (
        <Text className="px-6 py-4">Loading...</Text>
      ) : !data?.tournaments.length ? (
        <div className="px-6 py-10 text-center">
          <Text className="text-ui-fg-subtle">No tournaments yet.</Text>
          {can("tournaments.manage") && (
            <Button size="small" className="mt-3" onClick={() => setCreating(true)}>
              Create the first one
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Tournament</Table.HeaderCell>
              <Table.HeaderCell>Starts</Table.HeaderCell>
              <Table.HeaderCell>Where</Table.HeaderCell>
              <Table.HeaderCell>Players</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.tournaments.map((t) => (
              <Table.Row key={t.id} className="cursor-pointer" onClick={() => navigate(`/tournaments/${t.id}`)}>
                <Table.Cell>
                  <div className="flex flex-col py-1">
                    <span className="font-medium">{t.title}</span>
                    <span className="text-ui-fg-subtle txt-compact-xsmall">
                      {t.format_label}, {t.time_control}
                    </span>
                  </div>
                </Table.Cell>
                <Table.Cell>{formatEventDate(t.starts_at)}</Table.Cell>
                <Table.Cell>{t.mode === "online" ? "Online" : t.venue?.split("\n")[0] || "Venue"}</Table.Cell>
                <Table.Cell>
                  {t.registered ?? 0}
                  {t.capacity != null ? ` / ${t.capacity}` : ""}
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={STATUS_LABELS[t.status].color}>
                    {STATUS_LABELS[t.status].label}
                  </Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <TournamentDrawer tournament={null} open={creating} onClose={() => setCreating(false)} />
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Tournaments",
  icon: GridLayout,
  rank: 2,
})

export default TournamentsPage
