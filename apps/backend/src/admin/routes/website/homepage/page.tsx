import { defineRouteConfig } from "@medusajs/admin-sdk"
import { House } from "@medusajs/icons"
import { ContentEditor, type SectionConfig } from "../../../lib/content-editor"

const HEADING_HINT =
  "Type it the way it should look: capital letters look different in the heading font. A comma followed by a space starts a new line."

// The homepage sections, in the order they appear on the page.
const SECTIONS: SectionConfig[] = [
  {
    key: "hero",
    name: "Banner",
    help: "The big banner at the top of the homepage.",
    fields: ["title", "body", "image_url", "link_label", "link_url"],
    many: false,
    labels: { image_url: "Background (picture, GIF or video) filling the whole banner" },
    hints: { title: HEADING_HINT },
    recommended: {
      width: 2880,
      height: 1114,
      note: "The heading sits on the left, so keep that side calm. Phones show only the middle",
    },
  },
  {
    key: "featured_collection",
    name: "Featured collection",
    help: "Text beside the image carousel.",
    fields: ["eyebrow", "title", "body", "link_label", "link_url"],
    many: false,
    hints: { title: HEADING_HINT },
  },
  {
    key: "featured_image",
    name: "Featured collection images",
    help: "The pictures in the carousel, browsed with the arrows.",
    fields: ["image_url"],
    many: true,
    recommended: { width: 1350, height: 974 },
  },
  {
    key: "gang_band",
    name: "Do you like our cool gang?",
    help: "The grey band with the Sign up button.",
    fields: ["title", "image_url", "link_label", "link_url"],
    many: false,
    labels: { image_url: "Background (picture, GIF or video) filling the whole band" },
    hints: { title: HEADING_HINT },
    recommended: {
      width: 2880,
      height: 856,
      note: "The heading sits on the left half, so keep that side calm. Phones show only the middle",
    },
  },
  {
    key: "newsletter",
    name: "Newsletter",
    help: "The sign-up section above the footer. It also appears on About us (without the picture).",
    fields: ["title", "body", "link_label", "image_url"],
    many: false,
    labels: { image_url: "Picture peeking over the footer (homepage only)" },
    recommended: {
      width: 1164,
      height: 568,
      note: "PNG or WebP with a see-through background; the bottom edge sits on the footer",
    },
  },
]

const HomepagePage = () => (
  <ContentEditor
    page="home"
    title="Homepage"
    intro="Edit every section of the homepage. Changes appear on the website within a minute."
    sections={SECTIONS}
  />
)

export const config = defineRouteConfig({
  label: "Homepage",
  icon: House,
  rank: 1,
})

export default HomepagePage
