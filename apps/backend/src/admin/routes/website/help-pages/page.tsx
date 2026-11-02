import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Lifebuoy } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  Switch,
  Table,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { FORMATTING_HELP } from "../../../lib/formatting"
import { sdk } from "../../../lib/sdk"
import { getPreviewLink, PageActions, useLeaveWarning } from "../../../lib/site-preview"
import type { SitePage } from "../../../lib/types"

type FormState = Omit<SitePage, "id" | "updated_at">

const EMPTY: FormState = { handle: "", title: "", body: "", is_published: true, rank: 0 }

const toHandle = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const PageDrawer = ({
  page,
  open,
  onClose,
}: {
  page: SitePage | null
  open: boolean
  onClose: () => void
}) => {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const isNew = !page
  const [form, setForm] = useState<FormState>(EMPTY)
  const [initial, setInitial] = useState("")

  useEffect(() => {
    if (open) {
      const src: Partial<FormState> = page ?? {}
      // Copy only the editable fields; the API rejects read-only ones like updated_at.
      const f = Object.fromEntries(
        (Object.keys(EMPTY) as (keyof FormState)[]).map((k) => [k, src[k] ?? EMPTY[k]])
      ) as FormState
      setForm(f)
      setInitial(JSON.stringify(f))
    }
  }, [open, page])
  const dirty = open && JSON.stringify(form) !== initial
  useLeaveWarning(dirty)

  const close = async () => {
    if (dirty && !(await prompt({ title: "Leave without saving?", description: "Your changes to this page will be lost.", confirmText: "Leave", cancelText: "Keep editing" }))) {
      return
    }
    onClose()
  }

  // Saves, then opens the page on the website in preview (hidden pages included).
  const preview = async () => {
    const tab = window.open("about:blank", "_blank")
    try {
      if (dirty || isNew) {
        await sdk.client.fetch(isNew ? "/admin/pages" : `/admin/pages/${page!.id}`, {
          method: "POST",
          body: { ...form, rank: Number(form.rank) || 0 },
        })
        qc.invalidateQueries({ queryKey: ["site-pages"] })
        setInitial(JSON.stringify(form))
      }
      const url = await getPreviewLink(`/help/${form.handle}`)
      if (!url) throw new Error("Preview switches on with the next website update.")
      if (tab) tab.location.href = url
      if (isNew) onClose()
    } catch (e) {
      tab?.close()
      toast.error("Couldn't open the preview", { description: (e as Error).message })
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch(isNew ? "/admin/pages" : `/admin/pages/${page!.id}`, {
        method: "POST",
        body: { ...form, rank: Number(form.rank) || 0 },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-pages"] })
      toast.success("Page saved")
      onClose()
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })

  const remove = useMutation({
    mutationFn: () => sdk.client.fetch(`/admin/pages/${page!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-pages"] })
      toast.success("Page deleted")
      onClose()
    },
  })

  return (
    <Drawer open={open} onOpenChange={(o) => !o && close()}>
      <Drawer.Content className="max-w-[720px]">
        <Drawer.Header>
          <Drawer.Title>{isNew ? "New page" : `Edit ${page?.title}`}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => {
                  const title = e.target.value
                  setForm((f) => ({ ...f, title, handle: isNew ? toHandle(title) : f.handle }))
                }}
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Web address</Label>
              <Input value={form.handle} onChange={(e) => set("handle", toHandle(e.target.value))} />
              <Text size="xsmall" className="text-ui-fg-subtle">
                stancil.in/help/{form.handle || "page"}
              </Text>
            </div>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label>Page text</Label>
            <Textarea rows={18} value={form.body} onChange={(e) => set("body", e.target.value)} />
            <Text size="xsmall" className="whitespace-pre-line text-ui-fg-subtle">
              {FORMATTING_HELP}
            </Text>
          </div>
          <div className="flex items-center gap-x-2">
            <Switch checked={form.is_published} onCheckedChange={(v) => set("is_published", v)} />
            <Label>Visible on the website</Label>
          </div>
          <Text size="xsmall" className="-mt-2 text-ui-fg-subtle">
            Working on a new page? Keep it hidden and use Preview until it's ready.
          </Text>
        </Drawer.Body>
        <Drawer.Footer>
          {!isNew && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                if (
                  await prompt({
                    title: `Delete ${page?.title}?`,
                    description: "Links to this page in the footer will stop working.",
                  })
                ) {
                  remove.mutate()
                }
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={!form.title || !form.handle} onClick={preview}>
            {dirty || isNew ? "Save & preview" : "Preview"}
          </Button>
          <Button
            isLoading={save.isPending}
            disabled={!form.title || !form.handle}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

const HelpPagesPage = () => {
  const [editing, setEditing] = useState<SitePage | null>(null)
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ["site-pages"],
    queryFn: () => sdk.client.fetch<{ pages: SitePage[] }>("/admin/pages"),
  })

  const openDrawer = (p: SitePage | null) => {
    setEditing(p)
    setOpen(true)
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h1">Help pages</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Delivery, returns, FAQs, privacy, terms and contact. The footer links to these.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <PageActions path="/help/faqs" />
          <Button size="small" onClick={() => openDrawer(null)}>
            Create
          </Button>
        </div>
      </div>
      {isLoading ? (
        <Text className="px-6 py-4">Loading...</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Page</Table.HeaderCell>
              <Table.HeaderCell>Web address</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data?.pages.map((p) => (
              <Table.Row key={p.id} className="cursor-pointer" onClick={() => openDrawer(p)}>
                <Table.Cell>{p.title}</Table.Cell>
                <Table.Cell>/help/{p.handle}</Table.Cell>
                <Table.Cell>
                  <Badge color={p.is_published ? "green" : "grey"} size="2xsmall">
                    {p.is_published ? "Visible" : "Hidden"}
                  </Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <PageDrawer page={editing} open={open} onClose={() => setOpen(false)} />
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Help pages",
  icon: Lifebuoy,
  rank: 4,
})

export default HelpPagesPage
