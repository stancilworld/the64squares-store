// The "Play online" scene, live in 3D (three.js, loaded only here): pieces thrown up by a clash
// in the middle of a graphite board, turning slowly in smoke and amber light while the view goes
// round the board. The pointer tilts the view and draws the pieces apart; dragging spins it;
// pressing sends out a burst of sparks on the way to the game.
//
// Pieces: /play-art/pieces.glb (tools/pieces/export-glb.py), one mesh per piece, standing on
// its base, in board squares of 1.25 (so they're scaled by 0.8 to squares of 1 here).

type Three = typeof import("three")

export type SceneHandle = { stop: () => void; dragged: () => boolean }

const PIECE_SCALE = 0.8
const HEIGHT: Record<string, number> = { P: 0.905, R: 1.05, N: 1.33, B: 1.31, Q: 1.52, K: 1.77 }

// The site's palette: charcoal, warm white, amber.
const BG = 0x161616
const IVORY = 0xebe4d6
const EBONY = 0x3a3835
const AMBER = 0xffb300

// Standing pieces, [piece, colour, x, z] (square centres; the board spans -4..4).
const STANDING: [string, "w" | "b", number, number][] = [
  ["R", "w", -3.5, -1.5], ["P", "w", -1.5, -3.5], ["B", "w", 2.5, -2.5], ["Q", "w", -3.5, 2.5],
  ["R", "b", 3.5, 1.5], ["P", "b", 1.5, 3.5], ["B", "b", -2.5, 3.5], ["K", "b", 3.5, -3.5],
]
// Thrown out from the clash: [piece, colour, offset from its centre]. Each points away from
// the centre, as if blown out by it.
const CLASH_AT = [0, 1.55, 0] as const
const FLYING: [string, "w" | "b", [number, number, number]][] = [
  ["K", "w", [-1.7, 0.55, 0.3]],
  ["B", "b", [-0.4, 1.45, -0.7]],
  ["P", "w", [0.7, 1.25, 0.8]],
  ["N", "b", [1.8, 0.25, -0.4]],
  ["N", "w", [-0.85, -0.4, 1.2]],
  ["R", "w", [0.3, 0.2, -1.8]],
]

const rand = (a: number, b: number) => a + Math.random() * (b - a)

// A soft, lumpy smoke puff: value noise in a few octaves, faded towards the edge (white; the
// sprite gives it its colour).
function puffCanvas(seed: number) {
  const N = 128
  const c = document.createElement("canvas")
  c.width = c.height = N
  const ctx = c.getContext("2d")
  if (!ctx) return c
  const img = ctx.createImageData(N, N)
  let s = seed
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  const G = 7
  const grids = [G, G * 2, G * 4].map((g) => ({ g, v: Array.from({ length: (g + 1) * (g + 1) }, rnd) }))
  const sm = (t: number) => t * t * (3 - 2 * t)
  const at = ({ g, v }: { g: number; v: number[] }, x: number, y: number) => {
    const gx = x * g
    const gy = y * g
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = sm(gx - x0)
    const fy = sm(gy - y0)
    const q = (i: number, j: number) => v[Math.min(j, g) * (g + 1) + Math.min(i, g)]
    const a = q(x0, y0) + (q(x0 + 1, y0) - q(x0, y0)) * fx
    const b = q(x0, y0 + 1) + (q(x0 + 1, y0 + 1) - q(x0, y0 + 1)) * fx
    return a + (b - a) * fy
  }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N
      const w = y / N
      const n = at(grids[0], u, w) * 0.55 + at(grids[1], u, w) * 0.3 + at(grids[2], u, w) * 0.15
      const d = Math.hypot(u - 0.5, w - 0.5) * 2
      const a = Math.max(0, (n - 0.3) * 1.8) * Math.max(0, 1 - d) ** 1.8
      const i = (y * N + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.min(255, a * 255)
    }
  ctx.putImageData(img, 0, 0)
  return c
}

// The board's squares: graphite and warm grey, with a faint grain and fine seams.
function boardCanvas() {
  const N = 1024
  const c = document.createElement("canvas")
  c.width = c.height = N
  const ctx = c.getContext("2d")
  if (!ctx) return c
  const q = N / 8
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      ctx.fillStyle = (r + f) % 2 ? "#4a4946" : "#1c1c1c"
      ctx.fillRect(f * q, r * q, q, q)
    }
  const img = ctx.getImageData(0, 0, N, N)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 9
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
  ctx.strokeStyle = "rgba(0,0,0,0.35)"
  ctx.lineWidth = 2
  for (let i = 1; i < 8; i++) {
    ctx.beginPath()
    ctx.moveTo(i * q, 0)
    ctx.lineTo(i * q, N)
    ctx.moveTo(0, i * q)
    ctx.lineTo(N, i * q)
    ctx.stroke()
  }
  return c
}

function glowCanvas(inner: string, outer: string) {
  const N = 256
  const c = document.createElement("canvas")
  c.width = c.height = N
  const ctx = c.getContext("2d")
  if (!ctx) return c
  const g = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2)
  g.addColorStop(0, inner)
  g.addColorStop(0.22, outer)
  g.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, N, N)
  return c
}

export async function startClashScene(canvas: HTMLCanvasElement, root: HTMLElement, onReady: () => void): Promise<SceneHandle> {
  const T: Three = await import("three")
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js")
  const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js")
  const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js")

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const fine = window.matchMedia("(pointer: fine)").matches

  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, fine ? 2 : 1.6))
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = T.PCFSoftShadowMap

  const scene = new T.Scene()
  scene.background = new T.Color(BG)
  scene.fog = new T.FogExp2(BG, 0.045)
  const pmrem = new T.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.22

  const camera = new T.PerspectiveCamera(30, 2, 0.1, 60)

  // Board: the squares, a thin dark frame, nothing beyond (the fog takes the edges).
  const boardTex = new T.CanvasTexture(boardCanvas())
  boardTex.colorSpace = T.SRGBColorSpace
  boardTex.anisotropy = 8
  const board = new T.Mesh(
    new T.PlaneGeometry(8, 8),
    new T.MeshPhysicalMaterial({ map: boardTex, roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.22 })
  )
  board.rotation.x = -Math.PI / 2
  board.receiveShadow = true
  scene.add(board)
  const frame = new T.Mesh(new T.BoxGeometry(8.7, 0.32, 8.7), new T.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.45 }))
  frame.position.y = -0.165
  frame.receiveShadow = true
  scene.add(frame)

  // Light: a high key that casts the shadows, a cool rim that stays behind the pieces as the
  // view turns, the amber clash and a little sky.
  scene.add(new T.HemisphereLight(0xc9ccd3, 0x141414, 0.5))
  const key = new T.DirectionalLight(0xfff3e2, 1.6)
  key.position.set(-4, 9, 5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 })
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  key.shadow.radius = 4
  scene.add(key)
  const rim = new T.DirectionalLight(0xbcd2ff, 2.2)
  scene.add(rim)
  const clashLight = new T.PointLight(AMBER, 26, 0, 1.7)
  clashLight.position.set(CLASH_AT[0], CLASH_AT[1] - 0.25, CLASH_AT[2])
  scene.add(clashLight)
  const floorLight = new T.PointLight(0xff9a1a, 6, 0, 1.6)
  floorLight.position.set(0.2, 0.5, 0.2)
  scene.add(floorLight)

  // The glow at the heart of the clash, and its pool of light on the board.
  const glowTex = new T.CanvasTexture(glowCanvas("rgba(255,236,190,1)", "rgba(255,170,30,0.45)"))
  glowTex.colorSpace = T.SRGBColorSpace
  const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }))
  glow.position.set(CLASH_AT[0], CLASH_AT[1] - 0.2, CLASH_AT[2])
  glow.scale.setScalar(2.4)
  scene.add(glow)
  const poolTex = new T.CanvasTexture(glowCanvas("rgba(255,190,80,0.9)", "rgba(255,150,20,0.35)"))
  poolTex.colorSpace = T.SRGBColorSpace
  const pool = new T.Mesh(
    new T.PlaneGeometry(4.5, 4.5),
    new T.MeshBasicMaterial({ map: poolTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 })
  )
  pool.rotation.x = -Math.PI / 2
  pool.position.y = 0.01
  scene.add(pool)

  // Pieces.
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync("/play-art/pieces.glb")
  // Each shape with its node's transform (the compressed file keeps the true size and position
  // there).
  const geo: Record<string, { g: import("three").BufferGeometry; m: import("three").Matrix4 }> = {}
  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse((o) => {
    const m = o as import("three").Mesh
    if (m.isMesh) geo[m.name] = { g: m.geometry, m: m.matrixWorld.clone() }
  })
  const mats = {
    w: new T.MeshPhysicalMaterial({ color: IVORY, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: new T.Color(0xfff4e0) }),
    b: new T.MeshPhysicalMaterial({ color: EBONY, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.28 }),
  }
  const pieceMesh = (code: string, colour: "w" | "b") => {
    const inner = new T.Mesh(geo[code].g, mats[colour])
    geo[code].m.decompose(inner.position, inner.quaternion, inner.scale)
    inner.castShadow = true
    inner.receiveShadow = true
    const m = new T.Group()
    m.add(inner)
    m.scale.setScalar(PIECE_SCALE)
    return m
  }
  for (const [code, colour, x, z] of STANDING) {
    const m = pieceMesh(code, colour)
    m.position.set(x, 0, z)
    m.rotation.y = rand(-0.6, 0.6)
    scene.add(m)
  }
  // Flying pieces turn about their middle: the mesh sits in a holder, lowered by half its height.
  const UP = new T.Vector3(0, 1, 0)
  const flying = FLYING.map(([code, colour, off], i) => {
    const holder = new T.Group()
    const m = pieceMesh(code, colour)
    m.position.y = (-HEIGHT[code] * PIECE_SCALE) / 2
    holder.add(m)
    scene.add(holder)
    const o = new T.Vector3(...off)
    // Top pointing outwards (and a little up), turned about itself by chance.
    const out = o.clone().add(new T.Vector3(0, 0.5, 0)).normalize()
    const base = new T.Quaternion().setFromUnitVectors(UP, out).multiply(new T.Quaternion().setFromAxisAngle(UP, rand(0, 6.28)))
    // It rocks about an axis across the direction it was thrown.
    const rock = new T.Vector3().crossVectors(out, UP).normalize()
    if (rock.lengthSq() < 0.01) rock.set(1, 0, 0)
    return { holder, off: o, base, rock, twist: rand(0.15, 0.35) * (i % 2 ? 1 : -1), phase: rand(0, 6.28) }
  })

  // Smoke: soft grey puffs rising from the clash and drifting over the board.
  const puffTex = [11, 23, 37].map((s) => {
    const t = new T.CanvasTexture(puffCanvas(s))
    t.colorSpace = T.SRGBColorSpace
    return t
  })
  type Puff = { s: import("three").Sprite; v: import("three").Vector3; age: number; life: number; size: number; grow: number; spin: number; peak: number }
  const puffs: Puff[] = []
  const addPuff = (near: boolean) => {
    const warm = near && Math.random() < 0.6
    const mat = new T.SpriteMaterial({
      map: puffTex[Math.floor(Math.random() * 3)],
      color: warm ? 0xffc46b : 0x9a9a9a,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      rotation: rand(0, 6.28),
    })
    const s = new T.Sprite(mat)
    const r = near ? rand(0, 0.5) : rand(1, 3.6)
    const a = rand(0, 6.28)
    s.position.set(Math.cos(a) * r, near ? rand(0.6, 1.6) : rand(0.2, 0.9), Math.sin(a) * r)
    scene.add(s)
    puffs.push({ s, v: new T.Vector3(rand(-0.06, 0.06), rand(0.08, 0.22), rand(-0.06, 0.06)), age: 0, life: rand(6, 11), size: rand(1.6, 2.8), grow: rand(0.15, 0.35), spin: rand(-0.15, 0.15), peak: warm ? rand(0.22, 0.34) : rand(0.16, 0.28) })
  }

  // Sparkles: small round points of light with a crisp centre, in the site's amber and gold.
  const MAX = 420
  const pos = new Float32Array(MAX * 3)
  const vel = new Float32Array(MAX * 3)
  const col = new Float32Array(MAX * 3)
  const size = new Float32Array(MAX)
  const alpha = new Float32Array(MAX)
  const life = new Float32Array(MAX)
  const age = new Float32Array(MAX).fill(1e9)
  const kind = new Uint8Array(MAX) // 0: rising mote, 1: burst spark
  const twinkle = new Float32Array(MAX)
  const sparkGeo = new T.BufferGeometry()
  sparkGeo.setAttribute("position", new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage))
  sparkGeo.setAttribute("aColor", new T.BufferAttribute(col, 3).setUsage(T.DynamicDrawUsage))
  sparkGeo.setAttribute("aSize", new T.BufferAttribute(size, 1).setUsage(T.DynamicDrawUsage))
  sparkGeo.setAttribute("aAlpha", new T.BufferAttribute(alpha, 1).setUsage(T.DynamicDrawUsage))
  const sparkMat = new T.ShaderMaterial({
    uniforms: { uScale: { value: 1 } },
    vertexShader: `
      attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
      varying vec3 vColor; varying float vAlpha;
      uniform float uScale;
      void main() {
        vColor = aColor; vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float core = smoothstep(0.32, 0.0, d);
        float halo = pow(1.0 - d, 3.0) * 0.45;
        vec3 c = mix(vColor, vec3(1.0, 0.97, 0.9), core * 0.7);
        gl_FragColor = vec4(c * (core + halo), (core + halo) * vAlpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  })
  const sparks = new T.Points(sparkGeo, sparkMat)
  sparks.frustumCulled = false
  scene.add(sparks)
  const GOLD = [new T.Color(0xffb300), new T.Color(0xffcf66), new T.Color(0xffe7b0)]
  let cursor = 0
  const spark = (k: 0 | 1, power = 1) => {
    const i = cursor
    cursor = (cursor + 1) % MAX
    kind[i] = k
    age[i] = 0
    twinkle[i] = rand(0, 6.28)
    const c = GOLD[Math.floor(Math.random() * GOLD.length)]
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
    if (k === 0) {
      const a = rand(0, 6.28)
      const r = rand(0, 0.55)
      pos.set([CLASH_AT[0] + Math.cos(a) * r, CLASH_AT[1] - 0.4 + rand(-0.3, 0.3), CLASH_AT[2] + Math.sin(a) * r], i * 3)
      vel.set([rand(-0.08, 0.08), rand(0.18, 0.45), rand(-0.08, 0.08)], i * 3)
      life[i] = rand(2.6, 5)
      size[i] = rand(5, 9)
    } else {
      const u = rand(-1, 1)
      const a = rand(0, 6.28)
      const s = Math.sqrt(1 - u * u)
      const sp = rand(1.8, 4.2) * power
      pos.set([CLASH_AT[0] + rand(-0.15, 0.15), CLASH_AT[1] - 0.3 + rand(-0.15, 0.15), CLASH_AT[2] + rand(-0.15, 0.15)], i * 3)
      vel.set([s * Math.cos(a) * sp, Math.abs(u) * sp * 0.9 + 0.6, s * Math.sin(a) * sp], i * 3)
      life[i] = rand(0.6, 1.3)
      size[i] = rand(6, 11)
    }
  }

  // Interaction.
  const ptr = { x: 0.5, y: 0.5, inside: false }
  const drag = { down: false, x: 0, moved: 0, v: 0 }
  let charge = 0
  let burst = 0
  const onMove = (e: PointerEvent) => {
    const r = root.getBoundingClientRect()
    ptr.x = (e.clientX - r.left) / r.width
    ptr.y = (e.clientY - r.top) / r.height
    ptr.inside = e.pointerType === "mouse"
    if (drag.down) {
      const dx = e.clientX - drag.x
      drag.x = e.clientX
      drag.moved += Math.abs(dx)
      drag.v = -dx * 0.009
      theta += drag.v
    }
  }
  const onDown = (e: PointerEvent) => {
    drag.down = true
    drag.x = e.clientX
    drag.moved = 0
    drag.v = 0
    burst = 1
    for (let i = 0; i < 90; i++) spark(1, 1)
  }
  const onUp = () => {
    drag.down = false
  }
  const onLeave = () => {
    ptr.inside = false
    drag.down = false
  }
  root.addEventListener("pointermove", onMove)
  root.addEventListener("pointerdown", onDown)
  window.addEventListener("pointerup", onUp)
  root.addEventListener("pointerleave", onLeave)

  // Size.
  const resize = () => {
    const w = root.clientWidth || 1
    const h = root.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // Taller boxes need a wider view to keep the clash in frame.
    camera.fov = camera.aspect < 1.5 ? 24 : 20
    camera.updateProjectionMatrix()
    sparkMat.uniforms.uScale.value = h * renderer.getPixelRatio() * 0.06
  }
  resize()
  let ro = new ResizeObserver(resize)
  ro.observe(root)

  // The view goes once round the board a minute; the pointer tilts it.
  let theta = 0.55
  let tx = 0
  let ty = 0
  const target = new T.Vector3(0, 1.35, 0)
  const tmp = new T.Vector3()
  const q = new T.Quaternion()
  let t = 0
  let nextPulse = 3

  const step = (dt: number) => {
    t += dt
    charge += ((ptr.inside ? 1 : 0) - charge) * Math.min(1, dt * 2.5)
    burst *= Math.exp(-dt * 2.2)
    if (!drag.down) {
      drag.v *= Math.exp(-dt * 3)
      theta += drag.v + dt * ((Math.PI * 2) / 60) * (1 - charge * 0.6)
    }
    tx += ((ptr.inside ? (ptr.x - 0.5) * 0.35 : 0) - tx) * Math.min(1, dt * 3)
    ty += ((ptr.inside ? (ptr.y - 0.5) * 0.9 : 0) - ty) * Math.min(1, dt * 3)
    const R = 12.5
    const elev = 2.6 + ty * 1.6
    const a = theta + tx
    camera.position.set(Math.sin(a) * R, elev, Math.cos(a) * R)
    camera.lookAt(target)
    // Rim light: behind the pieces, opposite the camera.
    rim.position.set(-Math.sin(a) * 6, 6, -Math.cos(a) * 6)

    // The clash breathes; hovering and pressing make it flare.
    const flick = 0.88 + Math.sin(t * 8.3) * 0.06 + Math.sin(t * 21) * 0.04
    clashLight.intensity = (24 + charge * 10 + burst * 50) * flick
    floorLight.intensity = (3.5 + burst * 10) * flick
    glow.material.opacity = Math.min(1, (0.75 + charge * 0.15 + burst * 0.4) * flick)
    glow.scale.setScalar(2.0 + burst * 1.6 + charge * 0.3)
    pool.material.opacity = 0.32 + burst * 0.3

    // Flying pieces: drift, bob and turn; they move apart while the pointer is over the scene
    // and are thrown out by a press.
    const spread = 1 + charge * 0.1 + burst * 0.35
    for (const f of flying) {
      tmp.copy(f.off).multiplyScalar(spread * 0.78)
      f.holder.position.set(CLASH_AT[0] + tmp.x, CLASH_AT[1] + tmp.y + Math.sin(t * 0.8 + f.phase) * 0.06, CLASH_AT[2] + tmp.z)
      q.setFromAxisAngle(f.rock, Math.sin(t * 0.45 + f.phase) * 0.28 + burst * 0.5)
      f.holder.quaternion.copy(q).multiply(f.base)
      // Slowly spinning about its own length.
      f.holder.quaternion.multiply(q.setFromAxisAngle(UP, t * f.twist))
    }

    // Sparkles: a steady trickle of motes, more on hover, a small flare every few seconds.
    nextPulse -= dt
    if (nextPulse <= 0) {
      for (let i = 0; i < 26; i++) spark(1, 0.6)
      burst = Math.max(burst, 0.25)
      nextPulse = rand(4.5, 7)
    }
    if (Math.random() < (7 + charge * 18) * dt) spark(0)
    for (let i = 0; i < MAX; i++) {
      if (age[i] >= life[i]) {
        alpha[i] = 0
        continue
      }
      age[i] += dt
      const k = age[i] / life[i]
      const j = i * 3
      if (kind[i] === 0) {
        vel[j] += Math.sin(t * 1.3 + twinkle[i]) * 0.12 * dt
        vel[j + 2] += Math.cos(t * 1.1 + twinkle[i]) * 0.12 * dt
        alpha[i] = Math.min(1, k * 6) * (1 - k) * (0.55 + 0.45 * Math.sin(t * 7 + twinkle[i] * 3))
      } else {
        vel[j + 1] -= 3.2 * dt
        const drag2 = Math.exp(-dt * 1.6)
        vel[j] *= drag2
        vel[j + 1] *= drag2
        vel[j + 2] *= drag2
        alpha[i] = (1 - k) ** 1.5
        // Cool from white-gold to amber as they fly.
        col[j + 2] = Math.max(0, col[j + 2] - dt * 0.8)
      }
      pos[j] += vel[j] * dt
      pos[j + 1] += vel[j + 1] * dt
      pos[j + 2] += vel[j + 2] * dt
      if (pos[j + 1] < 0.02) age[i] = life[i]
    }
    for (const name of ["position", "aColor", "aSize", "aAlpha"]) sparkGeo.getAttribute(name).needsUpdate = true

    // Smoke.
    if (puffs.length < 16 && Math.random() < dt * 1.8) addPuff(Math.random() < 0.5)
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]
      p.age += dt
      if (p.age > p.life) {
        scene.remove(p.s)
        p.s.material.dispose()
        puffs.splice(i, 1)
        continue
      }
      p.s.position.addScaledVector(p.v, dt)
      p.size += p.grow * dt
      p.s.scale.setScalar(p.size)
      p.s.material.rotation += p.spin * dt
      p.s.material.opacity = p.peak * Math.sin(Math.PI * (p.age / p.life))
    }
  }

  // Before the first frame: some smoke and motes already in the air.
  for (let i = 0; i < 10; i++) addPuff(i % 2 === 0)
  for (let i = 0; i < 90; i++) step(1 / 30)
  burst = 0
  renderer.render(scene, camera)
  onReady()

  let raf = 0
  let last = 0
  let visible = true
  const frameFn = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
    last = now
    step(dt)
    renderer.render(scene, camera)
    raf = requestAnimationFrame(frameFn)
  }
  const run = () => {
    cancelAnimationFrame(raf)
    if (!still && visible && !document.hidden) {
      last = 0
      raf = requestAnimationFrame(frameFn)
    }
  }
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    run()
  })
  io.observe(root)
  document.addEventListener("visibilitychange", run)
  if (still) {
    // A still picture: redraw only when the size changes.
    ro.disconnect()
    ro = new ResizeObserver(() => {
      resize()
      renderer.render(scene, camera)
    })
    ro.observe(root)
  }
  run()

  return {
    dragged: () => drag.moved > 8,
    stop: () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener("visibilitychange", run)
      root.removeEventListener("pointermove", onMove)
      root.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointerup", onUp)
      root.removeEventListener("pointerleave", onLeave)
      scene.traverse((o) => {
        const m = o as import("three").Mesh
        m.geometry?.dispose()
        const mat = m.material as import("three").Material | undefined
        mat?.dispose()
      })
      pmrem.dispose()
      renderer.dispose()
    },
  }
}
