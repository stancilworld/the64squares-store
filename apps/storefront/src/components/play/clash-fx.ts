// The moving parts of the "Play online" scene: smoke rising from the clash, embers and wood
// splinters thrown out of it, and the flying pieces drifting. The pointer tilts the scene,
// blows the embers about and makes the pieces move apart; a press sets off a burst.
//
// Everything is measured in the frame (the 2:1 box the pictures fill), in fractions of its
// width, so the effects stay in place however the frame is cropped.

export type ClashPiece = { name: string; l: number; t: number; r: number; b: number; depth: number }

type Els = {
  root: HTMLElement
  frame: HTMLElement
  plate: HTMLElement
  back: HTMLCanvasElement
  front: HTMLCanvasElement
  pieces: (HTMLElement | null)[]
}

type Ember = { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; flick: number }
type Chip = { x: number; y: number; vx: number; vy: number; life: number; age: number; w: number; h: number; rot: number; spin: number; tone: string }
type Puff = { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; grow: number; rot: number; spin: number; tex: number; peak: number }

const TONES = ["#3a2418", "#5a3a26", "#c9a77c", "#e3c9a0", "#2a1a12"]
const rand = (a: number, b: number) => a + Math.random() * (b - a)

// A soft, lumpy smoke puff: value noise in a few octaves, faded towards the edge.
function puffTexture(rgb: [number, number, number], seed: number) {
  const N = 128
  const c = document.createElement("canvas")
  c.width = c.height = N
  const ctx = c.getContext("2d")
  if (!ctx) return c
  const img = ctx.createImageData(N, N)
  const G = 9
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const grids = [G, G * 2, G * 4].map((g) => Array.from({ length: (g + 1) * (g + 1) }, rnd))
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const sample = (grid: number[], g: number, x: number, y: number) => {
    const gx = x * g
    const gy = y * g
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = smooth(gx - x0)
    const fy = smooth(gy - y0)
    const at = (i: number, j: number) => grid[Math.min(j, g) * (g + 1) + Math.min(i, g)]
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx
    const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx
    return top + (bot - top) * fy
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N
      const v = y / N
      const n = sample(grids[0], G, u, v) * 0.55 + sample(grids[1], G * 2, u, v) * 0.3 + sample(grids[2], G * 4, u, v) * 0.15
      const d = Math.hypot(u - 0.5, v - 0.5) * 2
      const fall = Math.max(0, 1 - d) ** 1.6
      const a = Math.max(0, (n - 0.32) * 1.9) * fall
      const i = (y * N + x) * 4
      img.data[i] = rgb[0]
      img.data[i + 1] = rgb[1]
      img.data[i + 2] = rgb[2]
      img.data[i + 3] = Math.min(255, a * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

export function startClash(els: Els, pieces: ClashPiece[], clash: [number, number]) {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const fine = window.matchMedia("(pointer: fine)").matches
  const bctx = els.back.getContext("2d")
  const fctx = els.front.getContext("2d")
  if (!bctx || !fctx) return () => {}

  // Cool grey smoke away from the fire, warm smoke near it.
  const tex = [
    puffTexture([150, 158, 172], 11),
    puffTexture([140, 148, 160], 23),
    puffTexture([255, 150, 80], 37),
    puffTexture([235, 120, 60], 41),
  ]

  let W = 1
  let H = 1
  let dpr = 1
  let scale = 1 // particle budget: smaller frames get fewer
  const [CX, CY] = clash
  const embers: Ember[] = []
  const chips: Chip[] = []
  const puffs: Puff[] = []

  // Pointer, in frame fractions; tilt is eased towards it.
  const ptr = { x: 0.5, y: 0.5, inside: false, vx: 0, vy: 0, last: 0 }
  let mx = 0
  let my = 0
  let charge = 0
  let burst = 0
  let nextPulse = 2.5
  let t = 0

  const resize = () => {
    // The frame covers the box: as wide as the box, or twice its height if that is wider.
    const bw = els.root.clientWidth || 1
    const bh = els.root.clientHeight || 1
    W = Math.max(bw, bh * 2)
    H = W / 2
    els.frame.style.width = `${W}px`
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    for (const c of [els.back, els.front]) {
      c.width = Math.round(W * dpr)
      c.height = Math.round(H * dpr)
    }
    scale = Math.max(0.45, Math.min(1, (W * H) / (900 * 450)))
  }

  const ember = (power = 1) => {
    const a = rand(-Math.PI * 0.95, -Math.PI * 0.05) + rand(-0.4, 0.4)
    const sp = rand(0.04, 0.2) * power
    embers.push({
      x: CX + rand(-0.025, 0.025),
      y: CY + rand(-0.03, 0.05),
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp * 1.4,
      life: rand(1.2, 3.4),
      age: 0,
      size: rand(0.6, 2.1),
      flick: rand(0, 6.28),
    })
  }
  const chip = (power = 1) => {
    const a = rand(-Math.PI * 0.9, -Math.PI * 0.1)
    const sp = rand(0.12, 0.42) * power
    chips.push({
      x: CX + rand(-0.03, 0.03),
      y: CY + rand(-0.02, 0.04),
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: rand(1, 2.2),
      age: 0,
      w: rand(2, 6),
      h: rand(0.8, 2),
      rot: rand(0, 6.28),
      spin: rand(-14, 14),
      tone: TONES[Math.floor(Math.random() * TONES.length)],
    })
  }
  const puff = (near = false) => {
    const warm = near || Math.random() < 0.3
    puffs.push({
      x: near ? CX + rand(-0.06, 0.06) : rand(0.12, 0.88),
      y: near ? CY + rand(-0.02, 0.08) : rand(0.35, 0.85),
      vx: rand(-0.008, 0.008),
      vy: rand(-0.028, -0.01),
      life: rand(6, 11),
      age: 0,
      size: rand(0.14, 0.26),
      grow: rand(0.015, 0.035),
      rot: rand(0, 6.28),
      spin: rand(-0.12, 0.12),
      tex: warm ? 2 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 2),
      peak: warm ? rand(0.22, 0.36) : rand(0.14, 0.26),
    })
  }

  const blast = (power: number) => {
    burst = Math.max(burst, power)
    const n = Math.round((40 + 110 * power) * scale)
    for (let i = 0; i < n; i++) ember(0.8 + power * 1.2)
    for (let i = 0; i < Math.round((4 + 26 * power) * scale); i++) chip(0.6 + power)
    for (let i = 0; i < Math.round(1 + 3 * power); i++) puff(true)
  }

  const step = (dt: number) => {
    t += dt
    // Tilt: towards the pointer, or a slow drift on its own (phones).
    const tx = ptr.inside ? (ptr.x - 0.5) * 2 : Math.sin(t * 0.21) * 0.55
    const ty = ptr.inside ? (ptr.y - 0.5) * 2 : Math.sin(t * 0.17 + 1) * 0.25
    mx += (tx - mx) * Math.min(1, dt * 3)
    my += (ty - my) * Math.min(1, dt * 3)
    charge += ((ptr.inside && fine ? 1 : 0) - charge) * Math.min(1, dt * 2.2)
    burst *= Math.exp(-dt * 2.4)
    ptr.vx *= Math.exp(-dt * 6)
    ptr.vy *= Math.exp(-dt * 6)

    // A small flare every few seconds keeps it alive.
    nextPulse -= dt
    if (nextPulse <= 0) {
      blast(0.28 + Math.random() * 0.12)
      nextPulse = rand(4.5, 7)
    }
    // Steady embers and smoke; more while the pointer is over the scene.
    const rate = (9 + charge * 26) * scale
    if (Math.random() < rate * dt) ember(1 + charge * 0.5)
    if (puffs.length < 20 * scale + 5 && Math.random() < dt * 2) puff(Math.random() < 0.45)

    const wind = (p: { x: number; y: number; vx: number; vy: number }, k: number) => {
      if (!ptr.inside) return
      const d = Math.hypot(p.x - ptr.x, (p.y - ptr.y) * 0.5)
      if (d > 0.18) return
      const f = (1 - d / 0.18) * k
      p.vx += ptr.vx * f * dt * 9
      p.vy += ptr.vy * f * dt * 9
    }
    for (const e of embers) {
      e.age += dt
      wind(e, 1)
      e.vy -= 0.035 * dt // hot: they rise
      e.vx += Math.sin(t * 3 + e.flick) * 0.02 * dt
      e.vx *= Math.exp(-dt * 0.9)
      e.vy *= Math.exp(-dt * 0.9)
      e.x += e.vx * dt
      e.y += e.vy * dt * 2
    }
    for (const c of chips) {
      c.age += dt
      c.vy += 0.55 * dt // wood falls
      c.vx *= Math.exp(-dt * 0.6)
      c.x += c.vx * dt
      c.y += c.vy * dt * 2
      c.rot += c.spin * dt
    }
    for (const p of puffs) {
      p.age += dt
      wind(p, 0.35)
      p.x += p.vx * dt
      p.y += p.vy * dt * 2
      p.size += p.grow * dt
      p.rot += p.spin * dt
    }
    for (const list of [embers, chips, puffs] as { age: number; life: number; y: number }[][]) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].age > list[i].life || list[i].y < -0.1) list.splice(i, 1)
    }
  }

  const draw = () => {
    const S = W * dpr // fractions are of the width (y uses the same unit, times 2 for the 2:1 frame)
    const X = (x: number) => x * S
    const Y = (y: number) => y * H * dpr

    // Back: glow and smoke, behind the flying pieces.
    bctx.setTransform(1, 0, 0, 1, 0, 0)
    bctx.clearRect(0, 0, els.back.width, els.back.height)
    const flicker = 0.85 + Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.04
    const glowR = S * (0.2 + charge * 0.04 + burst * 0.1)
    bctx.globalCompositeOperation = "lighter"
    const g = bctx.createRadialGradient(X(CX), Y(CY), 0, X(CX), Y(CY), glowR)
    const a = (0.32 + charge * 0.14 + burst * 0.45) * flicker
    g.addColorStop(0, `rgba(255, 196, 120, ${Math.min(0.9, a)})`)
    g.addColorStop(0.25, `rgba(255, 120, 40, ${a * 0.5})`)
    g.addColorStop(1, "rgba(120, 30, 0, 0)")
    bctx.fillStyle = g
    bctx.fillRect(0, 0, els.back.width, els.back.height)
    bctx.globalCompositeOperation = "source-over"
    for (const p of puffs) {
      const k = p.age / p.life
      const alpha = p.peak * Math.sin(Math.PI * Math.min(1, k)) * (p.tex >= 2 ? 1 + burst * 0.8 : 1)
      if (alpha <= 0.002) continue
      const size = p.size * S
      bctx.globalAlpha = Math.min(1, alpha)
      bctx.setTransform(1, 0, 0, 1, X(p.x), Y(p.y))
      bctx.rotate(p.rot)
      bctx.drawImage(tex[p.tex], -size / 2, -size / 2, size, size)
    }
    bctx.globalAlpha = 1
    bctx.setTransform(1, 0, 0, 1, 0, 0)

    // Front: embers and splinters, over the pieces.
    fctx.setTransform(1, 0, 0, 1, 0, 0)
    fctx.clearRect(0, 0, els.front.width, els.front.height)
    for (const c of chips) {
      const k = c.age / c.life
      fctx.globalAlpha = Math.max(0, 1 - k * k)
      fctx.setTransform(1, 0, 0, 1, X(c.x), Y(c.y))
      fctx.rotate(c.rot)
      fctx.fillStyle = c.tone
      fctx.fillRect((-c.w / 2) * dpr, (-c.h / 2) * dpr, c.w * dpr, c.h * dpr)
    }
    fctx.setTransform(1, 0, 0, 1, 0, 0)
    fctx.globalCompositeOperation = "lighter"
    for (const e of embers) {
      const k = e.age / e.life
      const fade = k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9
      const tw = 0.65 + 0.35 * Math.sin(t * 14 + e.flick)
      const r = e.size * dpr * (1.2 - k * 0.5)
      const x = X(e.x)
      const y = Y(e.y)
      // Hot white-yellow when fresh, cooling to orange and red.
      const gg = Math.round(220 - k * 150)
      const bb = Math.round(150 - k * 140)
      fctx.globalAlpha = Math.max(0, fade * tw * 0.22)
      fctx.fillStyle = `rgb(255, ${gg - 60}, ${Math.max(0, bb - 100)})`
      fctx.beginPath()
      fctx.arc(x, y, r * 2.6, 0, 6.283)
      fctx.fill()
      fctx.globalAlpha = Math.max(0, fade * tw)
      const speed = Math.hypot(e.vx, e.vy * 2)
      if (speed > 0.06) {
        // Fast ones are sparks: a short streak behind them.
        const len = Math.min(0.03, speed * 0.06) * S
        fctx.strokeStyle = `rgb(255, ${gg}, ${bb})`
        fctx.lineWidth = r * 1.1
        fctx.lineCap = "round"
        fctx.beginPath()
        fctx.moveTo(x, y)
        fctx.lineTo(x - (e.vx / speed) * len, y - ((e.vy * 2) / speed) * len)
        fctx.stroke()
      } else {
        fctx.fillStyle = `rgb(255, ${gg}, ${bb})`
        fctx.beginPath()
        fctx.arc(x, y, r, 0, 6.283)
        fctx.fill()
      }
    }
    fctx.globalAlpha = 1
    fctx.globalCompositeOperation = "source-over"

    // The pictures: the backdrop tilts a little, nearer pieces more; the pieces bob and turn,
    // move apart while the pointer is over the scene and are thrown out by a burst.
    els.plate.style.transform = `translate3d(${(-mx * 0.6).toFixed(2)}%, ${(-my * 0.5).toFixed(2)}%, 0) scale(1.03)`
    pieces.forEach((p, i) => {
      const el = els.pieces[i]
      if (!el) return
      const cx = (p.l + p.r) / 2
      const cy = (p.t + p.b) / 2
      let dx = cx - CX
      let dy = (cy - CY) * 0.5
      const len = Math.hypot(dx, dy) || 1
      dx /= len
      dy /= len
      const spread = charge * 0.012 + burst * 0.045
      let ox = dx * spread * W - mx * p.depth * W * 0.012
      let oy = dy * spread * W - my * p.depth * H * 0.012 + Math.sin(t * 0.7 + i * 1.9) * H * 0.008
      if (ptr.inside && fine) {
        // The piece under the pointer leans away from it.
        const d = Math.hypot(cx - ptr.x, (cy - ptr.y) * 0.5)
        if (d < 0.1) {
          const f = (1 - d / 0.1) * W * 0.012
          ox += Math.sign(cx - ptr.x || 1) * f
          oy += Math.sign(cy - ptr.y || 1) * f * 0.6
        }
      }
      const rot = Math.sin(t * 0.5 + i * 1.3) * 1.8 + burst * (i % 2 ? 9 : -9) + charge * (dx > 0 ? 2.5 : -2.5)
      el.style.transform = `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg)`
    })
  }

  // Pointer.
  const rel = (e: PointerEvent) => {
    const r = els.frame.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }
  const move = (e: PointerEvent) => {
    const p = rel(e)
    const now = performance.now()
    const dt = Math.max(16, now - ptr.last) / 1000
    if (ptr.inside) {
      ptr.vx = (p.x - ptr.x) / dt
      ptr.vy = (p.y - ptr.y) / dt
    }
    ptr.last = now
    ptr.x = p.x
    ptr.y = p.y
    ptr.inside = e.pointerType === "mouse" || e.pointerType === "pen"
  }
  const leave = () => {
    ptr.inside = false
  }
  const down = () => blast(1)

  resize()
  // Before the first frame: a little smoke and a few embers already in the air.
  for (let i = 0; i < 8; i++) puff(i % 2 === 0)
  for (let i = 0; i < 160; i++) step(1 / 30)

  if (still) {
    draw()
    const ro = new ResizeObserver(() => {
      resize()
      draw()
    })
    ro.observe(els.root)
    return () => ro.disconnect()
  }

  let raf = 0
  let last = 0
  let visible = true
  const frame = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
    last = now
    step(dt)
    draw()
    raf = requestAnimationFrame(frame)
  }
  const run = () => {
    cancelAnimationFrame(raf)
    if (visible && !document.hidden) {
      last = 0
      raf = requestAnimationFrame(frame)
    }
  }
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    run()
  })
  io.observe(els.root)
  const ro = new ResizeObserver(resize)
  ro.observe(els.root)
  document.addEventListener("visibilitychange", run)
  els.root.addEventListener("pointermove", move)
  els.root.addEventListener("pointerleave", leave)
  els.root.addEventListener("pointerdown", down)
  run()
  return () => {
    cancelAnimationFrame(raf)
    io.disconnect()
    ro.disconnect()
    document.removeEventListener("visibilitychange", run)
    els.root.removeEventListener("pointermove", move)
    els.root.removeEventListener("pointerleave", leave)
    els.root.removeEventListener("pointerdown", down)
  }
}
