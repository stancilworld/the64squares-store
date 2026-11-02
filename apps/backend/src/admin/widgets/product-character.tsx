import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Select, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../lib/sdk"
import type { Character } from "../lib/types"

const NONE = "none"

// Lets the team choose which character a product belongs to (shown on character pages and filters).
const ProductCharacterWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const qc = useQueryClient()
  const { data: list } = useQuery({
    queryKey: ["characters"],
    queryFn: () => sdk.client.fetch<{ characters: Character[] }>("/admin/characters"),
  })
  const { data: current } = useQuery({
    queryKey: ["product-character", product.id],
    queryFn: () =>
      sdk.client.fetch<{ character: { id: string; name: string } | null }>(
        `/admin/products/${product.id}/character`
      ),
  })

  const save = useMutation({
    mutationFn: (characterId: string | null) =>
      sdk.client.fetch(`/admin/products/${product.id}/character`, {
        method: "POST",
        body: { character_id: characterId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-character", product.id] })
      qc.invalidateQueries({ queryKey: ["characters"] })
      toast.success("Character updated")
    },
    onError: (e: Error) => toast.error("Could not update", { description: e.message }),
  })

  return (
    <Container className="flex flex-col gap-y-3 px-6 py-4">
      <div>
        <Heading level="h2">Character</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Shows this product on the character's page and in the Characters filter.
        </Text>
      </div>
      <Select
        value={current?.character?.id ?? NONE}
        onValueChange={(v) => save.mutate(v === NONE ? null : v)}
        disabled={save.isPending}
      >
        <Select.Trigger>
          <Select.Value placeholder="No character" />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={NONE}>No character</Select.Item>
          {list?.characters.map((c) => (
            <Select.Item key={c.id} value={c.id}>
              {c.name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default ProductCharacterWidget
