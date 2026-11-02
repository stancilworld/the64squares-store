import { defineRouteConfig } from "@medusajs/admin-sdk"
import { FaceSmile } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  Select,
  Table,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { ImageField, isVideoUrl } from "../../lib/image-field"
import { sdk } from "../../lib/sdk"
import type { Character } from "../../lib/types"

type FormState = Omit<Character, "id" | "product_count">

const EMPTY: FormState = {
  name: "",
  handle: "",
  greeting: "Hi! I am",
  tagline: "",
  story: "",
  image_url: null,
  banner_url: null,
  collection_title: "",
  status: "coming_soon",
  coming_soon_text: "You will find me soon...",
  rank: 0,
}

const toHandle = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const CharacterDrawer = ({
  character,
  open,
  onClose,
}: {
  character: Character | null
  open: boolean
  onClose: () => void
}) => {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const [form, setForm] = useState<FormState>(EMPTY)
  const isNew = !character

  useEffect(() => {
    if (open) {
      const src: Partial<FormState> = character ?? {}
      // Copy only the editable fields; the API rejects read-only ones like updated_at.
      setForm(
        Object.fromEntries(
          (Object.keys(EMPTY) as (keyof FormState)[]).map((k) => [k, src[k] ?? EMPTY[k]])
        ) as FormState
      )
    }
  }, [open, character])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch(
        isNew ? "/admin/characters" : `/admin/characters/${character!.id}`,
        { method: "POST", body: { ...form, rank: Number(form.rank) || 0 } }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["characters"] })
      toast.success(isNew ? "Character created" : "Character saved")
      onClose()
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })

  const remove = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/characters/${character!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["characters"] })
      toast.success("Character deleted")
      onClose()
    },
  })

  const onDelete = async () => {
    const ok = await prompt({
      title: `Delete ${character?.name}?`,
      description:
        "The character page disappears from the website. Its products stay in the store.",
      confirmText: "Delete",
      cancelText: "Cancel",
    })
    if (ok) {
      remove.mutate()
    }
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{isNew ? "New character" : `Edit ${character?.name}`}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value
                  setForm((f) => ({
                    ...f,
                    name,
                    handle: isNew ? toHandle(name) : f.handle,
                  }))
                }}
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Web address</Label>
              <Input
                value={form.handle}
                onChange={(e) => set("handle", toHandle(e.target.value))}
              />
              <Text size="xsmall" className="text-ui-fg-subtle">
                stancil.in/characters/{form.handle || "name"}
              </Text>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v as FormState["status"])}
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="live">Live</Select.Item>
                  <Select.Item value="coming_soon">Coming soon</Select.Item>
                </Select.Content>
              </Select>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Order on page</Label>
              <Input
                type="number"
                value={form.rank}
                onChange={(e) => set("rank", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-y-2">
              <Label>Greeting</Label>
              <Input value={form.greeting} onChange={(e) => set("greeting", e.target.value)} />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Coming soon text</Label>
              <Input
                value={form.coming_soon_text}
                onChange={(e) => set("coming_soon_text", e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label>Collection title (shop page heading)</Label>
            <Input
              placeholder="e.g. Bella the Builder"
              value={form.collection_title ?? ""}
              onChange={(e) => set("collection_title", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label>Tagline</Label>
            <Input value={form.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label>Story</Label>
            <Textarea
              rows={4}
              value={form.story ?? ""}
              onChange={(e) => set("story", e.target.value)}
            />
          </div>
          <ImageField
            label="Character artwork (Meet the Gang card and intro popup)"
            recommended={{ width: 764, height: 882 }}
            value={form.image_url}
            onChange={(url) => set("image_url", url)}
          />
          <ImageField
            label="Shop page banner"
            recommended={{ width: 2880, height: 694, note: "Phones crop the sides, so keep the character in the middle third" }}
            value={form.banner_url}
            onChange={(url) => set("banner_url", url)}
          />
        </Drawer.Body>
        <Drawer.Footer>
          {!isNew && (
            <Button variant="danger" className="mr-auto" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Drawer.Close asChild>
            <Button variant="secondary">Cancel</Button>
          </Drawer.Close>
          <Button
            isLoading={save.isPending}
            disabled={!form.name || !form.handle}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

const CharactersPage = () => {
  const [editing, setEditing] = useState<Character | null>(null)
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ["characters"],
    queryFn: () => sdk.client.fetch<{ characters: Character[] }>("/admin/characters"),
  })

  const openDrawer = (c: Character | null) => {
    setEditing(c)
    setOpen(true)
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Characters</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            The gang on the Shop by Character page. Link products to a character from each
            product's page.
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={() => openDrawer(null)}>
          Create
        </Button>
      </div>
      {isLoading ? (
        <Text className="px-6 py-4">Loading...</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Character</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Products</Table.HeaderCell>
              <Table.HeaderCell>Order</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data?.characters.map((c) => (
              <Table.Row
                key={c.id}
                className="cursor-pointer"
                onClick={() => openDrawer(c)}
              >
                <Table.Cell>
                  <div className="flex items-center gap-x-3">
                    {c.image_url && isVideoUrl(c.image_url) ? (
                      <video src={c.image_url} muted className="h-8 w-8 rounded object-cover" />
                    ) : c.image_url ? (
                      <img src={c.image_url} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-ui-bg-component" />
                    )}
                    {c.name}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Badge color={c.status === "live" ? "green" : "grey"} size="2xsmall">
                    {c.status === "live" ? "Live" : "Coming soon"}
                  </Badge>
                </Table.Cell>
                <Table.Cell>{c.product_count ?? 0}</Table.Cell>
                <Table.Cell>{c.rank}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <CharacterDrawer character={editing} open={open} onClose={() => setOpen(false)} />
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Characters",
  icon: FaceSmile,
  nested: "/products",
})

export default CharactersPage
