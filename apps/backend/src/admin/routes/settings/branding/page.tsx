import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ContentEditor, type SectionConfig } from "../../../lib/content-editor"

const SECTIONS: SectionConfig[] = [
  {
    key: "admin_logo",
    name: "Admin sign-in logo",
    help: "Shown at the top of the admin sign-in page. Without one, The 64 Squares logo is used.",
    fields: ["image_url"],
    many: false,
    allowVideo: false,
    labels: { image_url: "Logo (PNG, WebP, JPG or SVG)" },
    recommended: {
      width: 480,
      height: 480,
      anyShape: true,
      note: "Any shape works; it is shown up to 240 px wide and 112 px tall. Use a see-through background",
    },
  },
]

const BrandingPage = () => (
  <ContentEditor
    page="site"
    title="Branding"
    intro="The The 64 Squares logo used in the admin. Changes show the next time the sign-in page opens."
    sections={SECTIONS}
  />
)

export const config = defineRouteConfig({
  label: "Branding",
  rank: 2,
})

export default BrandingPage
