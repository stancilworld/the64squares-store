import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowDownMini, ArrowUpMini, Sparkles } from "@medusajs/icons"
import { Badge, Button, Container, FocusModal, Heading, Input, Label, Prompt, Switch, Table, Tabs, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { sdk } from "../../lib/sdk"
import { useStoreUrl } from "../../lib/site"
import {
  type Action,
  actionText,
  type Ad,
  type Asset,
  assetMeta,
  FocusPicker,
  LibraryPicker,
  LinkPicker,
  Preview,
  type Reward,
  Segmented,
  type ShowcaseData,
  STATE,
  Thumb,
  UploadButton,
  useShowcase,
  type Visual,
  when,
} from "../../lib/showcase"

// Advertisements: the Play screen's main window. Live adverts take turns there (in the order
// of this list); with none on, the window shows its default screen. An advert shows a 3D
// design or a picture, GIF or video from the library, with optional words, a countdown and
// one button: a link to any page, a coupon code, or a reward players claim.

type Draft = Omit<Ad, "id" | "rank" | "views" | "clicks" | "claims" | "state" | "created_at" | "placement"> & { id?: string }

const blank = (): Draft => ({
  name: "",
  status: "draft",
  starts_at: null,
  ends_at: null,
  audience: "everyone",
  visual: { kind: "scene", scene: "clash" },
  tag: null,
  headline: null,
  body: null,
  theme: "light",
  align: "left",
  position: "bottom",
  scrim: true,
  countdown_to: null,
  countdown_label: null,
  action: { kind: "none" },
  max_claims: null,
})

// <input type="datetime-local"> works in local time without a zone.
const toLocal = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null)

const errorText = (e: unknown) => (e as { message?: string }).message || "Couldn't save"

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-y-3 border-b border-ui-border-base py-6 last:border-0">
      <div>
        <Heading level="h3">{title}</Heading>
        {hint && (
          <Text size="small" className="text-ui-fg-subtle">
            {hint}
          </Text>
        )}
      </div>
      {children}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-y-1.5">
      <Label size="small" weight="plus">
        {label}
      </Label>
      {children}
      {hint && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {hint}
        </Text>
      )}
    </div>
  )
}

const POSITIONS: ["top" | "middle" | "bottom", "left" | "center" | "right"][] = (["top", "middle", "bottom"] as const).flatMap((p) => (["left", "center", "right"] as const).map((a) => [p, a] as ["top" | "middle" | "bottom", "left" | "center" | "right"]))

// ---------------------------------------------------------------- the editor

function Editor({ data, start, onClose, onSaved }: { data: ShowcaseData; start: Draft; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient()
  const [d, setD] = useState<Draft>(start)
  const [phone, setPhone] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const setAction = (a: Action) => set("action", a)
  const asset = d.visual.kind === "asset" ? data.assets.find((a) => a.id === (d.visual as { asset_id: string }).asset_id) : null
  const addAssets = (made: Asset[]) => qc.setQueryData<ShowcaseData>(["showcase"], (x) => (x ? { ...x, assets: [...made, ...x.assets] } : x))

  const problems: string[] = []
  if (!d.name.trim()) problems.push("Give the advert a name (only you see it).")
  if (d.visual.kind === "asset" && !asset) problems.push("Choose a picture or video.")
  if (d.action.kind === "link" && (!d.action.label.trim() || !d.action.url)) problems.push("The button needs words and a page.")
  if (d.action.kind === "coupon" && !d.action.code.trim()) problems.push("Enter the coupon code.")
  if (d.action.kind === "reward" && !d.action.label.trim()) problems.push("The button needs words.")
  if (d.starts_at && d.ends_at && new Date(d.ends_at) <= new Date(d.starts_at)) problems.push("The end must be after the start.")

  const save = useMutation({
    mutationFn: async (status: Draft["status"]) => {
      const { id, ...rest } = d
      const clean = (s: string | null) => (s && s.trim() ? s.trim() : null)
      const body = {
        ...rest,
        status,
        name: d.name.trim(),
        tag: clean(d.tag),
        headline: clean(d.headline),
        body: clean(d.body),
        countdown_label: d.countdown_to ? clean(d.countdown_label) : null,
        max_claims: d.action.kind === "reward" ? d.max_claims : null,
      }
      return id
        ? sdk.client.fetch(`/admin/showcase/ads/${id}`, { method: "POST", body })
        : sdk.client.fetch("/admin/showcase", { method: "POST", body: { ...body, placement: "play_hero" } })
    },
    onSuccess: (_r, status) => {
      toast.success(status === "live" ? "Saved. It's on the website now." : "Saved")
      qc.invalidateQueries({ queryKey: ["showcase"] })
      onSaved()
      onClose()
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const remove = useMutation({
    mutationFn: () => sdk.client.fetch(`/admin/showcase/ads/${d.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Advert deleted")
      qc.invalidateQueries({ queryKey: ["showcase"] })
      onClose()
    },
    onError: (e) => toast.error(errorText(e)),
  })

  const reward = d.action.kind === "reward" ? d.action.reward : null
  const setReward = (r: Reward) => d.action.kind === "reward" && setAction({ ...d.action, reward: r })

  return (
    <FocusModal open onOpenChange={(o) => !o && onClose()}>
      <FocusModal.Content>
        <FocusModal.Header>
          <div className="flex w-full items-center justify-end gap-2">
            <Text size="small" className="mr-auto truncate text-ui-fg-subtle">
              {problems[0] ?? (d.id ? "Editing advert" : "New advert")}
            </Text>
            {d.id && (
              <Button size="small" variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <Button size="small" variant="secondary" disabled={!!problems.length} isLoading={save.isPending && save.variables !== "live"} onClick={() => save.mutate(d.status === "live" ? "live" : d.status)}>
              {d.status === "live" ? "Save" : d.status === "paused" ? "Save (paused)" : "Save draft"}
            </Button>
            {d.status !== "live" && (
              <Button size="small" disabled={!!problems.length} isLoading={save.isPending && save.variables === "live"} onClick={() => save.mutate("live")}>
                {d.starts_at && new Date(d.starts_at) > new Date() ? "Schedule" : "Go live"}
              </Button>
            )}
          </div>
        </FocusModal.Header>
        <FocusModal.Body className="flex overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8">
            <div className="mx-auto max-w-[640px]">
              <Section title="About this advert">
                <Field label="Name" hint="Only you see this.">
                  <Input value={d.name} placeholder="e.g. Diwali Blitz Cup" onChange={(e) => set("name", e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Starts" hint="Empty: as soon as it's live.">
                    <Input type="datetime-local" value={toLocal(d.starts_at)} onChange={(e) => set("starts_at", fromLocal(e.target.value))} />
                  </Field>
                  <Field label="Ends" hint="Empty: until you pause it.">
                    <Input type="datetime-local" value={toLocal(d.ends_at)} onChange={(e) => set("ends_at", fromLocal(e.target.value))} />
                  </Field>
                </div>
                <Field label="Who sees it">
                  <Segmented
                    value={d.audience}
                    onChange={(v) => set("audience", v)}
                    options={[
                      ["everyone", "Everyone"],
                      ["guests", "Guests only"],
                      ["members", "Signed-in players"],
                    ]}
                  />
                </Field>
                {d.id && (
                  <Field label="Status">
                    <Segmented
                      value={d.status}
                      onChange={(v) => set("status", v)}
                      options={[
                        ["live", "Live"],
                        ["paused", "Paused"],
                        ["draft", "Draft"],
                      ]}
                    />
                  </Field>
                )}
              </Section>

              <Section title="Picture" hint="A 3D design or anything from the library. Everything you upload is kept there to use again.">
                <LibraryPicker data={data} value={d.visual} onChange={(v) => v && set("visual", v.kind === "asset" && d.visual.kind === "asset" ? { ...d.visual, asset_id: v.asset_id } : v)} onUploaded={addAssets} />
                {d.visual.kind === "asset" && asset && (
                  <div className="flex flex-col gap-y-4 rounded-lg bg-ui-bg-subtle p-4">
                    <Field label="Fit">
                      <Segmented
                        value={d.visual.fit ?? "cover"}
                        onChange={(v) => d.visual.kind === "asset" && set("visual", { ...d.visual, fit: v })}
                        options={[
                          ["cover", "Fill the window"],
                          ["contain", "Show it whole"],
                        ]}
                      />
                    </Field>
                    {(d.visual.fit ?? "cover") === "cover" && (
                      <Field label="Keep in view" hint="The window is wider on computers than on phones. Click the part that must always show.">
                        <FocusPicker asset={asset} focus={d.visual.focus ?? "50% 50%"} onChange={(f) => d.visual.kind === "asset" && set("visual", { ...d.visual, focus: f })} />
                      </Field>
                    )}
                    <Field label="Phone version (optional)" hint="A different picture or video for phones, e.g. with bigger words. Best at 1200×800.">
                      <LibraryPicker
                        data={data}
                        assetsOnly
                        allowNone
                        value={d.visual.mobile_asset_id ? { kind: "asset", asset_id: d.visual.mobile_asset_id } : null}
                        onChange={(v) => d.visual.kind === "asset" && set("visual", { ...d.visual, mobile_asset_id: v?.kind === "asset" ? v.asset_id : null })}
                        onUploaded={addAssets}
                      />
                    </Field>
                  </div>
                )}
              </Section>

              <Section title="Words" hint="All optional. Leave them out if the picture already says it.">
                <div className="grid grid-cols-[1fr_2fr] gap-4">
                  <Field label="Label">
                    <Input value={d.tag ?? ""} maxLength={40} placeholder="Diwali special" onChange={(e) => set("tag", e.target.value)} />
                  </Field>
                  <Field label="Headline">
                    <Input value={d.headline ?? ""} maxLength={90} placeholder="Diwali Blitz Cup: ₹10,000 in prizes" onChange={(e) => set("headline", e.target.value)} />
                  </Field>
                </div>
                <Field label="Text">
                  <Textarea value={d.body ?? ""} maxLength={200} rows={2} placeholder="Free entry with a Tournament Pass. Sunday 7 pm." onChange={(e) => set("body", e.target.value)} />
                </Field>
                <div className="flex flex-wrap items-start gap-8">
                  <Field label="Where">
                    <div className="grid w-[96px] grid-cols-3 gap-1">
                      {POSITIONS.map(([p, a]) => (
                        <button
                          key={`${p}-${a}`}
                          type="button"
                          aria-label={`${p} ${a}`}
                          onClick={() => setD((x) => ({ ...x, position: p, align: a }))}
                          className={`h-7 rounded border ${d.position === p && d.align === a ? "border-ui-fg-interactive bg-ui-fg-interactive" : "border-ui-border-base bg-ui-bg-subtle hover:bg-ui-bg-base-hover"}`}
                        />
                      ))}
                    </div>
                  </Field>
                  <Field label="Colour of the words">
                    <Segmented
                      value={d.theme}
                      onChange={(v) => set("theme", v)}
                      options={[
                        ["light", "White"],
                        ["dark", "Black"],
                      ]}
                    />
                  </Field>
                  <Field label="Shade behind">
                    <div className="flex h-8 items-center gap-2">
                      <Switch checked={d.scrim} onCheckedChange={(v) => set("scrim", v)} />
                      <Text size="small" className="text-ui-fg-subtle">
                        So the words read on any picture
                      </Text>
                    </div>
                  </Field>
                </div>
              </Section>

              <Section title="Countdown" hint="For a tournament start, a sale ending or a festival.">
                <div className="flex items-center gap-2">
                  <Switch checked={!!d.countdown_to} onCheckedChange={(v) => setD((x) => ({ ...x, countdown_to: v ? (x.starts_at ?? new Date(Date.now() + 86400_000).toISOString()) : null, countdown_label: v ? (x.countdown_label ?? "Starts in") : null }))} />
                  <Text size="small">Show a countdown</Text>
                </div>
                {d.countdown_to && (
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Counting down to">
                      <Input type="datetime-local" value={toLocal(d.countdown_to)} onChange={(e) => set("countdown_to", fromLocal(e.target.value))} />
                    </Field>
                    <Field label="Words before it">
                      <Input value={d.countdown_label ?? ""} maxLength={40} placeholder="Starts in" onChange={(e) => set("countdown_label", e.target.value)} />
                    </Field>
                  </div>
                )}
              </Section>

              <Section title="Button" hint="What players can do from the advert. The window itself doesn't link anywhere.">
                <Segmented
                  value={d.action.kind}
                  onChange={(k) =>
                    setAction(
                      k === "none"
                        ? { kind: "none" }
                        : k === "link"
                          ? { kind: "link", label: "Find out more", url: "" }
                          : k === "coupon"
                            ? { kind: "coupon", code: "", label: "Shop now", url: "/shop" }
                            : { kind: "reward", label: "Claim 2x XP", reward: { type: "xp_boost", factor: 2, hours: 24 } }
                    )
                  }
                  options={[
                    ["none", "None"],
                    ["link", "Link"],
                    ["coupon", "Coupon code"],
                    ["reward", "Reward"],
                  ]}
                />
                {d.action.kind === "link" && (
                  <>
                    <Field label="Words on the button">
                      <Input value={d.action.label} maxLength={40} onChange={(e) => d.action.kind === "link" && setAction({ ...d.action, label: e.target.value })} />
                    </Field>
                    <Field label="Goes to">
                      <LinkPicker value={d.action.url} onChange={(url) => d.action.kind === "link" && setAction({ ...d.action, url })} />
                    </Field>
                  </>
                )}
                {d.action.kind === "coupon" && (
                  <>
                    <Field label="Coupon code" hint="Create the discount itself under Promotions with the same code.">
                      <Input value={d.action.code} maxLength={40} placeholder="DIWALI10" onChange={(e) => d.action.kind === "coupon" && setAction({ ...d.action, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} />
                    </Field>
                    <div className="flex items-center gap-2">
                      <Switch checked={!!d.action.members_only} onCheckedChange={(v) => d.action.kind === "coupon" && setAction({ ...d.action, members_only: v })} />
                      <Text size="small">Only signed-in players see the code (they press a button to get it)</Text>
                    </div>
                    <div className="grid grid-cols-[1fr_2fr] gap-4">
                      <Field label="Second button (optional)">
                        <Input value={d.action.label ?? ""} maxLength={40} placeholder="Shop now" onChange={(e) => d.action.kind === "coupon" && setAction({ ...d.action, label: e.target.value })} />
                      </Field>
                      <Field label="Goes to">
                        <Input value={d.action.url ?? ""} placeholder="/shop" onChange={(e) => d.action.kind === "coupon" && setAction({ ...d.action, url: e.target.value.trim() || undefined })} />
                      </Field>
                    </div>
                  </>
                )}
                {d.action.kind === "reward" && reward && (
                  <>
                    <Field label="What they get">
                      <Segmented
                        value={reward.type}
                        onChange={(t) => setReward(t === "xp_boost" ? { type: "xp_boost", factor: 2, hours: 24 } : { type: "passes", count: 1 })}
                        options={[
                          ["xp_boost", "XP boost"],
                          ["passes", "Tournament Passes"],
                        ]}
                      />
                    </Field>
                    {reward.type === "xp_boost" ? (
                      <div className="flex flex-wrap gap-6">
                        <Field label="Boost">
                          <Segmented value={String(reward.factor)} onChange={(f) => setReward({ ...reward, factor: Number(f) })} options={[["1.5", "1.5x"], ["2", "2x"], ["3", "3x"]]} />
                        </Field>
                        <Field label="For">
                          <Segmented value={String(reward.hours)} onChange={(h) => setReward({ ...reward, hours: Number(h) })} options={[["6", "6 hours"], ["24", "1 day"], ["72", "3 days"], ["168", "1 week"]]} />
                        </Field>
                      </div>
                    ) : (
                      <Field label="How many passes">
                        <Segmented value={String(reward.count)} onChange={(n) => setReward({ type: "passes", count: Number(n) })} options={[["1", "1"], ["2", "2"], ["3", "3"], ["5", "5"]]} />
                      </Field>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Words on the button">
                        <Input value={d.action.label} maxLength={40} onChange={(e) => d.action.kind === "reward" && setAction({ ...d.action, label: e.target.value })} />
                      </Field>
                      <Field label="How many players can claim it" hint="Empty: no limit. Each player can claim once.">
                        <Input type="number" min={1} value={d.max_claims ?? ""} placeholder="No limit" onChange={(e) => set("max_claims", e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null)} />
                      </Field>
                    </div>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Players sign in to claim. XP boosts multiply the XP from every game while they're on; passes go straight to their account.
                    </Text>
                  </>
                )}
              </Section>
            </div>
          </div>
          <aside className="flex w-[520px] shrink-0 flex-col gap-y-4 overflow-y-auto border-l border-ui-border-base bg-ui-bg-subtle p-6">
            <div className="flex items-center justify-between">
              <Heading level="h3">Preview</Heading>
              <Segmented
                value={phone ? "phone" : "computer"}
                onChange={(v) => setPhone(v === "phone")}
                options={[
                  ["computer", "Computer"],
                  ["phone", "Phone"],
                ]}
              />
            </div>
            <div className="flex justify-center">
              <Preview ad={d} data={data} phone={phone} />
            </div>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {d.visual.kind === "scene" ? "3D designs move on the website: they turn slowly and follow the pointer. " : ""}
              On the website the window sits beside the Play online button (above it on phones). Several live adverts take turns every 8 seconds.
            </Text>
            <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
              <Text size="small" weight="plus">
                Summary
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {d.starts_at ? `From ${when(d.starts_at)}` : "From when it goes live"}
                {d.ends_at ? ` to ${when(d.ends_at)}` : ", no end date"}. {d.audience === "everyone" ? "Everyone" : d.audience === "guests" ? "Guests only" : "Signed-in players only"}. {actionText(d.action)}.
              </Text>
            </div>
          </aside>
        </FocusModal.Body>
      </FocusModal.Content>
      <Prompt open={confirmDelete} onOpenChange={setConfirmDelete}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Delete "{d.name}"?</Prompt.Title>
            <Prompt.Description>It comes off the website straight away. Its pictures stay in the library.</Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={() => remove.mutate()}>Delete</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </FocusModal>
  )
}

// ---------------------------------------------------------------- the list

function AdsTab({ data, onEdit }: { data: ShowcaseData; onEdit: (d: Draft) => void }) {
  const qc = useQueryClient()
  const storeUrl = useStoreUrl()
  const order = useMutation({
    mutationFn: (ids: string[]) => sdk.client.fetch("/admin/showcase/order", { method: "POST", body: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["showcase"] }),
    onError: (e) => toast.error(errorText(e)),
  })
  const status = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => sdk.client.fetch(`/admin/showcase/ads/${id}`, { method: "POST", body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["showcase"] }),
    onError: (e) => toast.error(errorText(e)),
  })
  const move = (i: number, by: number) => {
    const ids = data.ads.map((a) => a.id)
    const j = i + by
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    order.mutate(ids)
  }
  const live = data.ads.filter((a) => a.state === "live").length

  if (!data.ads.length)
    return (
      <div className="flex flex-col items-center gap-y-3 px-6 py-16 text-center">
        <Heading level="h2">No adverts yet</Heading>
        <Text className="max-w-[460px] text-ui-fg-subtle">Promote a tournament, a festival offer, a coupon or 2x XP for a day. While there's none, the window shows its default screen.</Text>
        <Button onClick={() => onEdit(blank())}>New advert</Button>
      </div>
    )
  return (
    <>
      <div className="px-6 py-3">
        <Text size="small" className="text-ui-fg-subtle">
          {live ? `${live} live now${live > 1 ? ", taking turns in this order" : ""}.` : "None live now: the window shows its default screen."}
        </Text>
      </div>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell className="w-[52px]" />
            <Table.HeaderCell>Advert</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell>When</Table.HeaderCell>
            <Table.HeaderCell>Button</Table.HeaderCell>
            <Table.HeaderCell className="text-right">Seen · used · claimed</Table.HeaderCell>
            <Table.HeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data.ads.map((a, i) => (
            <Table.Row key={a.id} className="cursor-pointer" onClick={() => onEdit(a)}>
              <Table.Cell onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col">
                  <button type="button" aria-label="Move up" disabled={!i} onClick={() => move(i, -1)} className="text-ui-fg-muted hover:text-ui-fg-base disabled:opacity-30">
                    <ArrowUpMini />
                  </button>
                  <button type="button" aria-label="Move down" disabled={i === data.ads.length - 1} onClick={() => move(i, 1)} className="text-ui-fg-muted hover:text-ui-fg-base disabled:opacity-30">
                    <ArrowDownMini />
                  </button>
                </div>
              </Table.Cell>
              <Table.Cell>
                <div className="flex items-center gap-3 py-2">
                  <Thumb visual={a.visual} data={data} storeUrl={storeUrl} className="h-[45px] w-[72px] shrink-0 rounded" />
                  <div className="min-w-0">
                    <Text size="small" weight="plus" className="truncate">
                      {a.name}
                    </Text>
                    <Text size="xsmall" className="truncate text-ui-fg-subtle">
                      {a.headline || (a.visual.kind === "scene" ? "3D design" : "Picture only")}
                      {a.audience !== "everyone" ? ` · ${a.audience === "guests" ? "Guests" : "Signed-in players"}` : ""}
                    </Text>
                  </div>
                </div>
              </Table.Cell>
              <Table.Cell>
                <Badge size="2xsmall" color={STATE[a.state].color}>
                  {STATE[a.state].label}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {a.starts_at || a.ends_at ? `${when(a.starts_at) ?? "Now"} → ${when(a.ends_at) ?? "no end"}` : "No dates"}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Text size="xsmall" className="max-w-[220px] truncate text-ui-fg-subtle">
                  {actionText(a.action)}
                </Text>
              </Table.Cell>
              <Table.Cell className="text-right">
                <Text size="xsmall" className="tabular-nums">
                  {a.views} · {a.clicks} · {a.action.kind === "reward" || a.action.kind === "coupon" ? `${a.claims}${a.max_claims ? `/${a.max_claims}` : ""}` : "–"}
                </Text>
              </Table.Cell>
              <Table.Cell onClick={(e) => e.stopPropagation()} className="text-right">
                {a.status === "live" ? (
                  <Button size="small" variant="transparent" onClick={() => status.mutate({ id: a.id, status: "paused" })}>
                    Pause
                  </Button>
                ) : a.state !== "ended" ? (
                  <Button size="small" variant="transparent" onClick={() => status.mutate({ id: a.id, status: "live" })}>
                    {a.starts_at && new Date(a.starts_at) > new Date() ? "Schedule" : "Go live"}
                  </Button>
                ) : null}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </>
  )
}

// ---------------------------------------------------------------- the library

function LibraryTab({ data }: { data: ShowcaseData }) {
  const qc = useQueryClient()
  const storeUrl = useStoreUrl()
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ["showcase"] })
  const remove = useMutation({
    mutationFn: (id: string) => sdk.client.fetch(`/admin/showcase/assets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Removed from the library")
      refresh()
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const rename = useMutation({
    mutationFn: (r: { id: string; name: string }) => sdk.client.fetch(`/admin/showcase/assets/${r.id}`, { method: "POST", body: { name: r.name } }),
    onSuccess: () => {
      setRenaming(null)
      refresh()
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const used = (u: string[]) => (u.length ? `Used by ${u.join(", ")}` : "Not used")
  return (
    <div className="flex flex-col gap-y-8 px-6 py-6">
      <div className="flex flex-col gap-y-3">
        <div>
          <Heading level="h3">3D designs</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Live designs drawn by the website. New ones are added here as they're made.
          </Text>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.scenes.map((s) => (
            <div key={s.key} className="overflow-hidden rounded-lg border border-ui-border-base">
              <div className="relative aspect-[16/9] bg-ui-bg-component">
                {storeUrl && <img src={storeUrl + s.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                <span className="absolute left-2 top-2">
                  <Badge size="2xsmall" color="purple">
                    3D
                  </Badge>
                </span>
              </div>
              <div className="p-3">
                <Text size="small" weight="plus">
                  {s.name}
                </Text>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {s.description}
                </Text>
                <Text size="xsmall" className="mt-1 text-ui-fg-muted">
                  {used(s.used_by)}
                </Text>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Heading level="h3">Uploaded</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Pictures (JPG, PNG, WebP, AVIF, SVG), GIFs and videos (MP4, WebM, MOV). Videos play muted and on repeat. Best at 1600×1000 or larger.
            </Text>
          </div>
          <UploadButton onDone={refresh} />
        </div>
        {!data.assets.length ? (
          <Text size="small" className="rounded-lg border border-dashed border-ui-border-strong p-8 text-center text-ui-fg-subtle">
            Nothing uploaded yet. Upload festival art, tournament posters or short videos to use in adverts.
          </Text>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {data.assets.map((a) => (
              <div key={a.id} className="overflow-hidden rounded-lg border border-ui-border-base">
                <div className="relative aspect-[16/10] bg-ui-bg-component">
                  {a.kind === "video" ? (
                    <video src={a.url} poster={a.poster_url ?? undefined} muted loop playsInline onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => e.currentTarget.pause()} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <img src={a.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex flex-col gap-y-1 p-3">
                  {renaming?.id === a.id ? (
                    <form
                      className="flex gap-1"
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (renaming.name.trim()) rename.mutate({ id: a.id, name: renaming.name.trim() })
                      }}
                    >
                      <Input size="small" autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: a.id, name: e.target.value })} />
                      <Button size="small" type="submit" isLoading={rename.isPending}>
                        Save
                      </Button>
                    </form>
                  ) : (
                    <Text size="small" weight="plus" className="truncate" title={a.name}>
                      {a.name}
                    </Text>
                  )}
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {assetMeta(a)}
                  </Text>
                  <Text size="xsmall" className="truncate text-ui-fg-muted">
                    {used(a.used_by)}
                  </Text>
                  <div className="mt-1 flex gap-1">
                    <Button size="small" variant="transparent" onClick={() => setRenaming({ id: a.id, name: a.name })}>
                      Rename
                    </Button>
                    <Button size="small" variant="transparent" disabled={!!a.used_by.length} isLoading={remove.isPending && remove.variables === a.id} onClick={() => remove.mutate(a.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the default screen

function DefaultTab({ data }: { data: ShowcaseData }) {
  const qc = useQueryClient()
  const [v, setV] = useState<Visual>(data.default)
  const save = useMutation({
    mutationFn: () => sdk.client.fetch("/admin/showcase/default", { method: "POST", body: { visual: v } }),
    onSuccess: () => {
      toast.success("Default screen saved")
      qc.invalidateQueries({ queryKey: ["showcase"] })
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const changed = JSON.stringify(v) !== JSON.stringify(data.default)
  return (
    <div className="grid gap-8 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex flex-col gap-y-4">
        <div>
          <Heading level="h3">When no advert is on</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            The window shows this: one of the 3D designs or anything from the library. It has no words or button.
          </Text>
        </div>
        <LibraryPicker
          data={data}
          value={v}
          onChange={(x) => x && setV(x)}
          onUploaded={(made) => qc.setQueryData<ShowcaseData>(["showcase"], (x) => (x ? { ...x, assets: [...made, ...x.assets] } : x))}
        />
        <div>
          <Button disabled={!changed} isLoading={save.isPending} onClick={() => save.mutate()}>
            Save default screen
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-y-3">
        <Text size="small" weight="plus">
          Preview
        </Text>
        <Preview ad={{ visual: v }} data={data} phone={false} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the page

const AdvertisementsPage = () => {
  const { data, isLoading } = useShowcase()
  const [tab, setTab] = useState("ads")
  const [editing, setEditing] = useState<Draft | null>(null)
  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h1">Advertisements</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            The Play screen's main window. Promote tournaments, festivals, coupons and rewards; with no advert on, it shows the default screen.
          </Text>
        </div>
        <Button size="small" onClick={() => setEditing(blank())} disabled={!data}>
          New advert
        </Button>
      </div>
      {isLoading || !data ? (
        <Text className="px-6 py-8 text-ui-fg-subtle">Loading…</Text>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <Tabs.List className="border-b px-6">
            <Tabs.Trigger value="ads">Adverts ({data.ads.length})</Tabs.Trigger>
            <Tabs.Trigger value="library">Library ({data.scenes.length + data.assets.length})</Tabs.Trigger>
            <Tabs.Trigger value="default">Default screen</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="ads">
            <AdsTab data={data} onEdit={setEditing} />
          </Tabs.Content>
          <Tabs.Content value="library">
            <LibraryTab data={data} />
          </Tabs.Content>
          <Tabs.Content value="default">
            <DefaultTab key={JSON.stringify(data.default)} data={data} />
          </Tabs.Content>
        </Tabs>
      )}
      {editing && data && <Editor data={data} start={editing} onClose={() => setEditing(null)} onSaved={() => setTab("ads")} />}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Advertisements", icon: Sparkles, rank: 4 })

export default AdvertisementsPage
