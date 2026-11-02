export type Character = {
  id: string
  name: string
  handle: string
  greeting: string
  tagline: string | null
  story: string | null
  image_url: string | null
  banner_url: string | null
  collection_title: string | null
  status: "live" | "coming_soon"
  coming_soon_text: string
  rank: number
  product_ids: string[]
}

export type ContentBlock = {
  id: string
  section: string
  eyebrow: string | null
  title: string | null
  body: string | null
  image_url: string | null
  link_label: string | null
  link_url: string | null
  rank: number
}

export type Category = { id: string; name: string; handle: string }

export type ProductCard = {
  id: string
  title: string
  handle: string
  thumbnail: string | null
  price: number | null
  maxPrice: number | null
  colours: string[]
  materials: string[]
  categoryIds: string[]
  characterId: string | null
  inStock: boolean
  badge: { text: string; colour: "black" | "red" | "yellow" | "blue" } | null
}

export type PostSummary = {
  title: string
  handle: string
  excerpt: string | null
  thumbnail_url: string | null
  cover_url: string | null
  author: string
  published_at: string | null
}

export type Post = PostSummary & { body: string }

export type SitePage = { handle: string; title: string; body: string }

// A face in "Meet our team" (About us). Pictures share one group canvas; box/mask are in
// canvas pixels and mark where the face is drawn.
export type TeamMember = {
  id: string
  name: string
  role: string | null
  image_url: string
  color_image_url: string | null
  canvas_width: number | null
  canvas_height: number | null
  box: { x: number; y: number; width: number; height: number } | null
  mask: string | null
}

// Contact page (admin → Website → Contact page).
export type ContactFieldType = "text" | "email" | "phone" | "textarea" | "select" | "radio" | "checkbox" | "checkboxes" | "date" | "number"
export type ContactField = {
  id: string
  type: ContactFieldType
  label: string
  placeholder: string
  help: string
  required: boolean
  options: string[]
  width: "full" | "half"
}
export type ContactPanelItem = {
  id: string
  type: "email" | "phone" | "whatsapp" | "instagram" | "hours" | "address" | "link" | "text"
  label: string
  value: string
  button_label: string
  message: string
}
export type ContactPage = {
  title: string
  intro: string
  panel_title: string
  panel: ContactPanelItem[]
  form_title: string
  submit_label: string
  success_title: string
  success_text: string
  fields: ContactField[]
}

// The chat bubble (admin → Website → Chat bot).
export type ChatbotConfig = {
  enabled: boolean
  // The character who greets shoppers (artwork + "Hi! I am Bella"), or null for the logo.
  host: { name: string; greeting: string; image: string; handle: string } | null
  name: string
  greeting: string
  launcher_label: string
  placeholder: string
  quick: { id: string; label: string; action: "track" | "products" | "human" | "ask"; value: string }[]
  whatsapp: string
  whatsapp_message: string
  allow_message: boolean
  away_text: string
  hide_on: string[]
}
export type ChatProduct = { handle: string; title: string; thumbnail: string | null; price: number | null }
export type ChatReply = {
  text: string
  source: string
  products?: ChatProduct[]
  actions?: ("track" | "human")[]
}
export type ChatOrder = {
  display_id: number
  created_at: string
  step: "placed" | "packed" | "shipped" | "delivered" | "canceled"
  step_text: string
  items: { title: string; quantity: number }[]
  tracking: { number?: string; url?: string }[]
  url: string
}
