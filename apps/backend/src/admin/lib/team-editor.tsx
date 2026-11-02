import {
  Badge,
  Button,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  Switch,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { type FaceBox, MASK_SIZE, measureFace } from "./face-measure"
import { ImageField } from "./image-field"
import { sdk } from "./sdk"

export type TeamMember = {
  id: string
  name: string
  role: string | null
  image_url: string | null
  color_image_url: string | null
  canvas_width: number | null
  canvas_height: number | null
  box: FaceBox | null
  mask: string | null
  rank: number
  is_active: boolean
}

type Form = Omit<TeamMember, "id">

const EMPTY: Form = {
  name: "",
  role: "",
  image_url: null,
  color_image_url: null,
  canvas_width: null,
  canvas_height: null,
  box: null,
  mask: null,
  rank: 0,
  is_active: true,
}

const PICTURE_SIZE = {
  width: 2880,
  height: 1490,
  note:
    "Export every face from the same group picture: same canvas size for everyone, see-through background, the person in their place",
}

const QUERY = ["team-members"]

// The face under a point (canvas pixels), using each face's measured outline.
export const faceAt = (members: TeamMember[], x: number, y: number): TeamMember | null => {
  let found: TeamMember | null = null
  let foundArea = Infinity
  for (const m of members) {
    const b = m.box
    if (!b || x < b.x || y < b.y || x >= b.x + b.width || y >= b.y + b.height) {
      continue
    }
    if (m.mask) {
      const cx = Math.min(MASK_SIZE - 1, Math.floor(((x - b.x) / b.width) * MASK_SIZE))
      const cy = Math.min(MASK_SIZE - 1, Math.floor(((y - b.y) / b.height) * MASK_SIZE))
      if (m.mask[cy * MASK_SIZE + cx] !== "1") {
        continue
      }
    }
    // Where outlines overlap, the smaller face wins (it is usually the one in front).
    const area = b.width * b.height
    if (area < foundArea) {
      found = m
      foundArea = area
    }
  }
  return found
}

const MemberDrawer = ({
  member,
  open,
  onClose,
  nextRank,
  canvas,
}: {
  member: TeamMember | null
  open: boolean
  onClose: () => void
  nextRank: number
  canvas: { width: number; height: number } | null
}) => {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const isNew = !member
  const [form, setForm] = useState<Form>(EMPTY)
  const [warning, setWarning] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const src: Partial<Form> = member ?? { rank: nextRank }
      setForm(
        Object.fromEntries(
          (Object.keys(EMPTY) as (keyof Form)[]).map((k) => [k, src[k] ?? EMPTY[k]])
        ) as Form
      )
      setWarning(null)
    }
  }, [open, member, nextRank])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  // Measure the black & white picture: where the face is on the canvas and its outline.
  const measure = async (file: File) => {
    try {
      const m = await measureFace(file)
      setForm((f) => ({
        ...f,
        canvas_width: m.canvas_width,
        canvas_height: m.canvas_height,
        box: m.box,
        mask: m.mask,
      }))
      const notes: string[] = []
      if (!m.transparent) {
        notes.push(
          "This picture has no see-through background, so the whole picture reacts to the mouse. Export it as a transparent PNG or WebP."
        )
      }
      if (canvas && (canvas.width !== m.canvas_width || canvas.height !== m.canvas_height)) {
        notes.push(
          `This picture is ${m.canvas_width} × ${m.canvas_height} px but the others are ${canvas.width} × ${canvas.height} px. Export every face from the same group canvas so they line up.`
        )
      }
      setWarning(notes.join(" ") || null)
    } catch (e) {
      setWarning(`Could not read the picture: ${(e as Error).message}`)
    }
  }

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch(isNew ? "/admin/team-members" : `/admin/team-members/${member!.id}`, {
        method: "POST",
        body: { ...form, role: form.role || null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY })
      toast.success("Saved. It shows on the website within a minute.")
      onClose()
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })

  const remove = useMutation({
    mutationFn: () => sdk.client.fetch(`/admin/team-members/${member!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY })
      toast.success("Team member removed")
      onClose()
    },
  })

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content className="max-w-[640px]">
        <Drawer.Header>
          <Drawer.Title>{isNew ? "Add a team member" : `Edit ${member!.name}`}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-y-2">
              <Label>Name</Label>
              <Input value={form.name} placeholder="Ritu" onChange={(e) => set("name", e.target.value)} />
              <Text size="xsmall" className="text-ui-fg-subtle">
                Shown in the heading font, as typed.
              </Text>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Designation</Label>
              <Input
                value={form.role ?? ""}
                placeholder="The Graphic Designer"
                onChange={(e) => set("role", e.target.value)}
              />
            </div>
          </div>
          <ImageField
            label="Black & white picture (shown first)"
            allowVideo={false}
            recommended={PICTURE_SIZE}
            value={form.image_url}
            onChange={(url) => {
              set("image_url", url)
              if (!url) {
                setForm((f) => ({ ...f, box: null, mask: null }))
              }
            }}
            onFile={(file) => measure(file)}
          />
          {warning && (
            <Text size="small" className="text-ui-tag-orange-text">
              {warning}
            </Text>
          )}
          {form.image_url && !form.box && (
            <Text size="small" className="text-ui-tag-orange-text">
              Upload the black & white picture again so the face can be measured.
            </Text>
          )}
          <ImageField
            label="Coloured picture (shown on hover)"
            allowVideo={false}
            recommended={{ ...PICTURE_SIZE, note: "Same canvas and position as the black & white picture" }}
            value={form.color_image_url}
            onChange={(url) => set("color_image_url", url)}
          />
          <div className="flex items-center gap-x-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
            <Label>Show on website</Label>
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          {!isNew && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                if (await prompt({ title: `Remove ${member!.name}?`, description: "Their face is removed from the website." })) {
                  remove.mutate()
                }
              }}
            >
              Remove
            </Button>
          )}
          <Drawer.Close asChild>
            <Button variant="secondary">Cancel</Button>
          </Drawer.Close>
          <Button
            isLoading={save.isPending}
            disabled={!form.name || !form.image_url || !form.box}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

// What the website shows: every black & white face stacked; the one under the mouse turns
// colour and shows its name tag.
const Preview = ({ members }: { members: TeamMember[] }) => {
  const stage = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<string | null>(null)
  const first = members.find((m) => m.canvas_width && m.canvas_height)
  if (!first) {
    return null
  }
  const W = first.canvas_width!
  const H = first.canvas_height!
  const current = members.find((m) => m.id === active)

  return (
    <div
      ref={stage}
      className="relative mx-auto w-full max-w-[720px] select-none"
      style={{ aspectRatio: `${W} / ${H}` }}
      onMouseMove={(e) => {
        const r = stage.current!.getBoundingClientRect()
        const hit = faceAt(members, ((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H)
        setActive(hit?.id ?? null)
      }}
      onMouseLeave={() => setActive(null)}
    >
      {members.map((m) => (
        <div key={m.id} className="pointer-events-none absolute inset-0">
          {m.image_url && <img src={m.image_url} alt="" className="absolute inset-0 h-full w-full" />}
          {m.color_image_url && (
            <img
              src={m.color_image_url}
              alt=""
              className="absolute inset-0 h-full w-full transition-opacity duration-300"
              style={{ opacity: active === m.id ? 1 : 0 }}
            />
          )}
        </div>
      ))}
      {current?.box && (
        <div
          className="pointer-events-none absolute -translate-y-full rounded-lg bg-black px-3 py-2 text-white"
          style={{
            left: `${((current.box.x + current.box.width * 0.6) / W) * 100}%`,
            top: `${((current.box.y + current.box.height * 0.14) / H) * 100}%`,
          }}
        >
          <span className="text-base font-medium">{current.name}</span>
          {current.role && <span className="ml-2 text-xs text-white/80">{current.role}</span>}
        </div>
      )}
    </div>
  )
}

export const TeamEditor = () => {
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: QUERY,
    queryFn: () => sdk.client.fetch<{ team_members: TeamMember[] }>("/admin/team-members"),
  })
  const members = data?.team_members ?? []
  const shown = members.filter((m) => m.is_active && m.image_url)
  // Canvas size of the other faces, to warn when a new picture does not match.
  const canvas = useMemo(() => {
    const m = members.find((x) => x.id !== editing?.id && x.canvas_width && x.canvas_height)
    return m ? { width: m.canvas_width!, height: m.canvas_height! } : null
  }, [members, editing])

  const openDrawer = (m: TeamMember | null) => {
    setEditing(m)
    setOpen(true)
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-start justify-between gap-x-4 px-6 py-4">
        <div>
          <Heading level="h2">Team faces</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            The faces under "Meet our team". Each starts in black & white; the one under the mouse (or tapped on a
            phone) turns colour and shows the name and designation. When there are no faces, the wide team photo
            above is shown instead.
          </Text>
        </div>
        <Button size="small" variant="secondary" className="shrink-0" onClick={() => openDrawer(null)}>
          Add member
        </Button>
      </div>
      {isLoading ? (
        <Text className="px-6 py-4">Loading...</Text>
      ) : !members.length ? (
        <Text className="px-6 py-4 text-ui-fg-subtle">No team faces yet.</Text>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 px-6 py-4 sm:grid-cols-3 lg:grid-cols-4">
            {members.map((m) => {
              const b = m.box
              const W = m.canvas_width ?? 1
              const H = m.canvas_height ?? 1
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => openDrawer(m)}
                  className="flex flex-col items-center gap-y-2 rounded-lg border p-3 text-left hover:bg-ui-bg-base-hover"
                >
                  {/* Show just the face, cropped from the group canvas. */}
                  <div className="relative h-24 w-24 overflow-hidden">
                    {m.image_url && b ? (
                      <img
                        src={m.image_url}
                        alt=""
                        className="absolute max-w-none"
                        style={{
                          width: `${(W / Math.max(b.width, b.height)) * 100}%`,
                          left: `${(-b.x / Math.max(b.width, b.height)) * 100}%`,
                          top: `${(-b.y / Math.max(b.width, b.height)) * 100}%`,
                          height: "auto",
                          aspectRatio: `${W} / ${H}`,
                        }}
                      />
                    ) : (
                      <div className="h-full w-full rounded bg-ui-bg-component" />
                    )}
                  </div>
                  <div className="text-center">
                    <Text size="small" weight="plus">
                      {m.name}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {m.role || "No designation"}
                    </Text>
                    <div className="mt-1 flex flex-wrap justify-center gap-1">
                      {!m.is_active && <Badge size="2xsmall">Hidden</Badge>}
                      {!m.color_image_url && (
                        <Badge size="2xsmall" color="orange">
                          No colour picture
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          {shown.length > 0 && (
            <div className="px-6 py-4">
              <Text size="small" weight="plus" className="mb-2">
                Preview (move the mouse over the faces)
              </Text>
              <Preview members={shown} />
            </div>
          )}
        </>
      )}
      <MemberDrawer
        member={editing}
        open={open}
        onClose={() => setOpen(false)}
        nextRank={members.length}
        canvas={canvas}
      />
    </Container>
  )
}
