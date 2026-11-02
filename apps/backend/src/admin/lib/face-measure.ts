// Measures a team face picture right after it is picked, in the browser.
//
// The pictures are exported from one group canvas (same size for everyone, transparent,
// each person in their place). This finds where the drawn part sits on the canvas (`box`)
// and a coarse outline (`mask`), so the website lights up exactly the face under the mouse.

export const MASK_SIZE = 40

export type FaceBox = { x: number; y: number; width: number; height: number }
export type FaceMeasure = {
  canvas_width: number
  canvas_height: number
  box: FaceBox
  mask: string
  // False when the picture has no see-through background (the whole picture then reacts).
  transparent: boolean
}

const ALPHA = 24

export const measureFace = async (file: File): Promise<FaceMeasure> => {
  const bitmap = await createImageBitmap(file)
  const W = bitmap.width
  const H = bitmap.height
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  const data = ctx.getImageData(0, 0, W, H).data

  // Bounding box of the drawn pixels.
  let minX = W
  let minY = H
  let maxX = -1
  let maxY = -1
  let seeThrough = 0
  for (let y = 0; y < H; y++) {
    const row = y * W * 4
    for (let x = 0; x < W; x++) {
      const a = data[row + x * 4 + 3]
      if (a > ALPHA) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      } else {
        seeThrough++
      }
    }
  }
  const transparent = seeThrough > W * H * 0.05 && maxX >= 0
  if (!transparent) {
    return {
      canvas_width: W,
      canvas_height: H,
      box: { x: 0, y: 0, width: W, height: H },
      mask: "1".repeat(MASK_SIZE * MASK_SIZE),
      transparent: false,
    }
  }
  const box = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }

  // Coarse grid over the box: a cell is "drawn" if any pixel in it is drawn.
  const N = MASK_SIZE
  const cells = new Uint8Array(N * N)
  for (let y = box.y; y < box.y + box.height; y++) {
    const cy = Math.min(N - 1, Math.floor(((y - box.y) / box.height) * N))
    const row = y * W * 4
    for (let x = box.x; x < box.x + box.width; x++) {
      if (data[row + x * 4 + 3] > ALPHA) {
        const cx = Math.min(N - 1, Math.floor(((x - box.x) / box.width) * N))
        cells[cy * N + cx] = 1
      }
    }
  }

  // Line drawings are see-through inside the face, so fill everything the outline encloses:
  // flood the empty cells from the edges; empty cells the flood cannot reach are inside.
  const outside = new Uint8Array(N * N)
  const stack: number[] = []
  const push = (i: number) => {
    if (!cells[i] && !outside[i]) {
      outside[i] = 1
      stack.push(i)
    }
  }
  for (let i = 0; i < N; i++) {
    push(i)
    push((N - 1) * N + i)
    push(i * N)
    push(i * N + N - 1)
  }
  while (stack.length) {
    const i = stack.pop()!
    const x = i % N
    const y = (i - x) / N
    if (x > 0) push(i - 1)
    if (x < N - 1) push(i + 1)
    if (y > 0) push(i - N)
    if (y < N - 1) push(i + N)
  }
  let mask = ""
  for (let i = 0; i < N * N; i++) {
    mask += cells[i] || !outside[i] ? "1" : "0"
  }

  bitmap.close()
  return { canvas_width: W, canvas_height: H, box, mask, transparent: true }
}
