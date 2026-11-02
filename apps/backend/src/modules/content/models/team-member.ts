import { model } from "@medusajs/framework/utils"

// One face in the "Meet our team" section on About us. Both pictures are exported from the
// same group canvas (same size, transparent, the person in their place), so stacking every
// member's picture rebuilds the group picture. The admin measures the face when the picture
// is uploaded: `box` is where the face sits on the canvas and `mask` marks the drawn pixels,
// so hovering a face lights up exactly that person even where faces overlap.
const TeamMember = model.define("team_member", {
  id: model.id({ prefix: "tm" }).primaryKey(),
  name: model.text(),
  role: model.text().nullable(),
  image_url: model.text().nullable(),
  color_image_url: model.text().nullable(),
  canvas_width: model.number().nullable(),
  canvas_height: model.number().nullable(),
  // { x, y, width, height } in canvas pixels.
  box: model.json().nullable(),
  // Drawn/empty grid over `box`, as a string of "0" and "1" (MASK_SIZE × MASK_SIZE).
  mask: model.text().nullable(),
  rank: model.number().default(0),
  is_active: model.boolean().default(true),
})

export default TeamMember
