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
import { CHARACTER_MODULE } from "../modules/character"
import CharacterModuleService from "../modules/character/service"
import { CONTENT_MODULE } from "../modules/content"
import ContentModuleService from "../modules/content/service"

/**
 * First-run setup for the Stancil store: India region in INR with GST,
 * an Indian warehouse, delivery, furniture categories, characters,
 * SAMPLE products and the homepage content.
 *
 * Sample product names, prices and sizes are placeholders until Stancil's
 * real product list arrives; edit or delete them in the admin.
 */

const COLOURS = ["Sunshine Yellow", "Sky Blue", "Crayon Red", "Leaf Green"]
const MATERIALS = ["Pine Wood", "Birch Plywood"]

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

const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    title: "Bella's Builder Chair",
    handle: "bella-builder-chair",
    category: "Chairs",
    description:
      "A sturdy little chair with rounded edges, sized for small builders. Sample product: replace with real details.",
    rupees: 4499,
    weight: 4000,
    length: 32,
    width: 32,
    height: 55,
    colours: COLOURS,
    materials: ["Pine Wood"],
  },
  {
    title: "Bella's Workbench Table",
    handle: "bella-workbench-table",
    category: "Tables",
    description:
      "A low play and work table with space for blocks, books and big ideas. Sample product: replace with real details.",
    rupees: 8999,
    weight: 12000,
    length: 90,
    width: 60,
    height: 48,
    colours: ["Sunshine Yellow", "Sky Blue", "Leaf Green"],
    materials: MATERIALS,
  },
  {
    title: "Bella's Toy Chest",
    handle: "bella-toy-chest",
    category: "Storage",
    description:
      "A soft-close toy chest that turns tidy-up time into treasure time. Sample product: replace with real details.",
    rupees: 7499,
    weight: 10000,
    length: 70,
    width: 40,
    height: 45,
    colours: COLOURS,
    materials: ["Birch Plywood"],
  },
  {
    title: "Bella's Book Nook",
    handle: "bella-book-nook",
    category: "Shelves",
    description:
      "Front-facing shelves so little readers can pick their own story. Sample product: replace with real details.",
    rupees: 6499,
    weight: 9000,
    length: 70,
    width: 28,
    height: 80,
    colours: ["Sky Blue", "Crayon Red", "Leaf Green"],
    materials: MATERIALS,
  },
  {
    title: "Bella's Step Stool",
    handle: "bella-step-stool",
    category: "Chairs",
    description:
      "A two-step stool for reaching the sink, the shelf and the stars. Sample product: replace with real details.",
    rupees: 2999,
    weight: 3000,
    length: 40,
    width: 30,
    height: 35,
    colours: COLOURS,
    materials: ["Pine Wood"],
  },
  {
    title: "Bella's Art Easel",
    handle: "bella-art-easel",
    category: "Tables",
    description:
      "A double-sided easel with a chalkboard and a paper roll. Sample product: replace with real details.",
    rupees: 5999,
    weight: 6000,
    length: 60,
    width: 50,
    height: 110,
    colours: ["Sunshine Yellow", "Crayon Red"],
    materials: ["Birch Plywood"],
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
  const characterService: CharacterModuleService =
    container.resolve(CHARACTER_MODULE)
  const contentService: ContentModuleService = container.resolve(CONTENT_MODULE)

  logger.info("Seeding Stancil store...")

  const {
    result: [salesChannel],
  } = await createSalesChannelsWorkflow(container).run({
    input: {
      salesChannelsData: [
        { name: "Stancil Website", description: "stancil.in storefront" },
      ],
    },
  })

  const {
    result: [publishableApiKey],
  } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        { title: "Stancil Storefront", type: "publishable", created_by: "" },
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
          name: "Stancil",
          supported_currencies: [
            { currency_code: "inr", is_default: true, is_tax_inclusive: true },
          ],
          default_sales_channel_id: salesChannel.id,
        },
      ],
    },
  })

  // India, rupees. pp_system_default stands in for Cash on Delivery until
  // the Razorpay and COD providers are added.
  const {
    result: [region],
  } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "India",
          currency_code: "inr",
          countries: ["in"],
          payment_providers: ["pp_system_default"],
          is_tax_inclusive: true,
        },
      ],
    },
  })

  // Wooden furniture (HSN 9403) is set to 18% GST here; confirm with the
  // accountant before launch.
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
          name: "Stancil Warehouse",
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

  // Manual delivery until the Delhivery fulfilment provider is built.
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
          description: "Delivered by Delhivery in 5-9 days.",
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
      product_categories: ["Chairs", "Tables", "Storage", "Shelves"].map(
        (name, i) => ({ name, is_active: true, rank: i })
      ),
    },
  })

  const {
    result: [bellaCollection],
  } = await createCollectionsWorkflow(container).run({
    input: {
      collections: [{ title: "Bella the Builder", handle: "bella-the-builder" }],
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

  const { result: products } = await createProductsWorkflow(container).run({
    input: {
      products: SAMPLE_PRODUCTS.map((p) => ({
        title: p.title,
        handle: p.handle,
        description: p.description,
        status: ProductStatus.PUBLISHED,
        category_ids: [categories.find((c) => c.name === p.category)!.id],
        collection_id: bellaCollection.id,
        weight: p.weight,
        length: p.length,
        width: p.width,
        height: p.height,
        hs_code: "9403",
        origin_country: "in",
        material: p.materials.join(", "),
        shipping_profile_id: shippingProfile.id,
        sales_channels: [{ id: salesChannel.id }],
        metadata: { assembly: "Easy home assembly, about 20 minutes", age: "2-6 years" },
        options: [{ id: colourOption.id }, { id: materialOption.id }],
        variants: p.colours.flatMap((colour) =>
          p.materials.map((material) => ({
            title: `${colour} / ${material}`,
            sku: `${p.handle}-${colour}-${material}`
              .toUpperCase()
              .replace(/[^A-Z0-9]+/g, "-"),
            manage_inventory: true,
            options: { Colour: colour, Material: material },
            prices: [
              {
                currency_code: "inr",
                amount: material === "Birch Plywood" && p.materials.length > 1
                  ? p.rupees + 1000
                  : p.rupees,
              },
            ],
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

  logger.info("Seeding characters...")

  const [bella] = await characterService.createCharacters([
    {
      name: "Bella",
      handle: "bella",
      tagline: "Bella the Builder",
      story:
        "Bella builds towers, forts and whole cities before breakfast. Her furniture is made for little hands with big plans.",
      collection_title: "Bella the Builder",
      status: "live",
      rank: 0,
    },
    {
      name: "Ollie",
      handle: "ollie",
      status: "coming_soon",
      rank: 1,
    },
    {
      name: "Stella",
      handle: "stella",
      status: "coming_soon",
      rank: 2,
    },
  ])

  await link.create(
    products.map((product) => ({
      [Modules.PRODUCT]: { product_id: product.id },
      [CHARACTER_MODULE]: { character_id: bella.id },
    }))
  )

  logger.info("Seeding homepage content...")

  await contentService.createContentBlocks([
    {
      section: "hero_slide",
      title: "hello friends, Meet Bella...",
      body: "See all furnitures we made with bella",
      link_label: "Shop Now",
      link_url: "/characters/bella",
      rank: 0,
    },
    {
      section: "hero_slide",
      title: "a corner for every little story",
      body: "Furniture that grows with your child's imagination",
      link_label: "Shop Now",
      link_url: "/shop",
      rank: 1,
    },
    {
      section: "hero_slide",
      title: "Ollie is on his way...",
      body: "A new friend is coming soon",
      link_label: "Meet the gang",
      link_url: "/characters",
      rank: 2,
    },
    {
      section: "hero_slide",
      title: "Stella is on her way...",
      body: "A new friend is coming soon",
      link_label: "Meet the gang",
      link_url: "/characters",
      rank: 3,
    },
    { section: "why_point", title: "Baby Friendly", rank: 0 },
    { section: "why_point", title: "Rounded Edges", rank: 1 },
    { section: "why_point", title: "Made to Last", rank: 2 },
    {
      section: "why_point",
      title: "why stancil ?",
      link_label: "Our Story",
      link_url: "/about",
      rank: -1,
    },
    {
      section: "featured_collection",
      eyebrow: "Featured collection",
      title: "a corner for every little story",
      body: "Every piece in Bella's collection is designed around how children really play: low, sturdy, soft at the edges and bright enough to spark a story.",
      link_label: "Explore This Collection",
      link_url: "/shop?character=bella",
    },
    {
      section: "product_row",
      title: "meet our first collection",
      link_label: "View all",
      link_url: "/shop",
    },
    {
      section: "newsletter",
      title: "a little inspiration in your inbox...",
      body: "New characters, first looks at new furniture, and little ideas for play and tidy-up time. No spam, just stories.",
      link_label: "Subscribe for our newsletter",
    },
  ])

  logger.info("Finished seeding Stancil store.")
}
