import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Alert, Container, Heading, Tabs, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Advanced } from "../../../lib/marketing/advanced"
import { EventManager } from "../../../lib/marketing/event-manager"
import { GROUP_MESSAGES, IntegrationCards, IntegrationDrawer } from "../../../lib/marketing/integrations"
import { Privacy } from "../../../lib/marketing/privacy"
import { Webhooks } from "../../../lib/marketing/webhooks"
import type { Integration, MarketingView } from "../../../lib/marketing/types"
import { sdk } from "../../../lib/sdk"

// Settings → Marketing & integrations: ad and analytics tags, the cookie banner, and the
// Event Manager (what was sent where, and what failed).
const MarketingPage = () => {
  const { data, error } = useQuery({ queryKey: ["marketing"], queryFn: () => sdk.client.fetch<MarketingView>("/admin/marketing") })
  const [open, setOpen] = useState<Integration | null>(null)
  if (error) {
    return (
      <Container className="px-6 py-4">
        <Heading level="h1">Marketing & integrations</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {(error as Error).message}
        </Text>
      </Container>
    )
  }
  if (!data) {
    return (
      <Container className="px-6 py-4">
        <Text size="small">Loading…</Text>
      </Container>
    )
  }
  return (
    <Container className="p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Marketing & integrations</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Connect ad and analytics tools without touching code. Each one is tested before it can be switched on, and only runs for visitors who allow it.
        </Text>
      </div>
      <Tabs defaultValue="integrations">
        <Tabs.List className="border-b px-6 pb-2">
          <Tabs.Trigger value="integrations">Integrations</Tabs.Trigger>
          <Tabs.Trigger value="events">Event Manager</Tabs.Trigger>
          <Tabs.Trigger value="webhooks">Webhooks</Tabs.Trigger>
          <Tabs.Trigger value="privacy">Privacy & consent</Tabs.Trigger>
          <Tabs.Trigger value="advanced">Advanced</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="integrations">
          {data.warnings.length > 0 && (
            <div className="flex flex-col gap-2 px-6 pt-4">
              {data.warnings.map((w) => (
                <Alert key={w} variant="warning">
                  {w}
                </Alert>
              ))}
            </div>
          )}
          <div className="px-6 pt-4">
            <Heading level="h2">Tracking & analytics</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Recommended: Meta Pixel with Meta Conversions API, and Google Analytics 4 here. Use Google Tag Manager only if someone manages tags there, and then don&apos;t add the same tags in both places.
            </Text>
          </div>
          <IntegrationCards view={data} onOpen={setOpen} />
          <div className="border-t px-6 pt-4">
            <Heading level="h2">Messages & email</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Order updates on WhatsApp, and customer lists and reminder emails in your email tool. These only go to customers who agreed to them at checkout or by subscribing.
            </Text>
          </div>
          <IntegrationCards view={data} onOpen={setOpen} group={GROUP_MESSAGES} search={false} />
          <div className="border-t px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              Not included: TikTok (not available in India). Other tools can receive events through Webhooks.
            </Text>
          </div>
        </Tabs.Content>
        <Tabs.Content value="events">
          <EventManager />
        </Tabs.Content>
        <Tabs.Content value="webhooks">
          <Webhooks view={data} />
        </Tabs.Content>
        <Tabs.Content value="privacy">
          <Privacy view={data} />
        </Tabs.Content>
        <Tabs.Content value="advanced">
          <Advanced view={data} />
        </Tabs.Content>
      </Tabs>
      <IntegrationDrawer view={data} open={open} onClose={() => setOpen(null)} />
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Marketing & integrations", rank: 2 })

export default MarketingPage
