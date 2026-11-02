import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"

// A right-click menu, like the one in Gmail or a phone's mail app.
//
//   const menu = useContextMenu()
//   <div onContextMenu={(e) => menu.open(e, [{ label: "Reply", onSelect: reply }, "-", …])}>
//   {menu.element}            ← put it anywhere inside the same screen (or drawer)
//
// It also opens from a button (menu.openFrom(button, items)), from the keyboard's menu key
// or Shift+F10, and works with the arrow keys, Enter and Escape.

export type MenuItem =
  | {
      label: string
      icon?: ReactNode
      shortcut?: string
      onSelect: () => void
      disabled?: boolean
      danger?: boolean
    }
  | "-"
  | { heading: string }

type State = { x: number; y: number; items: MenuItem[]; anchor?: { left: number; right: number; top: number; bottom: number } }

export function useContextMenu() {
  const [state, setState] = useState<State | null>(null)
  const back = useRef<HTMLElement | null>(null)

  const show = useCallback((s: State) => {
    back.current = (document.activeElement as HTMLElement) ?? null
    setState(s)
  }, [])

  const open = useCallback(
    (e: React.MouseEvent | MouseEvent, items: MenuItem[]) => {
      // Ctrl/⌘ + right-click keeps the browser's own menu (to copy a link and so on).
      if (e.ctrlKey || e.metaKey) return
      e.preventDefault()
      e.stopPropagation()
      const t = e.currentTarget as HTMLElement | null
      // From the keyboard (menu key / Shift+F10) there's no mouse position: use the item.
      if (e.clientX === 0 && e.clientY === 0 && t?.getBoundingClientRect) {
        const r = t.getBoundingClientRect()
        show({ x: r.left + 24, y: r.top + Math.min(r.height, 40), items })
      } else show({ x: e.clientX, y: e.clientY, items })
    },
    [show]
  )

  const openFrom = useCallback(
    (el: HTMLElement, items: MenuItem[]) => {
      const r = el.getBoundingClientRect()
      show({ x: r.right, y: r.bottom + 4, items, anchor: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } })
    },
    [show]
  )

  const close = useCallback((restore = true) => {
    setState(null)
    if (restore) setTimeout(() => back.current?.focus?.({ preventScroll: true }), 0)
  }, [])

  const element = state ? <Menu state={state} onClose={close} /> : null
  return { open, openFrom, close, element, isOpen: !!state }
}

function Menu({ state, onClose }: { state: State; onClose: (restore?: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const items = state.items
  const enabled = items.map((it, i) => (typeof it === "object" && "onSelect" in it && !it.disabled ? i : -1)).filter((i) => i >= 0)
  const [active, setActive] = useState(enabled[0] ?? -1)

  // Place it where it was asked for, but inside the window. A drawer can move fixed
  // elements (it slides in with a transform), so measure where it really landed.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.left = `${state.x}px`
    el.style.top = `${state.y}px`
    const r = el.getBoundingClientRect()
    const dx = r.left - state.x
    const dy = r.top - state.y
    const pad = 8
    let x = state.anchor ? state.anchor.right - r.width : state.x
    let y = state.y
    if (x + r.width > window.innerWidth - pad) x = window.innerWidth - pad - r.width
    if (y + r.height > window.innerHeight - pad) y = state.anchor ? state.anchor.top - r.height - 4 : window.innerHeight - pad - r.height
    x = Math.max(pad, x)
    y = Math.max(pad, y)
    setPos({ left: x - dx, top: y - dy })
  }, [state])

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const outside = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose(false)
    }
    const away = () => onClose(false)
    document.addEventListener("pointerdown", outside, true)
    document.addEventListener("scroll", away, true)
    window.addEventListener("resize", away)
    window.addEventListener("blur", away)
    return () => {
      document.removeEventListener("pointerdown", outside, true)
      document.removeEventListener("scroll", away, true)
      window.removeEventListener("resize", away)
      window.removeEventListener("blur", away)
    }
  }, [onClose])

  const choose = (i: number) => {
    const it = items[i]
    if (typeof it !== "object" || !("onSelect" in it) || it.disabled) return
    onClose()
    // After the menu has gone (so focus and drawers behave).
    setTimeout(it.onSelect, 0)
  }

  const key = (e: React.KeyboardEvent) => {
    const at = enabled.indexOf(active)
    if (e.key === "ArrowDown") setActive(enabled[(at + 1) % enabled.length])
    else if (e.key === "ArrowUp") setActive(enabled[(at - 1 + enabled.length) % enabled.length])
    else if (e.key === "Home") setActive(enabled[0])
    else if (e.key === "End") setActive(enabled[enabled.length - 1])
    else if (e.key === "Enter" || e.key === " ") choose(active)
    else if (e.key === "Escape" || e.key === "Tab") onClose()
    else {
      // A letter jumps to the item with that shortcut, as in the list.
      const hit = items.findIndex((it) => typeof it === "object" && "onSelect" in it && !it.disabled && it.shortcut?.toLowerCase() === e.key.toLowerCase())
      if (hit >= 0) choose(hit)
      else return
    }
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      data-context-menu
      aria-activedescendant={active >= 0 ? `ctx-item-${active}` : undefined}
      onKeyDown={key}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: "fixed", left: pos?.left ?? state.x, top: pos?.top ?? state.y, visibility: pos ? "visible" : "hidden" }}
      className="z-[1000] min-w-[220px] max-w-[320px] overflow-hidden rounded-xl bg-ui-bg-component p-1 shadow-elevation-flyout outline-none"
    >
      {items.map((it, i) => {
        if (it === "-") return <div key={i} role="separator" className="-mx-1 my-1 h-px bg-ui-border-base" />
        if ("heading" in it) {
          return (
            <div key={i} className="px-2 pb-1 pt-1.5 txt-compact-xsmall-plus text-ui-fg-muted">
              {it.heading}
            </div>
          )
        }
        return (
          <div
            key={i}
            id={`ctx-item-${i}`}
            role="menuitem"
            aria-disabled={it.disabled || undefined}
            onPointerEnter={() => !it.disabled && setActive(i)}
            onClick={() => choose(i)}
            className={`flex h-8 cursor-pointer select-none items-center gap-x-2 rounded-md px-2 txt-compact-small ${
              it.disabled ? "cursor-default text-ui-fg-disabled" : it.danger ? "text-ui-fg-error" : "text-ui-fg-base"
            } ${active === i && !it.disabled ? "bg-ui-bg-component-hover" : ""}`}
          >
            <span className={`flex w-[15px] shrink-0 justify-center ${it.disabled ? "" : it.danger ? "" : "text-ui-fg-subtle"}`}>{it.icon}</span>
            <span className="flex-1 truncate">{it.label}</span>
            {it.shortcut && <kbd className="ml-4 font-sans txt-compact-xsmall text-ui-fg-muted">{it.shortcut}</kbd>}
          </div>
        )
      })}
    </div>
  )
}
