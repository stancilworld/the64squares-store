import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Users } from "@medusajs/icons"
import { ContentEditor, type SectionConfig } from "../../../lib/content-editor"
import { TeamEditor } from "../../../lib/team-editor"

const SECTIONS: SectionConfig[] = [
  {
    key: "intro",
    name: "Who are we?",
    help: "The heading at the top of the page, then a full-width picture with your company text on its left.",
    fields: ["title", "body", "image_url"],
    many: false,
    labels: {
      body: "Company text (shown on the left, over the picture)",
      image_url: "Full-width picture behind the text (picture, GIF or video)",
    },
    hints: {
      body: "Leave an empty line between paragraphs. A single line break starts a new line (like Mission / Vision).",
    },
    recommended: {
      width: 2880,
      height: 856,
      note: "Fills the whole screen width. The text sits on the left, so keep that side plain; phones show a taller middle part",
    },
  },
  {
    key: "team",
    name: "Meet our team",
    help: "The heading above the team faces. The wide photo is only shown when no team faces are added below.",
    fields: ["title", "image_url"],
    many: false,
    recommended: { width: 2192, height: 860, note: "Phones show a thin strip, so keep faces in the middle" },
  },
  {
    key: "contact",
    name: "Get in touch",
    help: "The large text with a picture and the Email us button.",
    fields: ["title", "body", "image_url", "link_label", "link_url"],
    many: false,
    recommended: { width: 984, height: 1282 },
    labels: {
      title: "First paragraph",
      body: "Second paragraph",
      link_url: "Button link (mailto:you@the64squares.in opens an email)",
    },
  },
]

const AboutUsPage = () => (
  <div className="flex flex-col gap-y-3">
    <ContentEditor
      page="about"
      sitePath="/about"
      title="About us"
      intro="Edit the About us page. The newsletter section at the bottom is shared with the homepage."
      sections={SECTIONS}
    />
    <TeamEditor />
  </div>
)

export const config = defineRouteConfig({
  label: "About us",
  icon: Users,
  rank: 2,
})

export default AboutUsPage
