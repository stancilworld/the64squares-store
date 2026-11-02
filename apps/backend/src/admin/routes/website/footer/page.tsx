import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Sparkles } from "@medusajs/icons"
import { ContentEditor, type SectionConfig } from "../../../lib/content-editor"

const SECTIONS: SectionConfig[] = [
  {
    key: "footer_media",
    name: "Footer animation",
    help: "Plays in the square on the left of the footer on every page. Without one, the footer shows The64Squares logo.",
    fields: ["image_url"],
    many: false,
    allowVideo: true,
    labels: { image_url: "Animation or picture (MP4, WebM, GIF, WebP, PNG, JPG or SVG)" },
    recommended: {
      width: 720,
      height: 720,
      note: "Square. Videos play silently on a loop; under 5 MB loads fast on phones",
    },
  },
]

const FooterPage = () => (
  <ContentEditor
    page="site"
    title="Footer"
    intro="Things shown in the footer on every page."
    sections={SECTIONS}
  />
)

export const config = defineRouteConfig({
  label: "Footer animation",
  icon: Sparkles,
  rank: 5,
})

export default FooterPage
