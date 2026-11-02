import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text } from "@medusajs/ui"
import { useUploadLimits } from "../lib/upload-limits"

// Reminder of the photo size the website expects, shown on every product page in the admin.
// Also shows the product photo size limit, because Medusa's media screen only says
// "Failed to upload" when a photo is over it.
const ProductPhotoGuide = () => {
  const { data } = useUploadLimits()
  const limit = data?.limits.find((l) => l.type === "product_photo")

  return (
    <Container className="px-6 py-4">
      <Heading level="h2">Product photos</Heading>
      <Text size="small" className="mt-1 text-ui-fg-subtle">
        Recommended: <span className="font-medium text-ui-fg-base">1500 × 1500 px square</span>, WebP or JPG,
        under 500 KB, product centred on the same light background. GIFs work too; videos are not supported here.
        The first photo in Media is the one on the shop card.
      </Text>
      {limit && (
        <Text size="small" className="mt-2 text-ui-fg-subtle">
          Largest photo allowed: <span className="font-medium text-ui-fg-base">{limit.max_mb} MB</span>. If an upload
          says "Failed to upload", the photo is probably bigger than this (change it in Settings → Upload limits).
        </Text>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default ProductPhotoGuide
