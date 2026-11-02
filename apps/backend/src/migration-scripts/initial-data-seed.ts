import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createCollectionsWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductOptionsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"

/**
 * First-run setup for The 64 Squares store: India region in INR with GST, an Indian
 * warehouse, free delivery, chess categories, SAMPLE products, homepage, About us
 * and help pages.
 *
 * Sample product names, prices and sizes are placeholders until the real product
 * list arrives; edit or delete them in the admin.
 */

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "hello@the64squares.in"

const COLOURS = ["Natural", "Walnut", "Ebony Black"]
const MATERIALS = ["Sheesham Wood", "Boxwood", "Rosewood", "Vinyl", "ABS Plastic"]

const CATEGORIES = [
  "Chess Sets",
  "Chess Boards",
  "Chess Pieces",
  "Chess Clocks",
  "Books",
  "Accessories",
]

type SampleProduct = {
  title: string
  handle: string
  category: string
  description: string
  rupees: number
  weight: number
  length: number
  width: number
  height: number
  colours: string[]
  materials: string[]
}

const SAMPLE = "Sample product: replace with real details."

const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    title: "Classic Staunton Chess Set",
    handle: "classic-staunton-chess-set",
    category: "Chess Sets",
    description: `A hand-carved Staunton set with a 3.75-inch king and a matching wooden board. ${SAMPLE}`,
    rupees: 4999,
    weight: 2500,
    length: 45,
    width: 45,
    height: 8,
    colours: ["Natural", "Walnut"],
    materials: ["Sheesham Wood", "Rosewood"],
  },
  {
    title: "Travel Magnetic Chess Set",
    handle: "travel-magnetic-chess-set",
    category: "Chess Sets",
    description: `A folding magnetic set that keeps every piece in place on trains and planes. ${SAMPLE}`,
    rupees: 1299,
    weight: 600,
    length: 25,
    width: 25,
    height: 4,
    colours: ["Natural", "Ebony Black"],
    materials: ["Sheesham Wood"],
  },
  {
    title: "Walnut Folding Chess Board",
    handle: "walnut-folding-chess-board",
    category: "Chess Boards",
    description: `A 16-inch folding board with 2-inch squares and felt-lined storage inside. ${SAMPLE}`,
    rupees: 2499,
    weight: 1500,
    length: 41,
    width: 41,
    height: 5,
    colours: ["Walnut"],
    materials: ["Sheesham Wood"],
  },
  {
    title: "Tournament Roll-up Board",
    handle: "tournament-roll-up-board",
    category: "Chess Boards",
    description: `The standard club and tournament board: 20 inches, roll-up, wipe-clean. ${SAMPLE}`,
    rupees: 899,
    weight: 300,
    length: 51,
    width: 51,
    height: 1,
    colours: ["Natural", "Ebony Black"],
    materials: ["Vinyl"],
  },
  {
    title: "Weighted Staunton Pieces",
    handle: "weighted-staunton-pieces",
    category: "Chess Pieces",
    description: `Double-weighted, felted pieces with a 3.75-inch king, sized for a 2-inch square board. ${SAMPLE}`,
    rupees: 2999,
    weight: 1200,
    length: 25,
    width: 18,
    height: 10,
    colours: ["Natural", "Ebony Black"],
    materials: ["Boxwood", "Rosewood"],
  },
  {
    title: "Digital Tournament Chess Clock",
    handle: "digital-tournament-chess-clock",
    category: "Chess Clocks",
    description: `FIDE-style increment and delay modes, large display, two-year battery life. ${SAMPLE}`,
    rupees: 1999,
    weight: 400,
    length: 18,
    width: 7,
    height: 10,
    colours: ["Ebony Black"],
    materials: ["ABS Plastic"],
  },
]

export default async function initial_data_seed({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT
  )
  const contentService: ContentModuleService = container.resolve(CONTENT_MODULE)

  logger.info("Seeding The 64 Squares store...")

  const {
    result: [salesChannel],
  } = await createSalesChannelsWorkflow(container).run({
    input: {
      salesChannelsData: [
        { name: "The 64 Squares Website", description: "the64squares.in storefront" },
      ],
    },
  })

  const {
    result: [publishableApiKey],
  } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        { title: "The 64 Squares Storefront", type: "publishable", created_by: "" },
      ],
    },
  })

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: publishableApiKey.id, add: [salesChannel.id] },
  })

  await createStoresWorkflow(container).run({
    input: {
      stores: [
        {
          name: "The 64 Squares",
          supported_currencies: [
            { currency_code: "inr", is_default: true, is_tax_inclusive: true },
          ],
          default_sales_channel_id: salesChannel.id,
        },
      ],
    },
  })

  // India, rupees. Cash on Delivery is Medusa's system provider, plus Razorpay. (These
  // scripts run in name order, so checkout-v1 runs before this region exists.)
  const paymentProviders = await container
    .resolve(Modules.PAYMENT)
    .listPaymentProviders({}, { select: ["id"] })
  const regionProviders = ["pp_system_default", "pp_razorpay_razorpay"].filter((id) =>
    paymentProviders.some((p) => p.id === id)
  )
  const {
    result: [region],
  } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "India",
          currency_code: "inr",
          countries: ["in"],
          payment_providers: regionProviders,
          is_tax_inclusive: true,
        },
      ],
    },
  })

  // Chess sets, boards and clocks (HSN 9504) are set to 18% GST here; confirm the
  // rate with the accountant before launch and change it in the admin if needed.
  await createTaxRegionsWorkflow(container).run({
    input: [
      {
        country_code: "in",
        provider_id: "tp_system",
        default_tax_rate: { rate: 18, name: "GST", code: "GST18" },
      },
    ],
  })

  const {
    result: [warehouse],
  } = await createStockLocationsWorkflow(container).run({
    input: {
      locations: [
        {
          name: "The 64 Squares Warehouse",
          address: {
            address_1: "Pickup address to be confirmed",
            city: "",
            country_code: "IN",
          },
        },
      ],
    },
  })

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: warehouse.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  })

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfile = shippingProfiles[0]

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "India delivery",
    type: "shipping",
    service_zones: [
      {
        name: "India",
        geo_zones: [{ country_code: "in", type: "country" }],
      },
    ],
  })

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: warehouse.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  })

  // Free delivery on every order, shipped with Delhivery.
  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard delivery",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Delivered by Delhivery in 3-7 days.",
          code: "standard",
        },
        prices: [
          { currency_code: "inr", amount: 0 },
          { region_id: region.id, amount: 0 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  })

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: warehouse.id, add: [salesChannel.id] },
  })

  logger.info("Seeding catalogue...")

  const { result: categories } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: CATEGORIES.map((name, i) => ({
        name,
        is_active: true,
        rank: i,
      })),
    },
  })

  const {
    result: [signature],
  } = await createCollectionsWorkflow(container).run({
    input: {
      collections: [{ title: "Signature Collection", handle: "signature-collection" }],
    },
  })

  const { result: options } = await createProductOptionsWorkflow(container).run(
    {
      input: {
        product_options: [
          { title: "Colour", values: COLOURS },
          { title: "Material", values: MATERIALS },
        ],
      },
    }
  )
  const colourOption = options.find((o) => o.title === "Colour")!
  const materialOption = options.find((o) => o.title === "Material")!

  await createProductsWorkflow(container).run({
    input: {
      products: SAMPLE_PRODUCTS.map((p) => ({
        title: p.title,
        handle: p.handle,
        description: p.description,
        status: ProductStatus.PUBLISHED,
        category_ids: [categories.find((c) => c.name === p.category)!.id],
        collection_id: signature.id,
        weight: p.weight,
        length: p.length,
        width: p.width,
        height: p.height,
        hs_code: "9504",
        origin_country: "in",
        material: p.materials.join(", "),
        shipping_profile_id: shippingProfile.id,
        sales_channels: [{ id: salesChannel.id }],
        metadata: { age: "6+ years", assembly: null },
        options: [{ id: colourOption.id }, { id: materialOption.id }],
        variants: p.colours.flatMap((colour) =>
          p.materials.map((material, i) => ({
            title: `${colour} / ${material}`,
            sku: `${p.handle}-${colour}-${material}`
              .toUpperCase()
              .replace(/[^A-Z0-9]+/g, "-"),
            manage_inventory: true,
            options: { Colour: colour, Material: material },
            // The second material in a list is the premium one.
            prices: [{ currency_code: "inr", amount: p.rupees + i * 1000 }],
          }))
        ),
      })),
    },
  })

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  })
  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryItems.map((item) => ({
        location_id: warehouse.id,
        stocked_quantity: 10,
        inventory_item_id: item.id,
      })),
    },
  })

  logger.info("Seeding site content...")

  await contentService.createContentBlocks([
    {
      section: "hero",
      title: "Every great game starts on a great board",
      body: "Hand-crafted chess sets, boards and clocks, made in India for players who care how the game feels.",
      link_label: "Shop now",
      link_url: "/shop",
      rank: 0,
    },
    {
      section: "featured_collection",
      eyebrow: "Featured collection",
      title: "The Signature Collection",
      body: "Weighted Staunton pieces, hand-finished boards and tournament-ready clocks. Built to be played for a lifetime.",
      link_label: "Explore the collection",
      link_url: "/shop",
    },
    ...[0, 1, 2].map((rank) => ({ section: "featured_image", rank })),
    {
      section: "newsletter",
      title: "Your next move, in your inbox",
      body: "New sets, tournament dates and a puzzle every week. No spam.",
      link_label: "Subscribe",
    },
    {
      page: "about",
      section: "intro",
      title: "Who are we?",
      body: "The 64 Squares makes premium chess sets, boards and accessories for players, clubs and collectors across India.",
    },
    { page: "about", section: "team", title: "Meet our team" },
    {
      page: "about",
      section: "contact",
      title: "Questions about a set or a tournament? We are happy to help.",
      body: "Drop us an email anytime.",
      link_label: "Email us",
      link_url: `mailto:${SUPPORT_EMAIL}`,
    },
  ])

  await contentService.createPages([
    {
      handle: "delivery",
      title: "Delivery",
      rank: 0,
      body: `Delivery is free on every order, anywhere we deliver in India. Orders are shipped with Delhivery, and you get a tracking link by email as soon as your order leaves our warehouse.

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

**Email:** [${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL})

*Update the contact details in the admin under Help pages.*`,
    },
  ])

  logger.info("Finished seeding The 64 Squares store.")
}
