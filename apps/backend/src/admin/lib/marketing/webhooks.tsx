import { Badge, Button, Checkbox, Copy, Heading, Input, Label, Switch, Text, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../sdk"
import { EVENT_LABELS, EVENT_NAMES, type EventName, type MarketingView, type Webhook } from "./types"

type WithSecret = MarketingView & { secret?: string; result?: { ok: boolean; message: string } }

const VERIFY_SNIPPET = `// Node.js: check a webhook really came from your store
const crypto = require("crypto")
function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")))
  const expected = crypto.createHmac("sha256", secret).update(parts.t + "." + rawBody).digest("hex")
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300
  return fresh && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
}`

// Webhooks: send chosen events to any other tool (a CRM, Zapier, Make, your own system).
export function Webhooks({ view }: { view: MarketingView }) {
  const qc = useQueryClient()
  const [url, setUrl] = useState("")
  const [events, setEvents] = useState<EventName[]>(["Purchase", "Refund"])
  const [secret, setSecret] = useState<{ id: string; value: string } | null>(null)

  const done = (r: WithSecret) => {
    const { secret: _s, result: _r, ...v } = r
    qc.setQueryData(["marketing"], v)
  }
  const add = useMutation({
    mutationFn: () => sdk.client.fetch<WithSecret & { id: string }>("/admin/marketing/webhooks", { method: "POST", body: { url: url.trim(), events } }),
    onSuccess: (r) => {
      done(r)
      setSecret({ id: r.id, value: r.secret ?? "" })
      setUrl("")
      toast.success("Webhook added. Copy its signing secret now: it isn't shown again.")
    },
    onError: (e: Error) => toast.error("Webhook not added", { description: e.message }),
  })

  return (
    <div className="flex flex-col divide-y">
      <div className="flex flex-col gap-3 px-6 py-4">
        <div>
          <Heading level="h2">Webhooks</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Send the events you choose to another tool&apos;s address, as JSON. Each call is signed so the tool can check it came from your store. Failed calls are retried for up to about 9 hours and are listed in the Event Manager.
          </Text>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label weight="plus" htmlFor="wh-url">
            Address
          </Label>
          <Input id="wh-url" placeholder="https://hooks.example.com/the64squares" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <EventPicker value={events} onChange={setEvents} />
        <div>
          <Button size="small" disabled={!url.trim() || events.length === 0 || view.webhooks.length >= 10} isLoading={add.isPending} onClick={() => add.mutate()}>
            Add webhook
          </Button>
        </div>
      </div>

      {secret && (
        <div className="flex flex-col gap-2 bg-ui-bg-subtle px-6 py-4">
          <Text size="small" weight="plus">
            Signing secret (shown once)
          </Text>
          <div className="flex items-center gap-2 rounded-md bg-ui-bg-base px-3 py-2 font-mono txt-compact-xsmall">
            <span className="min-w-0 flex-1 break-all">{secret.value}</span>
            <Copy content={secret.value} />
          </div>
          <div>
            <Button size="small" variant="secondary" onClick={() => setSecret(null)}>
              I&apos;ve saved it
            </Button>
          </div>
        </div>
      )}

      {view.webhooks.length === 0 ? (
        <div className="px-6 py-6">
          <Text size="small" className="text-ui-fg-subtle">
            No webhooks yet. Add one above to send events to another tool.
          </Text>
        </div>
      ) : (
        view.webhooks.map((w) => <Row key={w.id} w={w} onDone={done} onSecret={(value) => setSecret({ id: w.id, value })} />)
      )}

      <div className="flex flex-col gap-2 px-6 py-4">
        <Heading level="h3">Checking the signature</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Every call has the header X-T64-Signature: t=time,v1=signature. The signature is an HMAC-SHA256 of the time, a dot and the raw body, using the webhook&apos;s secret. Reject calls older than 5 minutes. X-T64-Event-Id is the same on retries, so you can ignore repeats. Customer name, email and phone are included when the event has them (orders, sign-ups, unfinished checkouts), so only send to tools you trust.
        </Text>
        <pre className="overflow-x-auto rounded-md bg-ui-bg-subtle p-3 font-mono txt-compact-xsmall">{VERIFY_SNIPPET}</pre>
      </div>
    </div>
  )
}

function EventPicker({ value, onChange }: { value: EventName[]; onChange: (v: EventName[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label weight="plus">Events</Label>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {EVENT_NAMES.map((e) => (
          <label key={e} className="flex items-center gap-2 txt-compact-small">
            <Checkbox checked={value.includes(e)} onCheckedChange={(c) => onChange(c ? [...value, e] : value.filter((x) => x !== e))} />
            {EVENT_LABELS[e]}
          </label>
        ))}
      </div>
    </div>
  )
}

function Row({ w, onDone, onSecret }: { w: Webhook; onDone: (r: WithSecret) => void; onSecret: (s: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [events, setEvents] = useState<EventName[]>(w.events)
  const base = `/admin/marketing/webhooks/${w.id}`
  const update = useMutation({
    mutationFn: (body: Partial<{ enabled: boolean; events: EventName[] }>) => sdk.client.fetch<WithSecret>(base, { method: "POST", body }),
    onSuccess: (r) => {
      onDone(r)
      setEditing(false)
      toast.success("Saved.")
    },
    onError: (e: Error) => toast.error("Not saved", { description: e.message }),
  })
  const test = useMutation({
    mutationFn: () => sdk.client.fetch<WithSecret>(`${base}/test`, { method: "POST" }),
    onSuccess: (r) => {
      onDone(r)
      if (r.result?.ok) toast.success("Test call accepted", { description: r.result.message })
      else toast.error("Test call failed", { description: r.result?.message })
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const rotate = useMutation({
    mutationFn: () => sdk.client.fetch<WithSecret>(`${base}/rotate`, { method: "POST" }),
    onSuccess: (r) => {
      onDone(r)
      onSecret(r.secret ?? "")
      toast.success("New secret made. The old one has stopped working.")
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: () => sdk.client.fetch<WithSecret>(base, { method: "DELETE" }),
    onSuccess: (r) => {
      onDone(r)
      toast.success("Webhook deleted.")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Text size="small" weight="plus" className="break-all">
            {w.url}
          </Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {w.events.map((e) => EVENT_LABELS[e]).join(", ")}. Secret ends in {w.secret_last4}.
          </Text>
          <div className="mt-1">
            {w.last_test ? (
              <Badge size="2xsmall" color={w.last_test.ok ? "green" : "red"}>
                {w.last_test.ok ? "Test passed" : "Test failed"}: {w.last_test.message}
              </Badge>
            ) : (
              <Badge size="2xsmall" color="grey">
                Not tested yet
              </Badge>
            )}
          </div>
        </div>
        <label className="flex items-center gap-2 txt-compact-small">
          <Switch checked={w.enabled} disabled={update.isPending} onCheckedChange={(enabled) => update.mutate({ enabled })} />
          {w.enabled ? "On" : "Off"}
        </label>
      </div>
      {editing && (
        <div className="flex flex-col gap-2">
          <EventPicker value={events} onChange={setEvents} />
          <div className="flex gap-2">
            <Button size="small" disabled={events.length === 0} isLoading={update.isPending} onClick={() => update.mutate({ events })}>
              Save events
            </Button>
            <Button size="small" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="small" variant="secondary" isLoading={test.isPending} onClick={() => test.mutate()}>
          Send test
        </Button>
        {!editing && (
          <Button size="small" variant="secondary" onClick={() => setEditing(true)}>
            Change events
          </Button>
        )}
        <Button size="small" variant="secondary" isLoading={rotate.isPending} onClick={() => window.confirm("Make a new secret? The old one stops working at once.") && rotate.mutate()}>
          New secret
        </Button>
        <Button size="small" variant="danger" isLoading={remove.isPending} onClick={() => window.confirm("Delete this webhook?") && remove.mutate()}>
          Delete
        </Button>
      </div>
    </div>
  )
}
