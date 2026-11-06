import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text } from "@medusajs/ui"
import { useUploadLimits } from "../lib/upload-limits"

// Explains how product photos are handled, shown on every product page in the admin.
const ProductPhotoGuide = () => {
  const { data } = useUploadLimits()
  const limit = data?.limits.find((l) => l.type === "product_photo")

  return (
    <Container className="px-6 py-4">
      <Heading level="h2">Product photos</Heading>
      <Text size="small" className="mt-1 text-ui-fg-subtle">
        Upload photos straight from your phone or camera: HEIC (iPhone), JPG, PNG and WebP are all fine, at any size.
        Each photo is turned the right way up, shrunk to at most 2000 px and saved as a small WebP automatically.
        The first photo in Media is the one on the shop card.
      </Text>
      <Text size="small" className="mt-2 text-ui-fg-subtle">
        To pick the square part of each photo (with zoom), add photos in{" "}
        the <span className="font-medium text-ui-fg-base">Simple editor</span>. Photos added in Media here are
        used as they are.
      </Text>
      {limit && (
        <Text size="small" className="mt-2 text-ui-fg-subtle">
          Largest photo allowed after shrinking: <span className="font-medium text-ui-fg-base">{limit.max_mb} MB</span>{" "}
          (Settings → Upload limits).
        </Text>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side.after",
})

export default ProductPhotoGuide
