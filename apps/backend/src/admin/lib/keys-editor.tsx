import { Badge, Button, Container, Copy, Heading, Input, Label, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "./sdk"

// Settings → Payments & delivery → Keys (main admin only). Keys are write-only: after saving,
// only the last 4 characters are shown. Saving asks for the main admin's password, and every
// change is emailed to the main admin.

type KeyRow = {
  name: string
  group: "razorpay_test" | "razorpay_live" | "payu_test" | "payu_live" | "resend" | "google" | "delhivery" | "mailbox" | "ai" | "voice" | "livekit"
  label: string
  secret: boolean
  hint: string
  source: "admin" | "server" | null
  unreadable: boolean
  preview: string | null
  updated_at: string | null
}
type View = {
  razorpay_mode: "test" | "live"
  payu_mode: "test" | "live"
  keys: KeyRow[]
  log: { at: string; by: string; what: string }[]
  webhook_url: string
  payu_webhook_url: string
  google_redirect_url: string
}
type TestService = "razorpay_test" | "razorpay_live" | "payu_test" | "payu_live" | "resend" | "delhivery" | "mailbox" | "ai" | "voice" | "livekit"

const QUERY = ["service-keys"]

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

function Status({ row }: { row: KeyRow }) {
  if (row.unreadable) {
    return <Badge size="2xsmall" color="red">Can't unlock: enter again</Badge>
  }
  if (!row.source) {
    return <Badge size="2xsmall" color="orange">Not set</Badge>
  }
  return (
    <span className="flex items-center gap-x-2">
      <Text size="small" className="font-mono text-ui-fg-subtle">
        {row.preview}
      </Text>
      <Badge size="2xsmall" color={row.source === "admin" ? "green" : "blue"}>
        {row.source === "admin" ? "Saved here" : "Set on server"}
      </Badge>
    </span>
  )
}

function KeyField({
  row,
  value,
  remove,
  onChange,
  onRemove,
}: {
  row: KeyRow
  value: string
  remove: boolean
  onChange: (v: string) => void
  onRemove: (on: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={row.name}>{row.label}</Label>
        <Status row={row} />
      </div>
      <Input
        id={row.name}
        // A plain text box with the characters hidden, not a password box: browsers fill
        // saved passwords into password boxes (ignoring autoComplete="off"), which used to put
        // the admin password into the first secret here and block saving other keys.
        type="text"
        name={`key-${row.name.toLowerCase()}`}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        style={row.secret && value ? ({ WebkitTextSecurity: "disc" } as React.CSSProperties) : undefined}
        placeholder={row.source ? "Paste a new value to replace it" : "Paste here"}
        value={value}
        disabled={remove}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex items-center justify-between gap-2">
        <Text size="xsmall" className="text-ui-fg-subtle">
          {row.hint}
          {row.updated_at ? ` · saved ${when(row.updated_at)}` : ""}
        </Text>
        {row.source === "admin" && (
          <button type="button" className="txt-compact-xsmall text-ui-fg-subtle underline" onClick={() => onRemove(!remove)}>
            {remove ? "Keep" : "Remove"}
          </button>
        )}
      </div>
    </div>
  )
}

function TestButton({ service, label }: { service: TestService; label: string }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const test = useMutation({
    mutationFn: () => sdk.client.fetch<{ ok: boolean; message: string }>("/admin/service-keys/check", { method: "POST", body: { service } }),
    onSuccess: (r) => setResult(r),
    onError: (e: Error) => setResult({ ok: false, message: e.message }),
  })
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="small" variant="secondary" isLoading={test.isPending} onClick={() => test.mutate()}>
        {label}
      </Button>
      {result && (
        <Text size="small" className={result.ok ? "text-ui-tag-green-text" : "text-ui-tag-red-text"}>
          {result.ok ? "✓ " : "✗ "}
          {result.message}
        </Text>
      )}
    </div>
  )
}

// Test / Live switch for a payment gateway.
function ModeSwitch({ current, saved, liveReady, onPick }: { current: "test" | "live"; saved: "test" | "live"; liveReady: boolean; onPick: (m: "test" | "live") => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Text size="small" weight="plus">
        Mode
      </Text>
      <div className="flex rounded-full bg-ui-bg-subtle p-0.5 shadow-borders-base">
        {(["test", "live"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onPick(m)}
            disabled={m === "live" && !liveReady}
            className={`txt-compact-small-plus rounded-full px-4 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              current === m ? (m === "live" ? "bg-ui-tag-green-bg text-ui-tag-green-text shadow-borders-base" : "bg-ui-bg-base shadow-borders-base") : "text-ui-fg-subtle"
            }`}
          >
            {m === "test" ? "Test" : "Live"}
          </button>
        ))}
      </div>
      {current !== saved && (
        <Text size="small" className="text-ui-tag-orange-text">
          Switches to {current === "live" ? "Live (real money)" : "Test"} when you save.
        </Text>
      )}
      {!liveReady && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          Add the Live keys to switch to Live.
        </Text>
      )}
    </div>
  )
}

function Block({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-y-4 px-6 py-5">
      <div>
        <Heading level="h3">{title}</Heading>
        {intro && (
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {intro}
          </Text>
        )}
      </div>
      {children}
    </div>
  )
}

function CopyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-ui-bg-subtle px-3 py-2">
      <Text size="xsmall" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Text size="small" className="break-all font-mono">
        {value}
      </Text>
      <Copy content={value} />
    </div>
  )
}

export function KeysEditor() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY,
    queryFn: () => sdk.client.fetch<View>("/admin/service-keys"),
    retry: false,
  })
  const [values, setValues] = useState<Record<string, string>>({})
  const [removals, setRemovals] = useState<Record<string, boolean>>({})
  const [mode, setMode] = useState<"test" | "live" | null>(null)
  const [payuMode, setPayuMode] = useState<"test" | "live" | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      sdk.client.fetch<View & { changed: string[] }>("/admin/service-keys", { method: "POST", body }),
    onSuccess: (r) => {
      qc.setQueryData(QUERY, r)
      qc.invalidateQueries({ queryKey: ["checkout-settings"] })
      setValues({})
      setRemovals({})
      setMode(null)
      setPayuMode(null)
      setPassword("")
      setConfirming(false)
      setFormError(null)
      toast.success(r.changed.length ? `Saved: ${r.changed.join(", ")}` : "Nothing changed")
    },
    onError: (e: Error) => setFormError(e.message),
  })

  if (isLoading) {
    return (
      <Container className="px-6 py-4">
        <Text size="small">Loading keys…</Text>
      </Container>
    )
  }
  if (error || !data) {
    return null
  }

  const rows = (group: KeyRow["group"]) => data.keys.filter((k) => k.group === group)
  const field = (row: KeyRow) => (
    <KeyField
      key={row.name}
      row={row}
      value={values[row.name] ?? ""}
      remove={!!removals[row.name]}
      onChange={(v) => setValues((x) => ({ ...x, [row.name]: v }))}
      onRemove={(on) => setRemovals((x) => ({ ...x, [row.name]: on }))}
    />
  )
  const currentMode = mode ?? data.razorpay_mode
  const pending: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(values)) if (v.trim()) pending[k] = v
  for (const [k, on] of Object.entries(removals)) if (on) pending[k] = null
  const payuCurrent = payuMode ?? data.payu_mode
  const payuLiveReady = rows("payu_live").every((r) => r.source || values[r.name]?.trim())
  const dirty = Object.keys(pending).length > 0 || (mode !== null && mode !== data.razorpay_mode) || (payuMode !== null && payuMode !== data.payu_mode)
  const liveReady = rows("razorpay_live").filter((r) => !r.name.includes("WEBHOOK")).every((r) => r.source || values[r.name]?.trim())

  const submit = () =>
    save.mutate({
      password,
      values: pending,
      ...(mode && mode !== data.razorpay_mode ? { razorpay_mode: mode } : {}),
      ...(payuMode && payuMode !== data.payu_mode ? { payu_mode: payuMode } : {}),
    })

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Keys</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Only you (the main admin) can see this. Saved keys are stored encrypted and never shown again, only their last
          4 characters. Saving asks for your password, and every change is emailed to you.
        </Text>
      </div>

      <Block
        title="Razorpay"
        intro="Use Test mode to try payments with Razorpay's test cards and UPI. Switch to Live when you're ready to take real money."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Text size="small" weight="plus">
            Mode
          </Text>
          <div className="flex rounded-full bg-ui-bg-subtle p-0.5 shadow-borders-base">
            {(["test", "live"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                disabled={m === "live" && !liveReady}
                className={`txt-compact-small-plus rounded-full px-4 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  currentMode === m ? (m === "live" ? "bg-ui-tag-green-bg text-ui-tag-green-text shadow-borders-base" : "bg-ui-bg-base shadow-borders-base") : "text-ui-fg-subtle"
                }`}
              >
                {m === "test" ? "Test" : "Live"}
              </button>
            ))}
          </div>
          {mode && mode !== data.razorpay_mode && (
            <Text size="small" className="text-ui-tag-orange-text">
              Switches to {mode === "live" ? "Live (real money)" : "Test"} when you save.
            </Text>
          )}
          {!liveReady && (
            <Text size="xsmall" className="text-ui-fg-subtle">
              Add the Live keys to switch to Live.
            </Text>
          )}
        </div>
        <CopyLine label="Webhook URL (use for both Test and Live webhooks)" value={data.webhook_url} />
        <Text size="xsmall" className="text-ui-fg-subtle">
          Webhook events: order.paid, payment.captured, payment.failed.
        </Text>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="flex flex-col gap-y-4 rounded-lg p-4 shadow-borders-base">
            <Text size="small" weight="plus">
              Test keys
            </Text>
            {rows("razorpay_test").map(field)}
            <TestButton service="razorpay_test" label="Test the Test keys" />
          </div>
          <div className="flex flex-col gap-y-4 rounded-lg p-4 shadow-borders-base">
            <Text size="small" weight="plus">
              Live keys
            </Text>
            {rows("razorpay_live").map(field)}
            <TestButton service="razorpay_live" label="Test the Live keys" />
          </div>
        </div>
      </Block>

      <Block
        title="PayU"
        intro="Paste the Merchant Key and Salt from PayU (Dashboard → Developers → API Keys), save, then press Test. Shoppers pay on PayU's secure page and come back to the store; each payment is confirmed directly with PayU before the order is made."
      >
        <ModeSwitch current={payuCurrent} saved={data.payu_mode} liveReady={payuLiveReady} onPick={setPayuMode} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="flex flex-col gap-y-4 rounded-lg p-4 shadow-borders-base">
            <Text size="small" weight="plus">
              Test keys
            </Text>
            {rows("payu_test").map(field)}
            <TestButton service="payu_test" label="Test the Test keys" />
          </div>
          <div className="flex flex-col gap-y-4 rounded-lg p-4 shadow-borders-base">
            <Text size="small" weight="plus">
              Live keys
            </Text>
            {rows("payu_live").map(field)}
            <TestButton service="payu_live" label="Test the Live keys" />
          </div>
        </div>
        <CopyLine label="Webhook URL (optional, for both Test and Live)" value={data.payu_webhook_url} />
        <Text size="xsmall" className="text-ui-fg-subtle">
          Optional: in PayU Dashboard → Developers → Webhooks, add this address for &ldquo;Successful payment&rdquo; and &ldquo;Failed payment&rdquo;. Without it, the store still checks
          waiting PayU payments with PayU every 5 minutes, so an order is never lost if a shopper closes the page after paying. The return address after payment is sent with
          each payment; nothing to set in PayU for it.
        </Text>
      </Block>

      <Block title="Emails (Resend)" intro="Order confirmations, shipping updates, sign-in codes and these alerts.">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">{rows("resend").map(field)}</div>
        <TestButton service="resend" label="Send a test email" />
      </Block>

      <Block
        title="Shop inbox (info@the64squares.in)"
        intro="Shows every email to your shop address under Messages → Email, and lets you reply from the admin. Your webmail and phone app keep working as before."
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">{rows("mailbox").map(field)}</div>
        <Text size="xsmall" className="text-ui-fg-subtle">
          GoDaddy: leave both servers empty. Other providers: Titan imap.titan.email:993 and smtp.titan.email:465; Zoho imap.zoho.in:993 and
          smtp.zoho.in:465; Hostinger imap.hostinger.com:993 and smtp.hostinger.com:465.
        </Text>
        <TestButton service="mailbox" label="Test the inbox" />
      </Block>

      <Block
        title="AI writing (free)"
        intro="Optional. Used by the chat bot (answers in its own words), live commentary (livelier lines) and the writing helper. Both have free plans with no card needed: Groq is tried first, Gemini is the spare. Without a key everything still works with plain built-in wording."
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">{rows("ai").map(field)}</div>
        <Text size="xsmall" className="text-ui-fg-subtle">
          Groq: sign in at console.groq.com → API Keys → Create API key. Gemini: sign in at aistudio.google.com → Get API key → Create API key.
          Customers' names, emails, phone numbers and order numbers are never sent to them.
        </Text>
        <TestButton service="ai" label="Test the AI" />
      </Block>

      <Block
        title="Coach and commentary voice (ElevenLabs)"
        intro="Optional. The game review's coach and featured live commentary are read aloud in this voice (each sentence is made once and kept, so repeats cost nothing). Without a key, people hear their browser's own voice."
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">{rows("voice").map(field)}</div>
        <TestButton service="voice" label="Test the voice" />
      </Block>

      <Block
        title="Lobby voice (LiveKit)"
        intro="Voice chat in tournament lobbies. Leave all three empty to use the voice server on your own VPS (the update script sets it up). For more people, use LiveKit Cloud: add its URL, key and secret. Switch lobby voice on in Website → Site features."
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">{rows("livekit").map(field)}</div>
        <TestButton service="livekit" label="Test the voice server" />
      </Block>

      <Block title="Sign in with Google" intro="Optional. Shoppers can always sign in with an email code or password.">
        <CopyLine label="Authorised redirect URI" value={data.google_redirect_url} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">{rows("google").map(field)}</div>
      </Block>

      <Block title="Delhivery" intro="Optional. Checks whether Delhivery delivers to a pincode. Without it, every valid pincode is accepted.">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">{rows("delhivery").map(field)}</div>
        <TestButton service="delhivery" label="Test the token" />
      </Block>

      <div className="flex flex-col gap-y-3 px-6 py-4">
        {confirming ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="flex min-w-[260px] flex-col gap-y-1.5">
              <Label htmlFor="owner-password">Your admin password</Label>
              <Input
                id="owner-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" size="small" isLoading={save.isPending} disabled={!password}>
              Confirm and save
            </Button>
            <Button
              type="button"
              size="small"
              variant="secondary"
              onClick={() => {
                setConfirming(false)
                setPassword("")
                setFormError(null)
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <Text size="small" className="text-ui-fg-subtle">
              {dirty ? "You have unsaved key changes." : "Paste a key above to add or replace it."}
            </Text>
            <Button size="small" disabled={!dirty} onClick={() => setConfirming(true)}>
              Save keys
            </Button>
          </div>
        )}
        {formError && (
          <Text size="small" className="text-ui-tag-red-text">
            {formError}
          </Text>
        )}
      </div>

      {data.log.length > 0 && (
        <div className="px-6 py-4">
          <Label>Recent changes</Label>
          <ul className="mt-2 flex flex-col gap-y-1">
            {data.log.map((l, i) => (
              <li key={i}>
                <Text size="small" className="text-ui-fg-subtle">
                  {when(l.at)} · {l.by} · {l.what}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Container>
  )
}
