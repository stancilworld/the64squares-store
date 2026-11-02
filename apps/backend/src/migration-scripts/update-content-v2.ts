import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BLOG_MODULE } from "../modules/blog"
import BlogModuleService from "../modules/blog/service"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"

/**
 * Content for the October 2026 designs (homepage v2, About us, blog, help pages).
 *
 * - Homepage: one banner instead of a slider, a featured-collection image carousel,
 *   no product row, and headings typed in the designer's capitalisation (the heading
 *   font draws capitals differently from small letters).
 * - About us, help pages and three SAMPLE blog posts, all editable in the admin.
 *
 * Runs once. Text that someone already changed in the admin is left alone.
 */

const DEFAULTS_V1: Record<string, string> = {
  "why stancil ?": "Why Stancil ?",
  "a little inspiration in your inbox...": "A Little Inspiration in your inbox...",
  "hello friends, Meet Bella...": "Hello Friends, Meet Bella...",
  "a corner for every little story": "Meet our First Collection",
}

const PAGES = [
  {
    handle: "delivery-and-assembly",
    title: "Delivery & assembly",
    rank: 0,
    body: `## Delivery

Delivery is free on every order, anywhere we deliver in India. Orders are shipped with Delhivery, and you get a tracking link by email as soon as your furniture leaves our workshop.

## Assembly

Every piece comes with simple picture instructions. Most pieces need no tools at all; the few that do include everything you need in the box.

*This page is a draft. Edit it in the admin under Help pages.*`,
  },
  {
    handle: "returns-and-warranty",
    title: "Returns & warranty",
    rank: 1,
    body: `## Returns

Write your returns policy here: how many days customers have, what condition items must be in, and how to start a return.

## Warranty

Write your warranty here: how long it lasts and what it covers.

*This page is a draft. Edit it in the admin under Help pages.*`,
  },
  {
    handle: "faqs",
    title: "FAQs",
    rank: 2,
    body: `## Is delivery free?

Yes, delivery is free on every order.

## Can I pay cash on delivery?

Yes, Cash on Delivery is available wherever our delivery partner offers it. You will see it at checkout.

## Do I get a GST invoice?

Yes, every order comes with a GST invoice.

*Add more questions in the admin under Help pages.*`,
  },
  {
    handle: "privacy",
    title: "Privacy",
    rank: 3,
    body: `Write your privacy policy here. It should explain what personal information you collect (name, address, phone, email), why, who you share it with (payment and delivery partners) and how customers can contact you about it.

*This page is a draft. Have it reviewed before launch.*`,
  },
  {
    handle: "terms",
    title: "Terms",
    rank: 4,
    body: `Write your terms and conditions here.

*This page is a draft. Have it reviewed before launch.*`,
  },
  {
    handle: "contact",
    title: "Contact",
    rank: 5,
    body: `We would love to hear from you.

**Email:** [hello@stancil.in](mailto:hello@stancil.in)

*Update the contact details in the admin under Help pages.*`,
  },
]

const SAMPLE_BODY = `Every Stancil piece starts with a character and a story. Before we draw a single line of furniture, we ask what our friend would love to do: build, read, paint, hide, climb.

Bella loves to build. So her furniture is sturdy enough for a busy little builder, low enough for small hands to reach, and soft at every edge.

## Made for little stories

We test every piece with real children (and their very honest opinions). If it is not fun, it goes back to the drawing board.

*This is a SAMPLE post. Edit or delete it in the admin under Blog.*`

export default async function update_content_v2({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)
  const blog: BlogModuleService = container.resolve(BLOG_MODULE)

  logger.info("Updating site content for the new designs...")

  // Homepage: keep the first banner, retire the other slides and the product row.
  const home = await content.listContentBlocks({ page: "home" })
  const slides = home
    .filter((b) => b.section === "hero_slide")
    .sort((a, b) => a.rank - b.rank)
  if (slides.length) {
    await content.updateContentBlocks({ id: slides[0].id, section: "hero" })
    if (slides.length > 1) {
      await content.softDeleteContentBlocks(slides.slice(1).map((s) => s.id))
    }
  }
  const productRows = home.filter((b) => b.section === "product_row")
  if (productRows.length) {
    await content.softDeleteContentBlocks(productRows.map((b) => b.id))
  }
  for (const block of home) {
    const next = block.title ? DEFAULTS_V1[block.title] : undefined
    if (next && !(block.section === "hero_slide" && block.id !== slides[0]?.id)) {
      await content.updateContentBlocks({ id: block.id, title: next })
    }
  }
  if (!home.some((b) => b.section === "featured_image")) {
    await content.createContentBlocks(
      [0, 1, 2].map((rank) => ({ page: "home", section: "featured_image", rank }))
    )
  }

  // About us.
  const about = await content.listContentBlocks({ page: "about" })
  if (!about.length) {
    await content.createContentBlocks([
      {
        page: "about",
        section: "intro",
        title: "Who are we?",
        body: "Stancil makes furniture for little people, led by a gang of characters. Bella the Builder is the first; Ollie and Stella are on their way.\n\nEvery piece is designed around how children really play: low, sturdy, soft at the edges and bright enough to spark a story. We build it to last long enough to be handed down.\n\n(Draft text. Edit it in the admin under About us.)",
      },
      { page: "about", section: "team", title: "Meet Our Team" },
      {
        page: "about",
        section: "contact",
        title: "Do you Have more Question about us ? We are always happy to hear back from you.",
        body: "Please feel free to drop an e-mail anytime",
        link_label: "Email us",
        link_url: "mailto:hello@stancil.in",
      },
    ])
  }

  // Help pages.
  const existingPages = await content.listPages({ handle: PAGES.map((p) => p.handle) })
  const have = new Set(existingPages.map((p) => p.handle))
  const missing = PAGES.filter((p) => !have.has(p.handle))
  if (missing.length) {
    await content.createPages(missing)
  }

  // Sample blog posts.
  const [, postCount] = await blog.listAndCountPosts({}, { take: 1 })
  if (!postCount) {
    const day = 24 * 60 * 60 * 1000
    await blog.createPosts(
      [
        "Meet Bella, our very first friend",
        "Why every Stancil corner is rounded",
        "A corner for every little story",
      ].map((title, i) => ({
        title,
        handle: title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        excerpt: null,
        body: SAMPLE_BODY,
        author: "Team Stancil",
        status: "published" as const,
        published_at: new Date(Date.now() - i * 7 * day),
      }))
    )
  }

  logger.info("Site content updated.")
}
