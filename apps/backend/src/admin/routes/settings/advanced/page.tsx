import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { useMe } from "../../../lib/staff"

// Technical screens, hidden from the Settings menu to keep it simple. They still work and
// are listed here for the rare times they're needed. Admin only.
const ADVANCED: { to: string; title: string; description: string }[] = [
  { to: "/settings/regions", title: "Regions", description: "The country the store sells to (India), its currency and payment methods." },
  { to: "/settings/tax-regions", title: "Tax regions", description: "GST rates. Prices on the website already include tax." },
  { to: "/settings/sales-channels", title: "Sales channels", description: "Where products are sold. Everything uses \"The 64 Squares Website\"." },
  { to: "/settings/refund-reasons", title: "Refund reasons", description: "The list of reasons to pick from when giving a refund." },
  { to: "/settings/publishable-api-keys", title: "Publishable API keys", description: "The key the website uses to read products. Don't delete it." },
  { to: "/settings/secret-api-keys", title: "Secret API keys", description: "Keys for outside services. Only create one when a developer asks." },
  { to: "/settings/workflows", title: "Background tasks", description: "A log of background jobs, for troubleshooting." },
  { to: "/settings/search", title: "Search", description: "Search engine settings for the admin." },
]

const AdvancedPage = () => {
  const { me } = useMe()
  if (me && me.role !== "admin") {
    return (
      <Container className="px-6 py-4">
        <Heading level="h1">Advanced settings</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Only the admin can open these.
        </Text>
      </Container>
    )
  }
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Advanced settings</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Technical settings that rarely need changing. They're kept out of the menu so it stays simple. Change these
          only if you're sure, or with your developer.
        </Text>
      </div>
      {ADVANCED.map((a) => (
        <Link key={a.to} to={a.to} data-keep className="flex items-center justify-between gap-x-4 px-6 py-3 hover:bg-ui-bg-base-hover">
          <div className="flex flex-col">
            <Text size="small" weight="plus">
              {a.title}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {a.description}
            </Text>
          </div>
          <Text size="small" className="shrink-0 text-ui-fg-subtle">
            Open →
          </Text>
        </Link>
      ))}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Advanced settings",
  rank: 9,
})

export default AdvancedPage
