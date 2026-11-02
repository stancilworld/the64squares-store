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
  product_count?: number
}

export type ContentSection = string

export type ContentBlock = {
  id: string
  page: string
  section: ContentSection
  eyebrow: string | null
  title: string | null
  body: string | null
  image_url: string | null
  link_label: string | null
  link_url: string | null
  rank: number
  is_active: boolean
  // Unpublished changes ("Save draft") and when they publish by themselves.
  draft?: Partial<Omit<ContentBlock, "id" | "page" | "section" | "draft" | "publish_at" | "updated_at">> | null
  publish_at?: string | null
  show_from?: string | null
  show_until?: string | null
  updated_at?: string
}

export type Post = {
  id: string
  title: string
  handle: string
  excerpt: string | null
  body: string
  cover_url: string | null
  thumbnail_url: string | null
  author: string
  status: "draft" | "published"
  published_at: string | null
  created_at: string
}

export type SitePage = {
  id: string
  handle: string
  title: string
  body: string
  is_published: boolean
  rank: number
  updated_at: string
}
