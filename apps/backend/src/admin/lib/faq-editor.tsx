import { Button, Input, Textarea } from "@medusajs/ui"

// A list of questions and answers (e.g. on a product): add, edit, reorder, remove.
export function FaqEditor({ value, onChange, max = 20 }: { value: { q: string; a: string }[]; onChange: (v: { q: string; a: string }[]) => void; max?: number }) {
  const update = (i: number, part: Partial<{ q: string; a: string }>) => onChange(value.map((x, j) => (j === i ? { ...x, ...part } : x)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-3">
      {value.map((item, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-ui-border-base p-3">
          <Input placeholder="Question, e.g. Are the pieces weighted?" value={item.q} maxLength={200} onChange={(e) => update(i, { q: e.target.value })} />
          <Textarea rows={2} placeholder="Answer" value={item.a} maxLength={2000} onChange={(e) => update(i, { a: e.target.value })} />
          <div className="flex justify-end gap-1">
            <Button type="button" size="small" variant="transparent" disabled={i === 0} onClick={() => move(i, -1)}>
              Move up
            </Button>
            <Button type="button" size="small" variant="transparent" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
              Move down
            </Button>
            <Button type="button" size="small" variant="transparent" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        </div>
      ))}
      {value.length < max && (
        <div>
          <Button type="button" size="small" variant="secondary" onClick={() => onChange([...value, { q: "", a: "" }])}>
            Add a question
          </Button>
        </div>
      )}
    </div>
  )
}
