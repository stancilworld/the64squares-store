import { Button, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import type { Editor } from "@tiptap/react"
import { useMemo } from "react"
import { sdk } from "./sdk"

// Internal link suggestions while writing: pages of the site whose name or focus keyword
// appears in the text but isn't linked yet. "Add link" links the first mention.

type Target = { path: string; label: string; type: string; phrases: string[] }

const TYPE: Record<string, string> = { product: "Product", news: "News", post: "Journal", tournament: "Tournament", page: "Help", static: "Page" }

// The first place a phrase appears as whole words, outside existing links.
const findPhrase = (editor: Editor, phrase: string) => {
  const needle = phrase.toLowerCase()
  let found: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isText || !node.text) return !found
    if (node.marks.some((m) => m.type.name === "link")) return false
    const hay = node.text.toLowerCase()
    let i = hay.indexOf(needle)
    while (i !== -1) {
      const before = hay[i - 1]
      const after = hay[i + needle.length]
      if ((!before || /\W/.test(before)) && (!after || /\W/.test(after))) {
        found = { from: pos + i, to: pos + i + needle.length }
        return false
      }
      i = hay.indexOf(needle, i + 1)
    }
    return true
  })
  return found as { from: number; to: number } | null
}

export function LinkSuggestions({ editor, html, selfPath }: { editor: Editor | null; html: string; selfPath?: string }) {
  const { data } = useQuery({ queryKey: ["seo-link-targets"], queryFn: () => sdk.client.fetch<{ targets: Target[] }>("/admin/seo/link-targets"), staleTime: 300_000 })
  const suggestions = useMemo(() => {
    if (!editor || !data) return []
    const linked = new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, "")))
    const out: { target: Target; phrase: string }[] = []
    for (const t of data.targets) {
      if (t.path === selfPath || linked.has(t.path)) continue
      const phrase = [...t.phrases].sort((a, b) => b.length - a.length).find((p) => findPhrase(editor, p))
      if (phrase) out.push({ target: t, phrase })
    }
    return out.slice(0, 8)
    // html changes whenever the text does, which is what should refresh the list.
  }, [editor, data, html, selfPath])

  return (
    <div className="flex flex-col gap-y-2">
      <Text size="small" weight="plus">
        Link suggestions
      </Text>
      {!suggestions.length ? (
        <Text size="xsmall" className="text-ui-fg-subtle">
          As you write, pages of your shop mentioned in the text show up here, ready to link. Links help readers and Google.
        </Text>
      ) : (
        suggestions.map(({ target, phrase }) => (
          <div key={target.path} className="flex items-center justify-between gap-2 rounded-md border border-ui-border-base px-3 py-2">
            <div className="min-w-0">
              <Text size="xsmall" className="truncate font-medium">
                &ldquo;{phrase}&rdquo; → {target.label}
              </Text>
              <Text size="xsmall" className="truncate text-ui-fg-muted">
                {TYPE[target.type] ?? "Page"} · {target.path}
              </Text>
            </div>
            <Button
              size="small"
              variant="secondary"
              onClick={() => {
                const at = editor && findPhrase(editor, phrase)
                if (at) editor!.chain().focus().setTextSelection(at).setLink({ href: target.path }).run()
              }}
            >
              Add link
            </Button>
          </div>
        ))
      )}
    </div>
  )
}
