import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sdk } from "../../../lib/sdk"
import { UPLOAD_LIMITS_QUERY, type UploadLimitsResponse } from "../../../lib/upload-limits"

const UploadLimitsPage = () => {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: UPLOAD_LIMITS_QUERY,
    queryFn: () => sdk.client.fetch<UploadLimitsResponse>("/admin/upload-limits"),
  })
  // Inputs are kept as text so the field can be cleared while typing.
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (data) {
      setValues(Object.fromEntries(data.limits.map((l) => [l.type, String(l.max_mb)])))
    }
  }, [data])

  const max = data?.max_allowed_mb ?? 100
  const invalid = (v: string | undefined) => {
    const n = Number(v)
    return !v || Number.isNaN(n) || n < 0.1 || n > max
  }
  const anyInvalid = !!data && data.limits.some((l) => invalid(values[l.type]))

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch<UploadLimitsResponse>("/admin/upload-limits", {
        method: "POST",
        body: { limits: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])) },
      }),
    onSuccess: (res) => {
      qc.setQueryData(UPLOAD_LIMITS_QUERY, res)
      toast.success("Upload limits saved")
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })

  const resetDefaults = () => {
    if (data) {
      setValues(Object.fromEntries(data.limits.map((l) => [l.type, String(l.default_mb)])))
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Upload limits</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            The biggest file allowed, in MB. Photos added on a product page use the Product photos limit; every
            other upload uses the limit for its file type. The server accepts up to {max} MB.
          </Text>
        </div>
      </div>
      {isLoading || !data ? (
        <Text className="px-6 py-4">Loading...</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>File type</Table.HeaderCell>
              <Table.HeaderCell>Kind</Table.HeaderCell>
              <Table.HeaderCell>Applies to</Table.HeaderCell>
              <Table.HeaderCell>Limit (MB)</Table.HeaderCell>
              <Table.HeaderCell>Default</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.limits.map((l) => (
              <Table.Row key={l.type}>
                <Table.Cell>{l.label}</Table.Cell>
                <Table.Cell>{l.group}</Table.Cell>
                <Table.Cell className="text-ui-fg-subtle">
                  {l.applies ?? l.extensions.map((e) => `.${e}`).join(", ")}
                </Table.Cell>
                <Table.Cell>
                  <Input
                    type="number"
                    size="small"
                    min={0.1}
                    max={max}
                    step="any"
                    className="w-24"
                    aria-invalid={invalid(values[l.type])}
                    value={values[l.type] ?? ""}
                    onChange={(e) => setValues((s) => ({ ...s, [l.type]: e.target.value }))}
                  />
                </Table.Cell>
                <Table.Cell className="text-ui-fg-subtle">{l.default_mb} MB</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <div className="flex items-center justify-between gap-x-2 px-6 py-4">
        <Text size="small" className={anyInvalid ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
          {anyInvalid
            ? `Each limit must be between 0.1 and ${max} MB.`
            : "Tip: keep pictures under 1 MB and videos under 5 MB so pages load fast on phones."}
        </Text>
        <div className="flex gap-x-2">
          <Button size="small" variant="secondary" onClick={resetDefaults} disabled={!data}>
            Use defaults
          </Button>
          <Button size="small" isLoading={save.isPending} disabled={!data || anyInvalid} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Upload limits",
  rank: 3,
})

export default UploadLimitsPage
