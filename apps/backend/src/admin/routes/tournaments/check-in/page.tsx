import { CheckCircleSolid } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { sdk } from "../../../lib/sdk"
import { formatEventDate } from "../../../lib/tournaments"

type Ticket = {
  id: string
  ticket_code: string
  status: "confirmed" | "cancelled"
  checked_in_at: string | null
  player_name: string
  email: string
  phone: string | null
  fide_id: string | null
  rating: number | null
  city: string | null
  tournament: { id: string; title: string; mode: string; starts_at: string; venue: string | null; time_control: string; format_label: string }
}

// The door: scan a ticket's QR code with a phone camera (it opens this page with the code
// filled in), or type the code. One tap checks the player in.
const CheckInPage = () => {
  const [params, setParams] = useSearchParams()
  const code = (params.get("code") ?? "").toUpperCase()
  const [typed, setTyped] = useState(code)
  const input = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  useEffect(() => setTyped(code), [code])

  const lookup = useQuery({
    queryKey: ["ticket-checkin", code],
    queryFn: () => sdk.client.fetch<{ ticket: Ticket }>(`/admin/tournament-checkin?code=${encodeURIComponent(code)}`),
    enabled: code.length >= 6,
    retry: false,
  })
  const ticket = lookup.data?.ticket

  const checkIn = useMutation({
    mutationFn: (undo: boolean) => sdk.client.fetch<{ ticket: Ticket }>("/admin/tournament-checkin", { method: "POST", body: { code, undo } }),
    onSuccess: (res, undo) => {
      qc.setQueryData(["ticket-checkin", code], res)
      qc.invalidateQueries({ queryKey: ["tournament", res.ticket.tournament.id] })
      if (!undo) toast.success(`${res.ticket.player_name} is checked in`)
    },
    onError: (e: Error) => toast.error("Could not check in", { description: e.message }),
  })

  const next = () => {
    setParams({})
    setTyped("")
    setTimeout(() => input.current?.focus(), 0)
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-y-3">
      <Container className="flex flex-col gap-y-4">
        <div>
          <Link to="/tournaments" className="text-ui-fg-subtle txt-compact-small hover:text-ui-fg-base">
            Tournaments
          </Link>
          <Heading level="h1" className="mt-1">
            Check in players
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Scan the QR code on a player's ticket with your phone camera, or type the ticket code.
          </Text>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (typed.trim()) setParams({ code: typed.trim().toUpperCase() })
          }}
        >
          <Label htmlFor="ticket-code" className="sr-only">
            Ticket code
          </Label>
          <Input
            id="ticket-code"
            ref={input}
            autoFocus
            autoComplete="off"
            placeholder="T64-XXXXXX"
            className="font-mono uppercase"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            Find
          </Button>
        </form>
      </Container>

      {code && lookup.isLoading && (
        <Container>
          <Text>Looking up {code}...</Text>
        </Container>
      )}
      {code && lookup.error && (
        <Container className="border-ui-border-error">
          <Text weight="plus">Ticket not found</Text>
          <Text size="small" className="text-ui-fg-subtle">
            {(lookup.error as Error).message}
          </Text>
          <Button size="small" variant="secondary" className="mt-3" onClick={next}>
            Try another code
          </Button>
        </Container>
      )}
      {ticket && (
        <Container className="flex flex-col gap-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Text size="small" className="font-mono text-ui-fg-subtle">
                {ticket.ticket_code}
              </Text>
              <Heading level="h2" className="mt-1 text-[24px]">
                {ticket.player_name}
              </Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {ticket.email}
                {ticket.phone ? ` · ${ticket.phone}` : ""}
              </Text>
            </div>
            {ticket.status === "cancelled" ? (
              <Badge color="red">Cancelled</Badge>
            ) : ticket.checked_in_at ? (
              <Badge color="green">Checked in</Badge>
            ) : (
              <Badge color="grey">Not checked in</Badge>
            )}
          </div>
          <div className="rounded-md bg-ui-bg-subtle px-4 py-3">
            <Text weight="plus">{ticket.tournament.title}</Text>
            <Text size="small" className="text-ui-fg-subtle">
              {formatEventDate(ticket.tournament.starts_at)} · {ticket.tournament.format_label}, {ticket.tournament.time_control}
            </Text>
            {(ticket.rating != null || ticket.fide_id) && (
              <Text size="small" className="text-ui-fg-subtle">
                {ticket.rating != null ? `Rating ${ticket.rating}` : ""}
                {ticket.fide_id ? `${ticket.rating != null ? " · " : ""}FIDE ${ticket.fide_id}` : ""}
              </Text>
            )}
          </div>
          {ticket.status === "cancelled" ? (
            <Text size="small" className="text-ui-fg-error">
              This place was cancelled, so the ticket doesn't let them in. Restore it from the tournament's player list if that was a mistake.
            </Text>
          ) : ticket.checked_in_at ? (
            <div className="flex items-center gap-x-2 text-ui-fg-interactive">
              <CheckCircleSolid className="text-ui-tag-green-icon" />
              <Text size="small">Arrived {new Date(ticket.checked_in_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</Text>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {ticket.status === "confirmed" && !ticket.checked_in_at && (
              <Button size="large" className="flex-1" isLoading={checkIn.isPending} onClick={() => checkIn.mutate(false)}>
                Check in
              </Button>
            )}
            {ticket.status === "confirmed" && ticket.checked_in_at && (
              <Button variant="secondary" isLoading={checkIn.isPending} onClick={() => checkIn.mutate(true)}>
                Undo check-in
              </Button>
            )}
            <Button variant="secondary" onClick={next}>
              Next player
            </Button>
          </div>
        </Container>
      )}
    </div>
  )
}

export default CheckInPage
