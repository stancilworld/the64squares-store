import sharp from "sharp"
import { isHeic, optimiseImage, UnreadableImageError, webpName } from "../image-convert"

// Builds a small picture in memory.
const picture = (width: number, height: number, format: "jpeg" | "png" | "webp", opts: { orientation?: number } = {}) => {
  let s = sharp({ create: { width, height, channels: 3, background: { r: 180, g: 120, b: 60 } } })
  if (opts.orientation) s = s.withMetadata({ orientation: opts.orientation })
  return s.toFormat(format).toBuffer()
}

describe("image conversion", () => {
  it("shrinks a big photo to 2000 px and saves it as WebP", async () => {
    const out = await optimiseImage({ name: "board.JPG", mime: "image/jpeg", buffer: await picture(4032, 3024, "jpeg") })
    const meta = await sharp(out.buffer).metadata()
    expect(out).toMatchObject({ name: "board.webp", mime: "image/webp", converted: true })
    expect(meta.format).toBe("webp")
    expect(Math.max(meta.width!, meta.height!)).toBe(2000)
    expect(meta.exif).toBeUndefined()
  })

  it("turns a sideways phone photo the right way up", async () => {
    // Orientation 6: stored 300x200, meant to be shown as 200x300.
    const out = await optimiseImage({ name: "side.jpg", buffer: await picture(300, 200, "jpeg", { orientation: 6 }) })
    const meta = await sharp(out.buffer).metadata()
    expect([meta.width, meta.height]).toEqual([200, 300])
  })

  it("does not enlarge small photos", async () => {
    const out = await optimiseImage({ name: "small.jpg", buffer: await picture(800, 600, "jpeg") })
    const meta = await sharp(out.buffer).metadata()
    expect([meta.width, meta.height]).toEqual([800, 600])
  })

  it("keeps small PNG graphics such as logos unchanged", async () => {
    const buffer = await picture(400, 120, "png")
    const out = await optimiseImage({ name: "logo.png", mime: "image/png", buffer })
    expect(out.converted).toBe(false)
    expect(out.buffer).toBe(buffer)
  })

  it("leaves GIFs, SVGs and videos alone", async () => {
    for (const name of ["spin.gif", "logo.svg", "clip.mp4"]) {
      const buffer = Buffer.from("not touched")
      const out = await optimiseImage({ name, buffer })
      expect(out.converted).toBe(false)
      expect(out.buffer).toBe(buffer)
    }
  })

  it("recognises HEIC by name, type or file contents", () => {
    const heicBytes = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(16)])
    expect(isHeic({ name: "IMG_0001.HEIC", buffer: Buffer.alloc(0) })).toBe(true)
    expect(isHeic({ name: "photo", mime: "image/heif", buffer: Buffer.alloc(0) })).toBe(true)
    expect(isHeic({ name: "photo.bin", buffer: heicBytes })).toBe(true)
    expect(isHeic({ name: "photo.jpg", buffer: Buffer.from("plain jpeg") })).toBe(false)
  })

  it("explains when a file isn't a readable picture", async () => {
    await expect(optimiseImage({ name: "broken.jpg", buffer: Buffer.from("nope") })).rejects.toBeInstanceOf(UnreadableImageError)
  })

  it("renames files to .webp", () => {
    expect(webpName("IMG_0001.HEIC")).toBe("IMG_0001.webp")
    expect(webpName("chess set.final.jpeg")).toBe("chess set.final.webp")
  })
})

describe("banner size", () => {
  it("lets banners keep up to 3000 px", async () => {
    const buffer = await sharp({ create: { width: 3600, height: 1400, channels: 3, background: "#888" } }).jpeg().toBuffer()
    const out = await optimiseImage({ name: "hero.jpg", buffer }, { maxSide: 3000 })
    expect((await sharp(out.buffer).metadata()).width).toBe(3000)
  })
})
