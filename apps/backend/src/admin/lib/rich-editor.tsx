import { Button, Input, Text, toast } from "@medusajs/ui"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import TextAlign from "@tiptap/extension-text-align"
import { Color, TextStyle } from "@tiptap/extension-text-style"
import Highlight from "@tiptap/extension-highlight"
import { TableKit } from "@tiptap/extension-table"
import Youtube from "@tiptap/extension-youtube"
import { CharacterCount, Placeholder } from "@tiptap/extensions"
import { useEffect, useRef, useState } from "react"
import { isConvertedPicture, PICTURE_ACCEPT, uploadImage } from "./upload"

// A word-processor style editor (TipTap) for long-form writing such as News articles: styles,
// bold/italic/underline, colours, alignment, lists, quotes, links, pictures (uploaded, also
// when pasted or dropped in), tables and YouTube videos. Its value is HTML; the server cleans
// it again when saving.

const TEXT_COLOURS = ["#111111", "#5f5f5f", "#c62828", "#ef6c00", "#b58900", "#2e7d32", "#1565c0", "#6a1b9a"]
const HIGHLIGHTS = ["#fff59d", "#ffe0b2", "#c8e6c9", "#bbdefb", "#f8bbd0"]

const STYLES = `
.rich-editor .ProseMirror { outline: none; min-height: 420px; padding: 32px 40px 64px; font-size: 16px; line-height: 1.7; color: var(--fg-base); }
.rich-editor .ProseMirror > * + * { margin-top: 0.85em; }
.rich-editor .ProseMirror h2 { font-size: 26px; line-height: 1.25; font-weight: 700; margin-top: 1.4em; }
.rich-editor .ProseMirror h3 { font-size: 21px; line-height: 1.3; font-weight: 700; margin-top: 1.2em; }
.rich-editor .ProseMirror h4 { font-size: 17px; line-height: 1.35; font-weight: 700; margin-top: 1em; }
.rich-editor .ProseMirror ul { list-style: disc; padding-left: 1.5em; }
.rich-editor .ProseMirror ol { list-style: decimal; padding-left: 1.5em; }
.rich-editor .ProseMirror li > p { margin: 0; }
.rich-editor .ProseMirror blockquote { border-left: 3px solid var(--border-strong); padding-left: 1em; font-style: italic; color: var(--fg-subtle); }
.rich-editor .ProseMirror a { color: var(--fg-interactive); text-decoration: underline; }
.rich-editor .ProseMirror img { max-width: 100%; height: auto; border-radius: 6px; }
.rich-editor .ProseMirror img.ProseMirror-selectednode { outline: 3px solid var(--fg-interactive); }
.rich-editor .ProseMirror hr { border: 0; border-top: 1px solid var(--border-strong); margin: 2em 0; }
.rich-editor .ProseMirror code { background: var(--bg-component); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
.rich-editor .ProseMirror pre { background: var(--bg-component); padding: 12px 16px; border-radius: 6px; }
.rich-editor .ProseMirror mark { border-radius: 2px; padding: 0 2px; }
.rich-editor .ProseMirror table { border-collapse: collapse; width: 100%; table-layout: fixed; }
.rich-editor .ProseMirror th, .rich-editor .ProseMirror td { border: 1px solid var(--border-strong); padding: 6px 10px; vertical-align: top; }
.rich-editor .ProseMirror th { background: var(--bg-component); font-weight: 600; text-align: left; }
.rich-editor .ProseMirror .selectedCell { background: var(--bg-highlight); }
.rich-editor .ProseMirror div[data-youtube-video] iframe { width: 100%; aspect-ratio: 16 / 9; height: auto; border-radius: 6px; }
.rich-editor .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--fg-muted); float: left; height: 0; pointer-events: none; }
`

const Glyph = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const PATHS = {
  undo: "M5 4 2 7l3 3M2 7h8a4 4 0 0 1 0 8H8",
  redo: "M11 4l3 3-3 3M14 7H6a4 4 0 0 0 0 8h2",
  left: "M2 3h12M2 6.5h8M2 10h12M2 13.5h8",
  center: "M2 3h12M4 6.5h8M2 10h12M4 13.5h8",
  right: "M2 3h12M6 6.5h8M2 10h12M6 13.5h8",
  justify: "M2 3h12M2 6.5h12M2 10h12M2 13.5h12",
  bullets: "M6 4h8M6 8h8M6 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01",
  numbers: "M7 4h7M7 8h7M7 12h7M2 3h1v3M2 6h2M2 10h2l-2 3h2",
  quote: "M3 5h4v4H5l-1 3M9 5h4v4h-2l-1 3",
  rule: "M2 8h12",
  link: "M7 9a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4l-1 1M9 7a3 3 0 0 0-4 0L3 9a3 3 0 0 0 4 4l1-1",
  image: "M2 3h12v10H2zM2 11l3.5-3.5 3 3 2-2L14 12M10.5 6.5h.01",
  video: "M2 4h12v8H2zM7 6v4l3-2z",
  table: "M2 3h12v10H2zM2 6.5h12M2 10h12M6 3v10M10 3v10",
  clear: "M3 3h10M8 3l-2 10M4 13h4M11 9l4 4M15 9l-4 4",
  expand: "M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4",
  shrink: "M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4",
}

const Tool = ({
  label,
  onClick,
  active = false,
  disabled = false,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className={`flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-[14px] transition-colors disabled:opacity-40 ${
      active ? "bg-ui-bg-base-pressed text-ui-fg-base" : "text-ui-fg-subtle hover:bg-ui-bg-base-hover hover:text-ui-fg-base"
    }`}
  >
    {children}
  </button>
)

const Sep = () => <span className="mx-1 h-5 w-px bg-ui-border-base" aria-hidden="true" />

// A small swatch menu (text colour, highlight).
const Swatches = ({
  label,
  colours,
  icon,
  onPick,
  onClear,
}: {
  label: string
  colours: string[]
  icon: React.ReactNode
  onPick: (c: string) => void
  onClear: () => void
}) => {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [open])
  return (
    <div ref={box} className="relative">
      <Tool label={label} onClick={() => setOpen((o) => !o)} active={open}>
        {icon}
      </Tool>
      {open && (
        <div className="absolute left-0 top-9 z-20 flex w-max items-center gap-1 rounded-lg border border-ui-border-base bg-ui-bg-base p-2 shadow-elevation-flyout">
          {colours.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              aria-label={`${label} ${c}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(c)
                setOpen(false)
              }}
              className="h-6 w-6 rounded-full border border-ui-border-base"
              style={{ background: c }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClear()
              setOpen(false)
            }}
            className="ml-1 rounded-md px-2 py-1 text-[12px] text-ui-fg-subtle hover:bg-ui-bg-base-hover"
          >
            None
          </button>
        </div>
      )}
    </div>
  )
}

const styleOf = (e: Editor) =>
  e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : e.isActive("heading", { level: 4 }) ? "h4" : "p"

const Toolbar = ({
  editor,
  onImage,
  uploading,
  full,
  setFull,
}: {
  editor: Editor
  onImage: () => void
  uploading: boolean
  full: boolean
  setFull: (v: boolean) => void
}) => {
  // One small input row, for a link or a YouTube address.
  const [ask, setAsk] = useState<null | "link" | "video">(null)
  const [url, setUrl] = useState("")
  const c = () => editor.chain().focus()
  const inTable = editor.isActive("table")

  const openAsk = (kind: "link" | "video") => {
    setUrl(kind === "link" ? (editor.getAttributes("link").href as string) ?? "" : "")
    setAsk(kind)
  }
  const apply = () => {
    const v = url.trim()
    if (ask === "link") {
      if (!v) c().extendMarkRange("link").unsetLink().run()
      else c().extendMarkRange("link").setLink({ href: /^(https?:|mailto:|tel:|\/)/i.test(v) ? v : `https://${v}` }).run()
    } else if (ask === "video" && v) {
      if (!c().setYoutubeVideo({ src: v }).run()) toast.error("That doesn't look like a YouTube link")
    }
    setAsk(null)
  }

  return (
    <div className="sticky top-0 z-10 border-b border-ui-border-base bg-ui-bg-subtle">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
        <Tool label="Undo (Ctrl+Z)" onClick={() => c().undo().run()} disabled={!editor.can().undo()}>
          <Glyph d={PATHS.undo} />
        </Tool>
        <Tool label="Redo (Ctrl+Y)" onClick={() => c().redo().run()} disabled={!editor.can().redo()}>
          <Glyph d={PATHS.redo} />
        </Tool>
        <Sep />
        <select
          aria-label="Text style"
          value={styleOf(editor)}
          onChange={(e) => {
            const v = e.target.value
            if (v === "p") c().setParagraph().run()
            else c().setHeading({ level: Number(v.slice(1)) as 2 | 3 | 4 }).run()
          }}
          className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-[13px] text-ui-fg-base"
        >
          <option value="p">Normal text</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
          <option value="h4">Small heading</option>
        </select>
        <Sep />
        <Tool label="Bold (Ctrl+B)" onClick={() => c().toggleBold().run()} active={editor.isActive("bold")}>
          <b>B</b>
        </Tool>
        <Tool label="Italic (Ctrl+I)" onClick={() => c().toggleItalic().run()} active={editor.isActive("italic")}>
          <i className="font-serif">I</i>
        </Tool>
        <Tool label="Underline (Ctrl+U)" onClick={() => c().toggleUnderline().run()} active={editor.isActive("underline")}>
          <u>U</u>
        </Tool>
        <Tool label="Strikethrough" onClick={() => c().toggleStrike().run()} active={editor.isActive("strike")}>
          <s>S</s>
        </Tool>
        <Swatches
          label="Text colour"
          colours={TEXT_COLOURS}
          icon={
            <span className="flex flex-col items-center leading-none">
              <span className="text-[13px] font-semibold">A</span>
              <span className="mt-0.5 h-[3px] w-4 rounded" style={{ background: (editor.getAttributes("textStyle").color as string) || "#c62828" }} />
            </span>
          }
          onPick={(col) => c().setColor(col).run()}
          onClear={() => c().unsetColor().run()}
        />
        <Swatches
          label="Highlight"
          colours={HIGHLIGHTS}
          icon={<span className="rounded-sm bg-[#fff59d] px-1 text-[13px] font-semibold text-black">ab</span>}
          onPick={(col) => c().setHighlight({ color: col }).run()}
          onClear={() => c().unsetHighlight().run()}
        />
        <Sep />
        <Tool label="Align left" onClick={() => c().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })}>
          <Glyph d={PATHS.left} />
        </Tool>
        <Tool label="Centre" onClick={() => c().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })}>
          <Glyph d={PATHS.center} />
        </Tool>
        <Tool label="Align right" onClick={() => c().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })}>
          <Glyph d={PATHS.right} />
        </Tool>
        <Tool label="Justify" onClick={() => c().setTextAlign("justify").run()} active={editor.isActive({ textAlign: "justify" })}>
          <Glyph d={PATHS.justify} />
        </Tool>
        <Sep />
        <Tool label="Bulleted list" onClick={() => c().toggleBulletList().run()} active={editor.isActive("bulletList")}>
          <Glyph d={PATHS.bullets} />
        </Tool>
        <Tool label="Numbered list" onClick={() => c().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
          <Glyph d={PATHS.numbers} />
        </Tool>
        <Tool label="Quote" onClick={() => c().toggleBlockquote().run()} active={editor.isActive("blockquote")}>
          <Glyph d={PATHS.quote} />
        </Tool>
        <Tool label="Divider line" onClick={() => c().setHorizontalRule().run()}>
          <Glyph d={PATHS.rule} />
        </Tool>
        <Sep />
        <Tool label="Link (Ctrl+K)" onClick={() => openAsk("link")} active={editor.isActive("link") || ask === "link"}>
          <Glyph d={PATHS.link} />
        </Tool>
        <Tool label={uploading ? "Uploading picture…" : "Picture"} onClick={onImage} disabled={uploading}>
          <Glyph d={PATHS.image} />
        </Tool>
        <Tool label="YouTube video" onClick={() => openAsk("video")} active={ask === "video"}>
          <Glyph d={PATHS.video} />
        </Tool>
        <Tool label="Table" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} active={inTable}>
          <Glyph d={PATHS.table} />
        </Tool>
        <Sep />
        <Tool label="Clear formatting" onClick={() => c().unsetAllMarks().clearNodes().run()}>
          <Glyph d={PATHS.clear} />
        </Tool>
        <span className="ml-auto" />
        <Tool label={full ? "Exit full screen" : "Full screen"} onClick={() => setFull(!full)} active={full}>
          <Glyph d={full ? PATHS.shrink : PATHS.expand} />
        </Tool>
      </div>

      {inTable && (
        <div className="flex flex-wrap items-center gap-1 border-t border-ui-border-base px-2 py-1.5 text-[12px]">
          <Text size="xsmall" className="mr-1 text-ui-fg-muted">
            Table
          </Text>
          {(
            [
              ["Row above", () => c().addRowBefore().run()],
              ["Row below", () => c().addRowAfter().run()],
              ["Column left", () => c().addColumnBefore().run()],
              ["Column right", () => c().addColumnAfter().run()],
              ["Header row", () => c().toggleHeaderRow().run()],
              ["Merge / split", () => c().mergeOrSplit().run()],
              ["Delete row", () => c().deleteRow().run()],
              ["Delete column", () => c().deleteColumn().run()],
              ["Delete table", () => c().deleteTable().run()],
            ] as const
          ).map(([label, run]) => (
            <button
              key={label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={run}
              className={`rounded-md px-2 py-1 hover:bg-ui-bg-base-hover ${label.startsWith("Delete") ? "text-ui-fg-error" : "text-ui-fg-subtle"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {ask && (
        <form
          className="flex items-center gap-2 border-t border-ui-border-base px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault()
            apply()
          }}
        >
          <Input
            autoFocus
            size="small"
            placeholder={ask === "link" ? "https://… (leave empty to remove the link)" : "https://www.youtube.com/watch?v=…"}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAsk(null)}
            className="flex-1"
          />
          <Button size="small" type="submit">
            {ask === "link" ? "Apply link" : "Add video"}
          </Button>
          <Button size="small" variant="transparent" type="button" onClick={() => setAsk(null)}>
            Cancel
          </Button>
        </form>
      )}
    </div>
  )
}

export const RichEditor = ({
  value,
  onChange,
  placeholder = "Start writing…",
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) => {
  const [uploading, setUploading] = useState(false)
  const [full, setFull] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const changeRef = useRef(onChange)
  changeRef.current = onChange

  // Uploads pictures and puts them in at the cursor (or where they were dropped).
  const addPictures = async (files: File[], at?: number) => {
    const pics = files.filter((f) => f.type.startsWith("image/") || isConvertedPicture(f))
    if (!pics.length) return false
    setUploading(true)
    try {
      for (const f of pics) {
        const src = await uploadImage(f)
        const chain = editorRef.current?.chain().focus()
        if (!chain) break
        ;(at !== undefined ? chain.insertContentAt(at, { type: "image", attrs: { src, alt: "" } }) : chain.setImage({ src, alt: "" })).run()
      }
    } catch (e) {
      toast.error("Couldn't upload the picture", { description: (e as Error).message })
    } finally {
      setUploading(false)
    }
    return true
  }

  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Image.configure({ inline: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TableKit.configure({ table: { resizable: false } }),
      Youtube.configure({ nocookie: true, controls: true, width: 640, height: 360 }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
    ],
    content: value,
    editorProps: {
      attributes: { class: "news-body" },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (!files.some((f) => f.type.startsWith("image/"))) return false
        void addPictures(files)
        return true
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (!files.length) return false
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        void addPictures(files, pos)
        return true
      },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          event.preventDefault()
          document.querySelector<HTMLButtonElement>('.rich-editor button[aria-label="Link (Ctrl+K)"]')?.click()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: e }) => changeRef.current(e.isEmpty ? "" : e.getHTML()),
  })
  editorRef.current = editor

  // A different article opened in the same editor.
  useEffect(() => {
    if (editor && value !== (editor.isEmpty ? "" : editor.getHTML())) {
      editor.commands.setContent(value || "", { emitUpdate: false })
    }
  }, [value, editor])

  useEffect(() => {
    if (!full) return
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setFull(false)
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [full])

  if (!editor) return null
  const words = editor.storage.characterCount.words() as number

  return (
    <div
      className={`rich-editor flex flex-col overflow-hidden border border-ui-border-base bg-ui-bg-base ${
        full ? "fixed inset-0 z-[100] rounded-none" : "rounded-lg"
      }`}
    >
      <style>{STYLES}</style>
      <Toolbar editor={editor} onImage={() => fileInput.current?.click()} uploading={uploading} full={full} setFull={setFull} />
      <div className={`flex-1 overflow-y-auto ${full ? "bg-ui-bg-subtle" : ""}`}>
        <div className={full ? "mx-auto my-8 max-w-[820px] rounded-lg bg-ui-bg-base shadow-elevation-card-rest" : ""}>
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-ui-border-base bg-ui-bg-subtle px-3 py-1.5">
        <Text size="xsmall" className="text-ui-fg-muted">
          {uploading ? "Uploading picture…" : "Paste or drag pictures straight in. Paste from Word or Google Docs keeps the formatting."}
        </Text>
        <Text size="xsmall" className="text-ui-fg-muted">
          {words} {words === 1 ? "word" : "words"} · about {Math.max(1, Math.round(words / 220))} min read
        </Text>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={PICTURE_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          void addPictures(Array.from(e.target.files ?? []))
          e.target.value = ""
        }}
      />
    </div>
  )
}
