import { Button, Drawer, Heading, Input, Label, Select, Switch, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { fromLocalInput, toLocalInput } from "./dates"
import { FORMATTING_HELP } from "./formatting"
import { ImageField } from "./image-field"
import { sdk } from "./sdk"
import { useLeaveWarning } from "./site-preview"

export type TournamentStatus = "draft" | "published" | "cancelled" | "completed"

export type Tournament = {
  id: string
  title: string
  handle: string
  summary: string | null
  description: string
  format: "arena" | "swiss" | "round_robin" | "knockout"
  format_label?: string
  mode: "online" | "offline"
  time_control: string
  rounds: number | null
  starts_at: string
  ends_at: string | null
  registration_closes_at: string | null
  venue: string | null
  capacity: number | null
  entry_fee: number
  rating_min: number | null
  rating_max: number | null
  prizes: string | null
  rules: string | null
  image_url: string | null
  status: TournamentStatus
  registered?: number
  entry: "pass" | "free" | "fee"
  pass_cost: number
  check_in_minutes: number
  min_players: number
  round_break_seconds: number
  knockout_games: number
  armageddon: boolean
  age_min: number | null
  age_max: number | null
  prize_list: Prize[] | null
  category_prizes: { category: string; title: string }[] | null
  tagline: string | null
  accent: string | null
  featured: boolean
  stream_url: string | null
  coupon_code: string | null
  certificates: boolean
  reminders: boolean
  // Run from the tournament page, not the form.
  paused?: boolean
  cancel_reason?: string | null
  results_final_at?: string | null
  results_at?: string | null
}

export type Prize = { place: string; title: string; detail?: string | null; image_url?: string | null; product_handle?: string | null }

export type Registration = {
  id: string
  customer_id: string
  ticket_code: string
  status: "confirmed" | "cancelled" | "withdrawn"
  checked_in_at: string | null
  final_rank: number | null
  score: number | null
  review: "pending" | "cleared" | "disqualified" | null
  review_note: string | null
  prize_title: string | null
  prize_status: "due" | "address" | "shipped" | "delivered" | null
  prize_address: Record<string, string> | null
  prize_tracking: string | null
  certificate_no: string | null
  source: string | null
  player_name: string
  email: string
  phone: string | null
  fide_id: string | null
  rating: number | null
  city: string | null
  created_at: string
}

export const STATUS_LABELS: Record<TournamentStatus, { label: string; color: "grey" | "green" | "red" | "blue" }> = {
  draft: { label: "Draft", color: "grey" },
  published: { label: "Open", color: "green" },
  cancelled: { label: "Cancelled", color: "red" },
  completed: { label: "Finished", color: "blue" },
}

const FORMATS: [Tournament["format"], string, string][] = [
  ["arena", "Arena", "Play as many games as you can in a fixed time; quick re-pairing. Best for online."],
  ["swiss", "Swiss", "Fixed rounds; players with similar scores meet. Standard for opens."],
  ["round_robin", "Round robin", "Everyone plays everyone (8 players: 7 rounds). For small groups."],
  ["knockout", "Knockout", "Lose and you're out."],
]

type Form = Omit<Tournament, "id" | "format_label" | "registered" | "paused" | "cancel_reason" | "results_final_at" | "results_at">

const EMPTY: Form = {
  title: "",
  handle: "",
  summary: null,
  description: "",
  format: "arena",
  mode: "online",
  time_control: "3+2",
  rounds: null,
  starts_at: "",
  ends_at: null,
  registration_closes_at: null,
  venue: null,
  capacity: null,
  entry_fee: 0,
  rating_min: null,
  rating_max: null,
  prizes: null,
  rules: null,
  image_url: null,
  status: "draft",
  entry: "pass",
  pass_cost: 1,
  check_in_minutes: 30,
  min_players: 4,
  round_break_seconds: 60,
  knockout_games: 1,
  armageddon: true,
  age_min: null,
  age_max: null,
  prize_list: null,
  category_prizes: null,
  tagline: null,
  accent: null,
  featured: false,
  stream_url: null,
  coupon_code: null,
  certificates: true,
  reminders: true,
}

const toHandle = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const intOrNull = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v) || 0)))
const textOrNull = (v: string) => (v.trim() === "" ? null : v)

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {hint}
        </Text>
      )}
    </div>
  )
}

const PLACE_NAMES = ["1st place", "2nd place", "3rd place"]
const placeName = (i: number) => PLACE_NAMES[i] ?? `${i + 1}th place`

// Prizes by finishing place: the first line goes to 1st, the next to 2nd, and so on.
function PrizeEditor({ value, onChange }: { value: Prize[]; onChange: (v: Prize[]) => void }) {
  const edit = (i: number, patch: Partial<Prize>) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  return (
    <div className="flex flex-col gap-2">
      <Text size="small" className="text-ui-fg-subtle">
        By place: the first line goes to the winner. Link a product to show its picture and a shop link.
      </Text>
      {value.map((p, i) => (
        <div key={i} className="grid grid-cols-[110px_1fr_1fr_160px_auto] items-center gap-2">
          <Input size="small" aria-label="Place" value={p.place} onChange={(e) => edit(i, { place: e.target.value })} />
          <Input size="small" aria-label="Prize" placeholder="Prize, e.g. Walnut chess board" value={p.title} onChange={(e) => edit(i, { title: e.target.value })} />
          <Input size="small" aria-label="Detail" placeholder="Detail (optional)" value={p.detail ?? ""} onChange={(e) => edit(i, { detail: textOrNull(e.target.value) })} />
          <Input size="small" aria-label="Product web address" placeholder="Product handle" value={p.product_handle ?? ""} onChange={(e) => edit(i, { product_handle: textOrNull(e.target.value) })} />
          <Button size="small" variant="transparent" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button size="small" variant="secondary" onClick={() => onChange([...value, { place: placeName(value.length), title: "" }])}>
          Add a prize
        </Button>
      </div>
    </div>
  )
}

// Special prizes: best under-12, best woman, best from a city.
function CategoryPrizeEditor({ value, onChange }: { value: { category: string; title: string }[]; onChange: (v: { category: string; title: string }[]) => void }) {
  const edit = (i: number, patch: Partial<{ category: string; title: string }>) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  return (
    <div className="flex flex-col gap-2">
      {value.map((p, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
          <Input size="small" aria-label="Category" placeholder="e.g. Best under-12" value={p.category} onChange={(e) => edit(i, { category: e.target.value })} />
          <Input size="small" aria-label="Prize" placeholder="Prize" value={p.title} onChange={(e) => edit(i, { title: e.target.value })} />
          <Button size="small" variant="transparent" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button size="small" variant="transparent" onClick={() => onChange([...value, { category: "", title: "" }])}>
          Add a special prize (best junior, best woman…)
        </Button>
      </div>
    </div>
  )
}

// Create or edit a tournament (everything except the players).
export function TournamentDrawer({ tournament, open, onClose }: { tournament: Tournament | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const isNew = !tournament
  const [form, setForm] = useState<Form>(EMPTY)
  const [initial, setInitial] = useState("")

  useEffect(() => {
    if (open) {
      const src: Partial<Form> = tournament ?? {}
      const f = Object.fromEntries((Object.keys(EMPTY) as (keyof Form)[]).map((k) => [k, src[k] ?? EMPTY[k]])) as Form
      setForm(f)
      setInitial(JSON.stringify(f))
    }
  }, [open, tournament])
  const dirty = open && JSON.stringify(form) !== initial
  useLeaveWarning(dirty)

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  const close = async () => {
    if (dirty && !(await prompt({ title: "Leave without saving?", description: "Your changes will be lost.", confirmText: "Leave", cancelText: "Keep editing" }))) {
      return
    }
    onClose()
  }

  const problems = [
    !form.title.trim() && "a name",
    !form.handle && "a web address",
    !form.starts_at && "a start date and time",
    form.mode === "offline" && !form.venue?.trim() && "a venue",
  ].filter(Boolean) as string[]

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ tournament: Tournament }>(isNew ? "/admin/tournaments" : `/admin/tournaments/${tournament!.id}`, {
        method: "POST",
        // An online event never takes an entry fee (see the note under the fee).
        body: {
          ...form,
          entry_fee: form.mode === "online" ? 0 : form.entry_fee,
          entry: form.mode === "online" ? (form.entry === "fee" ? "pass" : form.entry) : form.entry_fee > 0 ? "fee" : "free",
          prize_list: form.prize_list?.filter((p) => p.title.trim()) ?? null,
          category_prizes: form.category_prizes?.filter((p) => p.title.trim() && p.category.trim()) ?? null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournaments"] })
      qc.invalidateQueries({ queryKey: ["tournament"] })
      toast.success(form.status === "published" ? "Saved. Registration is open on the website." : "Saved")
      onClose()
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })

  return (
    <Drawer open={open} onOpenChange={(o) => !o && close()}>
      <Drawer.Content className="max-w-[760px]">
        <Drawer.Header>
          <Drawer.Title>{isNew ? "New tournament" : "Edit tournament"}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-5 overflow-y-auto">
          <Field label="Name" htmlFor="t-title">
            <Input
              id="t-title"
              value={form.title}
              placeholder="e.g. Sunday Blitz Arena"
              onChange={(e) => {
                const title = e.target.value
                setForm((f) => ({ ...f, title, handle: isNew ? toHandle(title) : f.handle }))
              }}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Web address" htmlFor="t-handle" hint={`the64squares.in/${form.mode === "online" ? "play/" : ""}tournaments/${form.handle || "name"}`}>
              <Input id="t-handle" value={form.handle} onChange={(e) => set("handle", toHandle(e.target.value))} />
            </Field>
            <Field label="Status" htmlFor="t-status" hint="Players can register only while it's Open.">
              <Select value={form.status} onValueChange={(v) => set("status", v as TournamentStatus)}>
                <Select.Trigger id="t-status">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {(Object.keys(STATUS_LABELS) as TournamentStatus[]).map((s) => (
                    <Select.Item key={s} value={s}>
                      {STATUS_LABELS[s].label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </Field>
          </div>
          <Field label="One-line summary" htmlFor="t-summary" hint="Shown on the tournament list.">
            <Input id="t-summary" value={form.summary ?? ""} maxLength={300} onChange={(e) => set("summary", textOrNull(e.target.value))} />
          </Field>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Where" htmlFor="t-mode">
              <Select value={form.mode} onValueChange={(v) => set("mode", v as Form["mode"])}>
                <Select.Trigger id="t-mode">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="online">Online, on The 64 Squares</Select.Item>
                  <Select.Item value="offline">Over the board, at a venue</Select.Item>
                </Select.Content>
              </Select>
            </Field>
            <Field label="Format" htmlFor="t-format" hint={FORMATS.find((f) => f[0] === form.format)?.[2]}>
              <Select value={form.format} onValueChange={(v) => set("format", v as Form["format"])}>
                <Select.Trigger id="t-format">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {FORMATS.map(([value, label]) => (
                    <Select.Item key={value} value={value}>
                      {label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </Field>
          </div>
          {form.mode === "offline" && (
            <Field label="Venue" htmlFor="t-venue" hint="Name and address, as players should find it.">
              <Textarea id="t-venue" rows={2} value={form.venue ?? ""} onChange={(e) => set("venue", textOrNull(e.target.value))} />
            </Field>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Time control" htmlFor="t-tc" hint="Minutes + seconds per move, e.g. 3+2.">
              <Input id="t-tc" value={form.time_control} onChange={(e) => set("time_control", e.target.value)} />
            </Field>
            {form.format === "round_robin" ? (
              <Field label="Each pair plays" htmlFor="t-rounds" hint="Rounds follow from the number of players.">
                <Select value={form.rounds === 2 ? "2" : "1"} onValueChange={(v) => set("rounds", v === "2" ? 2 : null)}>
                  <Select.Trigger id="t-rounds">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="1">Once</Select.Item>
                    <Select.Item value="2">Twice (once with each colour)</Select.Item>
                  </Select.Content>
                </Select>
              </Field>
            ) : (
              <Field label="Rounds" htmlFor="t-rounds" hint={form.format === "swiss" ? "Empty: enough to find a clear winner." : "Leave empty for Arena and Knockout."}>
                <Input id="t-rounds" type="number" min={1} value={form.rounds ?? ""} onChange={(e) => set("rounds", intOrNull(e.target.value))} />
              </Field>
            )}
            <Field label="Places" htmlFor="t-cap" hint="Empty = no limit.">
              <Input id="t-cap" type="number" min={1} value={form.capacity ?? ""} onChange={(e) => set("capacity", intOrNull(e.target.value))} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Starts" htmlFor="t-start">
              <Input id="t-start" type="datetime-local" value={toLocalInput(form.starts_at)} onChange={(e) => set("starts_at", fromLocalInput(e.target.value) ?? "")} />
            </Field>
            <Field label="Ends (optional)" htmlFor="t-end">
              <Input id="t-end" type="datetime-local" value={toLocalInput(form.ends_at)} onChange={(e) => set("ends_at", fromLocalInput(e.target.value))} />
            </Field>
            <Field label="Registration closes" htmlFor="t-close" hint="Empty = when it starts.">
              <Input
                id="t-close"
                type="datetime-local"
                value={toLocalInput(form.registration_closes_at)}
                onChange={(e) => set("registration_closes_at", fromLocalInput(e.target.value))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {form.mode === "online" ? (
              <Field label="Entry" htmlFor="t-entry" hint="Online events are free to enter: players use a Tournament Pass they earned by playing. Passes are never sold (a paid online event with prizes needs e-sports registration under the Online Gaming Act 2025).">
                <Select value={form.entry === "fee" ? "pass" : form.entry} onValueChange={(v) => set("entry", v as Form["entry"])}>
                  <Select.Trigger id="t-entry">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="pass">Tournament Pass</Select.Item>
                    <Select.Item value="free">Free, no pass needed</Select.Item>
                  </Select.Content>
                </Select>
              </Field>
            ) : (
              <Field label="Entry fee (₹)" htmlFor="t-fee" hint="Collected at the venue. 0 = free.">
                <Input id="t-fee" type="number" min={0} value={form.entry_fee} onChange={(e) => set("entry_fee", intOrNull(e.target.value) ?? 0)} />
              </Field>
            )}
            <Field label="Lowest rating" htmlFor="t-rmin" hint="Empty = anyone.">
              <Input id="t-rmin" type="number" min={0} value={form.rating_min ?? ""} onChange={(e) => set("rating_min", intOrNull(e.target.value))} />
            </Field>
            <Field label="Highest rating" htmlFor="t-rmax" hint="Empty = anyone.">
              <Input id="t-rmax" type="number" min={0} value={form.rating_max ?? ""} onChange={(e) => set("rating_max", intOrNull(e.target.value))} />
            </Field>
          </div>
          {form.mode === "online" && (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {form.entry !== "free" && (
                  <Field label="Passes to enter" htmlFor="t-pass">
                    <Input id="t-pass" type="number" min={0} max={10} value={form.pass_cost} onChange={(e) => set("pass_cost", intOrNull(e.target.value) ?? 1)} />
                  </Field>
                )}
                <Field label="Youngest age" htmlFor="t-amin" hint="On the start day. Empty = any age.">
                  <Input id="t-amin" type="number" min={4} value={form.age_min ?? ""} onChange={(e) => set("age_min", intOrNull(e.target.value))} />
                </Field>
                <Field label="Oldest age" htmlFor="t-amax" hint="e.g. 14 for an under-15 event.">
                  <Input id="t-amax" type="number" min={4} value={form.age_max ?? ""} onChange={(e) => set("age_max", intOrNull(e.target.value))} />
                </Field>
              </div>

              <Heading level="h3" className="mt-2">
                How it runs
              </Heading>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Check-in (minutes before)" htmlFor="t-ci" hint={form.format === "arena" ? "Arenas don't need check-in: 0." : "Players who don't check in aren't paired. 0 = no check-in."}>
                  <Input id="t-ci" type="number" min={0} max={240} value={form.check_in_minutes} onChange={(e) => set("check_in_minutes", intOrNull(e.target.value) ?? 0)} />
                </Field>
                <Field label="Fewest players" htmlFor="t-min" hint="Fewer check in and it's called off; passes go back.">
                  <Input id="t-min" type="number" min={2} value={form.min_players} onChange={(e) => set("min_players", Math.max(2, intOrNull(e.target.value) ?? 2))} />
                </Field>
                <Field label="Break between rounds (seconds)" htmlFor="t-brk">
                  <Input id="t-brk" type="number" min={0} max={3600} value={form.round_break_seconds} onChange={(e) => set("round_break_seconds", intOrNull(e.target.value) ?? 0)} />
                </Field>
              </div>
              {form.format === "knockout" && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Games per match" htmlFor="t-kg" hint="Best of 1, 2 or more. A tied match goes to sudden death if it's on.">
                    <Input id="t-kg" type="number" min={1} max={7} value={form.knockout_games} onChange={(e) => set("knockout_games", Math.max(1, intOrNull(e.target.value) ?? 1))} />
                  </Field>
                  <Field label="Sudden death (Armageddon)" htmlFor="t-arm" hint="One game; a draw goes to Black. Off: the higher seed goes through.">
                    <div className="flex h-8 items-center">
                      <Switch id="t-arm" checked={form.armageddon} onCheckedChange={(v) => set("armageddon", v)} />
                    </div>
                  </Field>
                </div>
              )}

              <Heading level="h3" className="mt-2">
                Prizes
              </Heading>
              <PrizeEditor value={form.prize_list ?? []} onChange={(v) => set("prize_list", v.length ? v : null)} />
              <CategoryPrizeEditor value={form.category_prizes ?? []} onChange={(v) => set("category_prizes", v.length ? v : null)} />

              <Heading level="h3" className="mt-2">
                Look and promotion
              </Heading>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_160px_160px]">
                <Field label="Tagline" htmlFor="t-tag" hint="Under the title on the tournament page.">
                  <Input id="t-tag" maxLength={160} value={form.tagline ?? ""} placeholder="e.g. Win a handmade walnut set" onChange={(e) => set("tagline", textOrNull(e.target.value))} />
                </Field>
                <Field label="Colour" htmlFor="t-acc" hint="Empty = the format's colour.">
                  <div className="flex items-center gap-2">
                    <input id="t-acc" type="color" className="h-8 w-10 cursor-pointer rounded border" value={form.accent ?? "#ffb300"} onChange={(e) => set("accent", e.target.value)} />
                    {form.accent && (
                      <Button size="small" variant="transparent" onClick={() => set("accent", null)}>
                        Reset
                      </Button>
                    )}
                  </div>
                </Field>
                <Field label="Feature it" htmlFor="t-feat" hint="The big banner on the tournaments page.">
                  <div className="flex h-8 items-center">
                    <Switch id="t-feat" checked={form.featured} onCheckedChange={(v) => set("featured", v)} />
                  </div>
                </Field>
              </div>
              <Field label="Live stream (YouTube or Twitch link)" htmlFor="t-stream" hint="Shown on the tournament page while it's on.">
                <Input id="t-stream" value={form.stream_url ?? ""} placeholder="https://www.youtube.com/watch?v=..." onChange={(e) => set("stream_url", textOrNull(e.target.value))} />
              </Field>

              <Heading level="h3" className="mt-2">
                Before and after
              </Heading>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Reminders" htmlFor="t-rem" hint="Email and WhatsApp 24 hours, 1 hour and 10 minutes before.">
                  <div className="flex h-8 items-center">
                    <Switch id="t-rem" checked={form.reminders} onCheckedChange={(v) => set("reminders", v)} />
                  </div>
                </Field>
                <Field label="Certificates" htmlFor="t-cert" hint="For everyone who plays, with a QR code to check them.">
                  <div className="flex h-8 items-center">
                    <Switch id="t-cert" checked={form.certificates} onCheckedChange={(v) => set("certificates", v)} />
                  </div>
                </Field>
                <Field label="Shop code for players" htmlFor="t-coupon" hint="A discount code (make it in Promotions) sent to everyone who played.">
                  <Input id="t-coupon" value={form.coupon_code ?? ""} placeholder="e.g. PLAYED10" onChange={(e) => set("coupon_code", textOrNull(e.target.value.toUpperCase()))} />
                </Field>
              </div>
            </>
          )}

          <ImageField label="Picture (tournament page and list)" recommended={{ width: 1600, height: 1000 }} value={form.image_url} onChange={(url) => set("image_url", url)} />

          <Field label="About this tournament" htmlFor="t-desc" hint={FORMATTING_HELP}>
            <Textarea id="t-desc" rows={8} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={form.mode === "online" ? "More about prizes (optional)" : "Prizes"} htmlFor="t-prizes" hint="One per line, e.g. 1st: Classic Staunton set.">
              <Textarea id="t-prizes" rows={4} value={form.prizes ?? ""} onChange={(e) => set("prizes", textOrNull(e.target.value))} />
            </Field>
            <Field label="Rules" htmlFor="t-rules">
              <Textarea id="t-rules" rows={4} value={form.rules ?? ""} onChange={(e) => set("rules", textOrNull(e.target.value))} />
            </Field>
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          {problems.length > 0 && (
            <Text size="small" className="mr-auto text-ui-fg-subtle">
              Still needs {problems.join(", ")}.
            </Text>
          )}
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button isLoading={save.isPending} disabled={problems.length > 0} onClick={() => save.mutate()}>
            {isNew ? "Create tournament" : "Save"}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

export const formatEventDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : ""
