"use client"

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg border border-black/15 px-4 py-2 text-[14px] font-semibold hover:bg-black/5">
      Print or save as PDF
    </button>
  )
}
