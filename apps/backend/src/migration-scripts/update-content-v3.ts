import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BELLA_HI_WEBP_BASE64 } from "../data/bella-hi"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"

/**
 * Content for the Figma homepage update (October 2026):
 * - "Why Stancil?" is no longer on the homepage (its items are hidden, not deleted).
 * - New "Do you like our cool gang?" band with a Sign up button.
 * - Bella waving above the footer, next to the newsletter (uploaded as a normal file
 *   so it can be swapped in the admin).
 * - An empty footer animation slot, editable under Footer in the admin.
 *
 * Runs once. Anything already edited in the admin is left alone.
 */
export default async function update_content_v3({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)
  const files = container.resolve(Modules.FILE)

  logger.info("Updating homepage content for the Figma update...")

  const home = await content.listContentBlocks({ page: "home" })

  const why = home.filter((b) => b.section === "why_point" && b.is_active)
  if (why.length) {
    await content.updateContentBlocks(why.map((b) => ({ id: b.id, is_active: false })))
  }

  if (!home.some((b) => b.section === "gang_band")) {
    await content.createContentBlocks({
      page: "home",
      section: "gang_band",
      title: "Do you like our cool gang?",
      link_label: "Sign up",
      link_url: "/account?create=1",
    })
  }

  const newsletter = home.find((b) => b.section === "newsletter")
  if (newsletter && !newsletter.image_url) {
    const [file] = await files.createFiles([
      {
        filename: "bella-hi.webp",
        mimeType: "image/webp",
        content: BELLA_HI_WEBP_BASE64,
        access: "public",
      },
    ])
    await content.updateContentBlocks({ id: newsletter.id, image_url: file.url })
  }

  const site = await content.listContentBlocks({ page: "site", section: "footer_media" })
  if (!site.length) {
    await content.createContentBlocks({ page: "site", section: "footer_media" })
  }

  logger.info("Homepage content updated.")
}
