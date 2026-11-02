import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Newspaper } from "@medusajs/icons"
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
import { formatWhen, fromLocalInput, isFuture, toLocalInput } from "../../../lib/dates"
import { FORMATTING_HELP } from "../../../lib/formatting"
import { ImageField, isVideoUrl } from "../../../lib/image-field"
import { sdk } from "../../../lib/sdk"
import { getPreviewLink, PageActions, useLeaveWarning } from "../../../lib/site-preview"
import type { Post } from "../../../lib/types"

type FormState = Omit<Post, "id" | "created_at">

const EMPTY: FormState = {
  title: "",
  handle: "",
  excerpt: null,
  body: "",
  cover_url: null,
  thumbnail_url: null,
  author: "Team Stancil",
  status: "draft",
  published_at: null,
}

const toHandle = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not published"

const PostDrawer = ({
  post,
  open,
  onClose,
}: {
  post: Post | null
  open: boolean
  onClose: () => void
}) => {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const isNew = !post
  const [form, setForm] = useState<FormState>(EMPTY)
  const [initial, setInitial] = useState("")

  useEffect(() => {
    if (open) {
      const src: Partial<FormState> = post ?? {}
      // Copy only the editable fields; the API rejects read-only ones like updated_at.
      const f = Object.fromEntries(
        (Object.keys(EMPTY) as (keyof FormState)[]).map((k) => [k, src[k] ?? EMPTY[k]])
      ) as FormState
      setForm(f)
      setInitial(JSON.stringify(f))
    }
  }, [open, post])
  const dirty = open && JSON.stringify(form) !== initial
  useLeaveWarning(dirty)
  const scheduled = form.status === "published" && isFuture(form.published_at)

  const close = async () => {
    if (dirty && !(await prompt({ title: "Leave without saving?", description: "Your changes to this post will be lost.", confirmText: "Leave", cancelText: "Keep editing" }))) {
      return
    }
    onClose()
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch(isNew ? "/admin/posts" : `/admin/posts/${post!.id}`, {
        method: "POST",
        body: form,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] })
      toast.success(
        scheduled
          ? `Scheduled. It appears on the website ${formatWhen(form.published_at)}.`
          : form.status === "published"
            ? "Post saved and live"
            : "Draft saved"
      )
      onClose()
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })

  // Saves without closing, then shows the post on the website in preview (drafts included).
  const preview = async () => {
    const tab = window.open("about:blank", "_blank")
    try {
      if (dirty || isNew) {
        await sdk.client.fetch(isNew ? "/admin/posts" : `/admin/posts/${post!.id}`, { method: "POST", body: form })
        qc.invalidateQueries({ queryKey: ["posts"] })
        setInitial(JSON.stringify(form))
      }
      const url = await getPreviewLink(`/blog/${form.handle}`)
      if (!url) throw new Error("Preview switches on with the next website update.")
      if (tab) tab.location.href = url
      if (isNew) onClose()
    } catch (e) {
      tab?.close()
      toast.error("Couldn't open the preview", { description: (e as Error).message })
    }
  }

  const remove = useMutation({
    mutationFn: () => sdk.client.fetch(`/admin/posts/${post!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] })
      toast.success("Post deleted")
      onClose()
    },
  })

  return (
    <Drawer open={open} onOpenChange={(o) => !o && close()}>
      <Drawer.Content className="max-w-[720px]">
        <Drawer.Header>
          <Drawer.Title>{isNew ? "New post" : "Edit post"}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
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
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-y-2">
              <Label>Web address</Label>
              <Input value={form.handle} onChange={(e) => set("handle", toHandle(e.target.value))} />
              <Text size="xsmall" className="text-ui-fg-subtle">
                stancil.in/blog/{form.handle || "title"}
              </Text>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Author</Label>
              <Input value={form.author} onChange={(e) => set("author", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="post-date">Publish date &amp; time</Label>
              <Input
                id="post-date"
                type="datetime-local"
                value={toLocalInput(form.published_at)}
                onChange={(e) => set("published_at", fromLocalInput(e.target.value))}
              />
              <Text size="xsmall" className={scheduled ? "text-ui-tag-blue-text" : "text-ui-fg-subtle"}>
                {scheduled
                  ? `Scheduled: shoppers see it from ${formatWhen(form.published_at)}.`
                  : "Shown on the post. Empty = when you publish. Pick a future time to schedule it."}
              </Text>
            </div>
            <div className="flex items-center gap-x-2 pt-6">
              <Switch
                checked={form.status === "published"}
                onCheckedChange={(v) => set("status", v ? "published" : "draft")}
              />
              <Label>Published (visible on the website)</Label>
            </div>
          </div>
          <ImageField
            label="Small picture (blog list)"
            recommended={{ width: 600, height: 600 }}
            value={form.thumbnail_url}
            onChange={(url) => set("thumbnail_url", url)}
          />
          <ImageField
            label="Wide picture (top of the post)"
            recommended={{ width: 2880, height: 1146 }}
            value={form.cover_url}
            onChange={(url) => set("cover_url", url)}
          />
          <div className="flex flex-col gap-y-2">
            <Label>Post text</Label>
            <Textarea rows={16} value={form.body} onChange={(e) => set("body", e.target.value)} />
            <Text size="xsmall" className="whitespace-pre-line text-ui-fg-subtle">
              {FORMATTING_HELP}
            </Text>
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          {!isNew && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                if (await prompt({ title: "Delete this post?", description: "It is removed from the website." })) {
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
            {scheduled ? "Schedule" : "Save"}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

const BlogPage = () => {
  const [editing, setEditing] = useState<Post | null>(null)
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: () => sdk.client.fetch<{ posts: Post[] }>("/admin/posts"),
  })

  const openDrawer = (p: Post | null) => {
    setEditing(p)
    setOpen(true)
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h1">Blog</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Letters from Stancil. Newest posts show first on the website.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <PageActions path="/blog" />
          <Button size="small" onClick={() => openDrawer(null)}>
            Write a post
          </Button>
        </div>
      </div>
      {isLoading ? (
        <Text className="px-6 py-4">Loading...</Text>
      ) : !data?.posts.length ? (
        <Text className="px-6 py-4 text-ui-fg-subtle">No posts yet.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Post</Table.HeaderCell>
              <Table.HeaderCell>Author</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Date</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.posts.map((p) => (
              <Table.Row key={p.id} className="cursor-pointer" onClick={() => openDrawer(p)}>
                <Table.Cell>
                  <div className="flex items-center gap-x-3">
                    {p.thumbnail_url && isVideoUrl(p.thumbnail_url) ? (
                      <video src={p.thumbnail_url} muted className="h-8 w-8 rounded object-cover" />
                    ) : p.thumbnail_url ? (
                      <img src={p.thumbnail_url} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-ui-bg-component" />
                    )}
                    <span className="line-clamp-1">{p.title}</span>
                  </div>
                </Table.Cell>
                <Table.Cell>{p.author}</Table.Cell>
                <Table.Cell>
                  {p.status === "published" && isFuture(p.published_at) ? (
                    <Badge color="blue" size="2xsmall">
                      Scheduled
                    </Badge>
                  ) : (
                    <Badge color={p.status === "published" ? "green" : "grey"} size="2xsmall">
                      {p.status === "published" ? "Published" : "Draft"}
                    </Badge>
                  )}
                </Table.Cell>
                <Table.Cell>{formatDate(p.published_at)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <PostDrawer post={editing} open={open} onClose={() => setOpen(false)} />
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Blog",
  icon: Newspaper,
  rank: 3,
})

export default BlogPage
