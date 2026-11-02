import { model } from "@medusajs/framework/utils"

// One editable piece of page content, e.g. the homepage banner or a "Why Stancil" point.
// `section` is a free key (hero, why_point, featured_image, intro, team, contact...) so new
// page sections can be added in the admin config without a database change.
const ContentBlock = model.define("content_block", {
  id: model.id({ prefix: "cblk" }).primaryKey(),
  page: model.text().default("home"),
  section: model.text(),
  eyebrow: model.text().nullable(),
  title: model.text().nullable(),
  body: model.text().nullable(),
  image_url: model.text().nullable(),
  link_label: model.text().nullable(),
  link_url: model.text().nullable(),
  rank: model.number().default(0),
  is_active: model.boolean().default(true),
  // Saved but not yet on the website: the field values to publish ({ title, body, …, is_active }).
  draft: model.json().nullable(),
  // When set, the draft is published automatically at this time (jobs/publish-scheduled.ts).
  publish_at: model.dateTime().nullable(),
  // Optional window: only shown on the website between these times.
  show_from: model.dateTime().nullable(),
  show_until: model.dateTime().nullable(),
})

export default ContentBlock
