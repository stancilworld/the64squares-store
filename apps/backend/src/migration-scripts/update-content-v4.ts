import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"

// The company text shown over the "Who are we?" picture on About us (October 2026).
const COMPANY_TEXT = `Children have a language of their own.

Before they know how to write, they're already drawing, making and telling stories in their own way. We wanted to build a brand that speaks to that instinct.

That's where StAncil comes in.
We believe the things children surround themselves with should become part of the world they understand. So we make furniture and objects for children, and build stories around them in a way that feels natural.

We want to make things they can grow with, learn from and, most importantly, belong in their world.

Mission: We create furniture and objects that make sense only in a child's world.
Vision: To make the world around children more imaginative, curious and full of possibility.`

/**
 * Puts the company text into About us → Who are we?. Only replaces the old draft text
 * (or an empty field), so anything already written in the admin is left alone. Runs once.
 */
export default async function update_content_v4({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)

  const [intro] = await content.listContentBlocks({ page: "about", section: "intro" })
  if (!intro) {
    logger.info("No About us intro block; skipping company text.")
    return
  }
  const body = intro.body?.trim() ?? ""
  if (!body || body.startsWith("Stancil makes furniture for little people")) {
    await content.updateContentBlocks({ id: intro.id, body: COMPANY_TEXT })
    logger.info("About us: company text added to Who are we?.")
  } else {
    logger.info("About us: Who are we? text was already edited; left as is.")
  }
}
