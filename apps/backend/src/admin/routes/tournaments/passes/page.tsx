import { Badge, Button, Container, Heading, Input, Label, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { sdk } from "../../../lib/sdk"

// Tournament Passes: how players earn them, giving or taking passes by hand, and every
// change. Passes are never sold, can't be transferred and have no cash value.

type Rules = {
  welcome: number
  games_per_pass: number
  games_daily_max: number
  puzzle_streak_days: number
  puzzle_pass: number
  referral: number
  referral_monthly_max: number
  completed: number
}

type Entry = { id: string; customer_id: string; delta: number; reason: string; reason_label: string; note: string | null; created_at: string; email: string | null; name: string; balance: number }

const FIELDS: [keyof Rules, string, string][] = [
  ["welcome", "Welcome passes", "Given once when someone makes an account."],
  ["games_per_pass", "Rated games for 1 pass", "Against real players (not the computer or House Players)."],
  ["games_daily_max", "Most passes from games a day", "0 turns this off."],
  ["puzzle_streak_days", "Puzzle streak (days)", "Solve the daily puzzle this many days in a row."],
  ["puzzle_pass", "Passes for a puzzle streak", "Once a week at most."],
  ["referral", "Passes for a referral", "When a friend they invited joins and plays."],
  ["referral_monthly_max", "Most referral passes a month", ""],
  ["completed", "Passes for finishing a tournament", "Players who stay to the end of a pass-entry tournament. Free-entry tournaments give none."],
]

const PassesPage = () => {
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [search, setSearch] = useState("")
  const { data } = useQuery({
    queryKey: ["tournament-passes", search],
    queryFn: () => sdk.client.fetch<{ rules: Rules; entries: Entry[]; totals: { earned: number; spent: number; players: number } }>(`/admin/tournament-passes${search ? `?q=${encodeURIComponent(search)}` : ""}`),
  })
  const [rules, setRules] = useState<Rules | null>(null)
  useEffect(() => {
    if (data?.rules && !rules) setRules(data.rules)
  }, [data, rules])

  const saveRules = useMutation({
    mutationFn: () => sdk.client.fetch("/admin/tournament-passes", { method: "POST", body: rules! }),
    onSuccess: () => {
      toast.success("Saved. New passes follow these rules.")
      qc.invalidateQueries({ queryKey: ["tournament-passes"] })
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })

  const [email, setEmail] = useState("")
  const [delta, setDelta] = useState("1")
  const [note, setNote] = useState("")
  const grant = useMutation({
    mutationFn: () => sdk.client.fetch<{ wallet: { balance: number } }>("/admin/tournament-passes/grant", { method: "POST", body: { email: email.trim(), delta: Number(delta), note } }),
    onSuccess: (r) => {
      toast.success(`Done. They now have ${r.wallet.balance} pass${r.wallet.balance === 1 ? "" : "es"}.`)
      setNote("")
      qc.invalidateQueries({ queryKey: ["tournament-passes"] })
    },
    onError: (e: Error) => toast.error("Could not change passes", { description: e.message }),
  })

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Link to="/tournaments" className="text-ui-fg-subtle txt-compact-small hover:text-ui-fg-base">
            Tournaments
          </Link>
          <Heading level="h1" className="mt-1">
            Tournament Passes
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Players enter online tournaments with a pass they earn by playing. Passes are never sold, can't be transferred and have no cash value.
          </Text>
        </div>
        {data && (
          <div className="grid grid-cols-3 divide-x">
            {[
              ["Passes given", data.totals.earned],
              ["Used to enter", data.totals.spent],
              ["Players with passes", data.totals.players],
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
        )}
      </Container>

      <Container className="flex flex-col gap-4">
        <Heading level="h2">How players earn passes</Heading>
        {rules && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {FIELDS.map(([k, label, hint]) => (
              <div key={k} className="flex flex-col gap-1.5">
                <Label htmlFor={`r-${k}`}>{label}</Label>
                <Input id={`r-${k}`} type="number" min={0} value={rules[k]} onChange={(e) => setRules({ ...rules, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                {hint && (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {hint}
                  </Text>
                )}
              </div>
            ))}
          </div>
        )}
        <div>
          <Button size="small" disabled={!rules || JSON.stringify(rules) === JSON.stringify(data?.rules)} isLoading={saveRules.isPending} onClick={() => saveRules.mutate()}>
            Save rules
          </Button>
        </div>
      </Container>

      <Container className="flex flex-col gap-3">
        <Heading level="h2">Give or take passes</Heading>
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_100px_1.4fr_auto]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-email">Player's email</Label>
            <Input id="g-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-n">Passes</Label>
            <Input id="g-n" type="number" min={-20} max={20} value={delta} onChange={(e) => setDelta(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-note">Reason (the player sees it)</Label>
            <Input id="g-note" value={note} placeholder="e.g. Sorry about the server problem on Sunday" onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button size="small" disabled={!email.includes("@") || !Number(delta) || note.trim().length < 3} isLoading={grant.isPending} onClick={() => grant.mutate()}>
            {Number(delta) < 0 ? "Take passes" : "Give passes"}
          </Button>
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Heading level="h2">Latest changes</Heading>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSearch(q.trim())
            }}
          >
            <Input size="small" type="search" placeholder="Find a player by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
        </div>
        {!data?.entries.length ? (
          <Text className="px-6 py-6 text-ui-fg-subtle">{search ? "Nothing for that player." : "No passes yet."}</Text>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>When</Table.HeaderCell>
                <Table.HeaderCell>Player</Table.HeaderCell>
                <Table.HeaderCell>Change</Table.HeaderCell>
                <Table.HeaderCell>Why</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Has now</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.entries.map((e) => (
                <Table.Row key={e.id}>
                  <Table.Cell className="whitespace-nowrap">{new Date(e.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</Table.Cell>
                  <Table.Cell>
                    <span className="font-medium">{e.name || "–"}</span>
                    <span className="block text-ui-fg-subtle txt-compact-xsmall">{e.email}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge size="2xsmall" color={e.delta > 0 ? "green" : "grey"}>
                      {e.delta > 0 ? `+${e.delta}` : e.delta}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {e.reason_label}
                    {e.note && <span className="block text-ui-fg-subtle txt-compact-xsmall">{e.note}</span>}
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums">{e.balance}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>
    </div>
  )
}

export default PassesPage
