import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Select, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router-dom"
import { sdk } from "../../../lib/sdk"

type Entry = {
  id: string
  at: string
  who: string | null
  action: string
  area: string
  target: string | null
  link: string | null
  ip: string | null
  failed: boolean
}
type Response = { entries: Entry[]; count: number; offset: number; limit: number; people: string[]; areas: string[] }

const ALL = "__all"
const PAGE = 50
const colour: Record<string, "blue" | "green" | "orange" | "purple" | "grey" | "red"> = {
  Orders: "blue",
  Products: "green",
  Customers: "purple",
  Discounts: "orange",
  Website: "grey",
  Staff: "red",
  Settings: "grey",
  "Sign-in": "grey",
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

// Settings → Activity log (admin only): who changed what, and every admin sign-in attempt.
const ActivityPage = () => {
  const [area, setArea] = useState(ALL)
  const [person, setPerson] = useState(ALL)
  const [offset, setOffset] = useState(0)
  const { data, isLoading, error } = useQuery({
    queryKey: ["activity", area, person, offset],
    queryFn: () =>
      sdk.client.fetch<Response>("/admin/activity", {
        query: {
          limit: PAGE,
          offset,
          ...(area !== ALL ? { area } : {}),
          ...(person !== ALL ? { person } : {}),
        },
      }),
    refetchInterval: 30_000,
  })

  if (error) {
    return (
      <Container className="px-6 py-4">
        <Heading level="h1">Activity log</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Only the admin can see the activity log.
        </Text>
      </Container>
    )
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h1">Activity log</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Every change made in the admin and every admin sign-in, newest first. Kept for 12 months.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            size="small"
            value={area}
            onValueChange={(v) => {
              setArea(v)
              setOffset(0)
            }}
          >
            <Select.Trigger aria-label="Area" className="w-40">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={ALL}>All areas</Select.Item>
              {(data?.areas ?? []).map((a) => (
                <Select.Item key={a} value={a}>
                  {a}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Select
            size="small"
            value={person}
            onValueChange={(v) => {
              setPerson(v)
              setOffset(0)
            }}
          >
            <Select.Trigger aria-label="Person" className="w-56">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={ALL}>Everyone</Select.Item>
              {(data?.people ?? []).map((p) => (
                <Select.Item key={p} value={p}>
                  {p}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      </div>
      {isLoading || !data ? (
        <Text size="small" className="px-6 py-4">
          Loading…
        </Text>
      ) : !data.entries.length ? (
        <Text size="small" className="px-6 py-4 text-ui-fg-subtle">
          Nothing here yet.
        </Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>When</Table.HeaderCell>
              <Table.HeaderCell>Who</Table.HeaderCell>
              <Table.HeaderCell>What</Table.HeaderCell>
              <Table.HeaderCell>Area</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.entries.map((e) => (
              <Table.Row key={e.id}>
                <Table.Cell className="whitespace-nowrap text-ui-fg-subtle">{when(e.at)}</Table.Cell>
                <Table.Cell>
                  <span className="flex flex-col py-1">
                    <span>{e.who ?? "Someone"}</span>
                    {e.ip && <span className="text-ui-fg-muted txt-compact-xsmall">{e.ip}</span>}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span className={e.failed ? "text-ui-tag-red-text" : ""}>{e.action}</span>
                  {e.target && (
                    <>
                      {" · "}
                      {e.link ? (
                        <Link to={e.link} className="text-ui-fg-interactive hover:underline">
                          {e.target}
                        </Link>
                      ) : (
                        e.target
                      )}
                    </>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={e.failed ? "red" : colour[e.area] ?? "grey"}>
                    {e.area}
                  </Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      {data && data.count > PAGE && (
        <div className="flex items-center justify-between px-6 py-3">
          <Text size="small" className="text-ui-fg-subtle">
            {offset + 1}–{Math.min(offset + PAGE, data.count)} of {data.count}
          </Text>
          <div className="flex gap-2">
            <Button size="small" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              Newer
            </Button>
            <Button size="small" variant="secondary" disabled={offset + PAGE >= data.count} onClick={() => setOffset(offset + PAGE)}>
              Older
            </Button>
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Activity log",
  rank: 2,
})

export default ActivityPage
