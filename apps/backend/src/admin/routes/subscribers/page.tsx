import { defineRouteConfig } from "@medusajs/admin-sdk"
import { EnvelopeSolid } from "@medusajs/icons"
import { Button, Container, Heading, Input, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"

type Subscriber = { id: string; email: string; source: string; created_at: string }

const SubscribersPage = () => {
  const [search, setSearch] = useState("")
  const { data, isLoading } = useQuery({
    queryKey: ["subscribers"],
    queryFn: () => sdk.client.fetch<{ subscribers: Subscriber[] }>("/admin/subscribers"),
  })
  const all = data?.subscribers ?? []
  const list = all.filter((s) => s.email.includes(search.trim().toLowerCase()))

  const download = async () => {
    const res = await fetch("/admin/subscribers?format=csv", { credentials: "include" })
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement("a")
    a.href = url
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h1">Newsletter subscribers</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {all.length} people signed up on the website.
          </Text>
        </div>
        <div className="flex gap-x-2">
          <Input
            size="small"
            type="search"
            placeholder="Search emails"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button size="small" variant="secondary" onClick={download}>
            Download CSV
          </Button>
        </div>
      </div>
      {isLoading ? (
        <Text className="px-6 py-4">Loading...</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Email</Table.HeaderCell>
              <Table.HeaderCell>Source</Table.HeaderCell>
              <Table.HeaderCell>Signed up</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {list.map((s) => (
              <Table.Row key={s.id}>
                <Table.Cell>{s.email}</Table.Cell>
                <Table.Cell>{s.source}</Table.Cell>
                <Table.Cell>{new Date(s.created_at).toLocaleString("en-IN")}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Newsletter subscribers",
  icon: EnvelopeSolid,
  nested: "/customers",
})

export default SubscribersPage
