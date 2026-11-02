import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ShieldCheck } from "@medusajs/icons"
import { Badge, Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { sdk } from "../../lib/sdk"

type Flag = {
  id: number
  player_id: string
  name: string
  username: string | null
  email: string | null
  score: number
  reasons: string[]
  status: "open" | "warned" | "banned" | "cleared"
  checked_games: number
  ban_scope: string | null
  updated_at: string
}

const TABS = [
  ["open", "To review"],
  ["warned", "Warned"],
  ["banned", "Banned"],
  ["cleared", "Cleared"],
] as const

export const STATUS_BADGE: Record<string, { label: string; color: "orange" | "red" | "green" | "grey" }> = {
  open: { label: "To review", color: "orange" },
  warned: { label: "Warned", color: "orange" },
  banned: { label: "Banned", color: "red" },
  cleared: { label: "Cleared", color: "green" },
}

export const scoreColour = (s: number) => (s >= 75 ? "red" : s >= 50 ? "orange" : "grey")

const FairPlayPage = () => {
  const navigate = useNavigate()
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("open")
  const { data, isLoading } = useQuery({
    queryKey: ["fair-play", tab],
    queryFn: () => sdk.client.fetch<{ flags: Flag[] }>(`/admin/fair-play?status=${tab}`),
  })

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Fair play</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          After every rated game the moves are checked with a chess engine. Players whose games look like computer help are listed here
          with the evidence. Nobody is banned automatically: you decide.
        </Text>
        <div className="mt-3 flex flex-wrap gap-2">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${tab === key ? "bg-ui-bg-base-pressed text-ui-fg-base" : "text-ui-fg-subtle hover:bg-ui-bg-base-hover"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <Text className="px-6 py-4">Loading...</Text>
      ) : !data?.flags.length ? (
        <Text className="px-6 py-10 text-center text-ui-fg-subtle">{tab === "open" ? "Nothing to review. All recent games look fair." : "No players here."}</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Player</Table.HeaderCell>
              <Table.HeaderCell>Suspicion</Table.HeaderCell>
              <Table.HeaderCell>Why</Table.HeaderCell>
              <Table.HeaderCell>Checked games</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.flags.map((f) => (
              <Table.Row key={f.id} className="cursor-pointer" onClick={() => navigate(`/fair-play/${f.id}`)}>
                <Table.Cell>
                  <Text size="small" weight="plus">
                    {f.name}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {f.username ? `@${f.username} · ` : ""}
                    {f.email ?? f.player_id}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={scoreColour(f.score)}>
                    {f.score} / 100
                  </Badge>
                </Table.Cell>
                <Table.Cell className="max-w-[360px]">
                  <Text size="xsmall" className="line-clamp-2 text-ui-fg-subtle">
                    {f.reasons[0] ?? "—"}
                  </Text>
                </Table.Cell>
                <Table.Cell>{f.checked_games}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={STATUS_BADGE[f.status].color}>
                    {STATUS_BADGE[f.status].label}
                    {f.ban_scope ? ` (${f.ban_scope === "all" ? "all play" : "rated"})` : ""}
                  </Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Fair play", icon: ShieldCheck, rank: 3 })

export default FairPlayPage
