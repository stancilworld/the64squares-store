import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { sdk } from "../../../lib/sdk"

type Settings = { ga4_id: string; meta_pixel_id: string; google_verification: string; default_description: string }

const Field = ({ id, label, hint, children, on }: { id: string; label: string; hint: React.ReactNode; children: React.ReactNode; on?: boolean }) => (
  <div className="flex flex-col gap-y-2 px-6 py-4">
    <div className="flex items-center gap-x-2">
      <Label htmlFor={id} weight="plus">
        {label}
      </Label>
      {on !== undefined && (
        <Badge size="2xsmall" color={on ? "green" : "grey"}>
          {on ? "On" : "Off"}
        </Badge>
      )}
    </div>
    {children}
    <Text size="small" className="text-ui-fg-subtle">
      {hint}
    </Text>
  </div>
)

// Settings → SEO & analytics: Search Console and the site's description (analytics and ad
// tags are in Settings → Marketing & integrations). Each product's own search title and description are on the product form.
const SeoPage = () => {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["seo-settings"], queryFn: () => sdk.client.fetch<{ settings: Settings }>("/admin/seo-settings") })
  const [form, setForm] = useState<Settings | null>(null)
  useEffect(() => {
    if (data) setForm(data.settings)
  }, [data])
  const save = useMutation({
    mutationFn: (body: Settings) => sdk.client.fetch<{ settings: Settings }>("/admin/seo-settings", { method: "POST", body }),
    onSuccess: (r) => {
      qc.setQueryData(["seo-settings"], r)
      toast.success("Saved. The website picks it up within a few minutes.")
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })
  if (!form) {
    return (
      <Container className="px-6 py-4">
        <Text size="small">Loading...</Text>
      </Container>
    )
  }
  const set = (k: keyof Settings, v: string) => setForm({ ...form, [k]: v })
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">SEO & analytics</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          How the website shows up in Google, and the visitor statistics you collect. Each product&apos;s own Google title and description are on the
          product form, under Search engines (SEO).
        </Text>
      </div>
      <Field
        id="seo-desc"
        label="Website description"
        hint={`Shown under the website's name in Google and in WhatsApp/Instagram link previews. ${form.default_description.length}/155 letters is ideal. Leave empty for the built-in one.`}
      >
        <Textarea
          id="seo-desc"
          rows={2}
          value={form.default_description}
          placeholder="Premium chess sets, boards, pieces and clocks, made in India. Play online and join tournaments."
          onChange={(e) => set("default_description", e.target.value)}
        />
      </Field>
      <div className="px-6 py-4">
        <Text size="small" className="text-ui-fg-subtle">
          Google Analytics, the Meta Pixel and other ad tags are now in{" "}
          <Link to="/settings/marketing" className="text-ui-fg-interactive hover:underline">
            Settings → Marketing &amp; integrations
          </Link>
          , with a test for each, the cookie banner and the Event Manager.
        </Text>
      </div>
      <Field
        id="seo-gsc"
        label="Google Search Console verification"
        on={!!form.google_verification.trim()}
        hint={
          <>
            In Search Console add the website, choose the “HTML tag” method and paste only the code from inside <code>content=&quot;…&quot;</code>.
          </>
        }
      >
        <Input
          id="seo-gsc"
          value={form.google_verification}
          placeholder="e.g. AbCdEf123_xyz…"
          onChange={(e) => set("google_verification", e.target.value.trim().replace(/^.*content="([^"]+)".*$/, "$1"))}
        />
      </Field>
      <div className="flex justify-end px-6 py-4">
        <Button size="small" isLoading={save.isPending} onClick={() => save.mutate(form)}>
          Save
        </Button>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({ label: "SEO & analytics", rank: 2 })

export default SeoPage
