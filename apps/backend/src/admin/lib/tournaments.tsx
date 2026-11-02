import { Button, Drawer, Input, Label, Select, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
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
}

export type Registration = {
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
  ["round_robin", "Round robin", "Everyone plays everyone. For small groups."],
  ["knockout", "Knockout", "Lose and you're out."],
]

type Form = Omit<Tournament, "id" | "format_label" | "registered">

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
        body: { ...form, entry_fee: form.mode === "online" ? 0 : form.entry_fee },
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
            <Field label="Web address" htmlFor="t-handle" hint={`the64squares.in/tournaments/${form.handle || "name"}`}>
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
            <Field label="Rounds" htmlFor="t-rounds" hint="Leave empty for Arena.">
              <Input id="t-rounds" type="number" min={1} value={form.rounds ?? ""} onChange={(e) => set("rounds", intOrNull(e.target.value))} />
            </Field>
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
            <Field
              label="Entry fee (₹)"
              htmlFor="t-fee"
              hint={
                form.mode === "online"
                  ? "Online events are free to enter. Under India's Online Gaming Act 2025, a paid online tournament with prizes needs e-sports registration first."
                  : "Collected at the venue. 0 = free."
              }
            >
              <Input
                id="t-fee"
                type="number"
                min={0}
                disabled={form.mode === "online"}
                value={form.mode === "online" ? 0 : form.entry_fee}
                onChange={(e) => set("entry_fee", intOrNull(e.target.value) ?? 0)}
              />
            </Field>
            <Field label="Lowest rating" htmlFor="t-rmin" hint="Empty = anyone.">
              <Input id="t-rmin" type="number" min={0} value={form.rating_min ?? ""} onChange={(e) => set("rating_min", intOrNull(e.target.value))} />
            </Field>
            <Field label="Highest rating" htmlFor="t-rmax" hint="Empty = anyone.">
              <Input id="t-rmax" type="number" min={0} value={form.rating_max ?? ""} onChange={(e) => set("rating_max", intOrNull(e.target.value))} />
            </Field>
          </div>

          <ImageField label="Picture (tournament page and list)" recommended={{ width: 1600, height: 1000 }} value={form.image_url} onChange={(url) => set("image_url", url)} />

          <Field label="About this tournament" htmlFor="t-desc" hint={FORMATTING_HELP}>
            <Textarea id="t-desc" rows={8} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Prizes" htmlFor="t-prizes" hint="One per line, e.g. 1st: Classic Staunton set.">
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
