import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Drawer,
  Heading,
  Label,
  Select,
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { sdk } from "../../../lib/sdk"

type Permission = { key: string; group: string; label: string; description: string; default: boolean }
type StaffMember = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: "admin" | "moderator"
  owner: boolean
  permissions: string[]
  custom: boolean
}
type StaffResponse = {
  staff: StaffMember[]
  permissions: Permission[]
  defaults: string[]
  admin_only: string[]
  owner_email: string
}

const QUERY = ["staff"]

const nameOf = (m: StaffMember) => [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email

// The toggles, grouped by area, with "all on / all off" per group.
const Toggles = ({
  permissions,
  value,
  onChange,
}: {
  permissions: Permission[]
  value: string[]
  onChange: (next: string[]) => void
}) => {
  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>()
    permissions.forEach((p) => map.set(p.group, [...(map.get(p.group) ?? []), p]))
    return [...map.entries()]
  }, [permissions])
  const set = (key: string, on: boolean) =>
    onChange(on ? [...new Set([...value, key])] : value.filter((k) => k !== key))

  return (
    <div className="flex flex-col gap-y-5">
      {groups.map(([group, items]) => {
        const allOn = items.every((p) => value.includes(p.key))
        return (
          <div key={group} className="flex flex-col gap-y-2">
            <div className="flex items-center justify-between">
              <Text size="small" weight="plus">
                {group}
              </Text>
              <Button
                size="small"
                variant="transparent"
                onClick={() =>
                  onChange(
                    allOn
                      ? value.filter((k) => !items.some((p) => p.key === k))
                      : [...new Set([...value, ...items.map((p) => p.key)])]
                  )
                }
              >
                {allOn ? "All off" : "All on"}
              </Button>
            </div>
            <div className="divide-y rounded-lg border">
              {items.map((p) => (
                <label key={p.key} className="flex cursor-pointer items-start gap-x-3 px-3 py-2.5">
                  <Switch
                    className="mt-0.5"
                    checked={value.includes(p.key)}
                    onCheckedChange={(on) => set(p.key, on)}
                  />
                  <span className="flex flex-col">
                    <Text size="small" weight="plus">
                      {p.label}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {p.description}
                    </Text>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const PersonDrawer = ({
  member,
  data,
  onClose,
}: {
  member: StaffMember | null
  data: StaffResponse
  onClose: () => void
}) => {
  const qc = useQueryClient()
  const [role, setRole] = useState<"admin" | "moderator">("moderator")
  const [perms, setPerms] = useState<string[]>([])

  useEffect(() => {
    if (member) {
      setRole(member.role)
      setPerms(member.role === "admin" ? data.defaults : member.permissions)
    }
  }, [member, data.defaults])

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/staff/${member!.id}`, {
        method: "POST",
        body: role === "admin" ? { role } : { role, permissions: perms },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY })
      toast.success(`Saved access for ${nameOf(member!)}`)
      onClose()
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })

  return (
    <Drawer open={!!member} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content className="max-w-[560px]">
        <Drawer.Header>
          <Drawer.Title>{member ? nameOf(member) : ""}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-5 overflow-y-auto">
          {member && (
            <>
              <Text size="small" className="text-ui-fg-subtle">
                {member.email}
              </Text>
              <div className="flex flex-col gap-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "admin" | "moderator")} disabled={member.owner}>
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="admin">Admin: can do everything</Select.Item>
                    <Select.Item value="moderator">Moderator: only what is switched on below</Select.Item>
                  </Select.Content>
                </Select>
                {member.owner && (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    This is the main admin account. It is always an admin.
                  </Text>
                )}
              </div>
              {role === "moderator" ? (
                <>
                  <div className="flex items-center justify-between">
                    <Text size="small" className="text-ui-fg-subtle">
                      {perms.length} of {data.permissions.length} switched on
                    </Text>
                    <Button size="small" variant="secondary" onClick={() => setPerms(data.defaults)}>
                      Reset to defaults
                    </Button>
                  </div>
                  <Toggles permissions={data.permissions} value={perms} onChange={setPerms} />
                </>
              ) : (
                <Text size="small" className="text-ui-fg-subtle">
                  Admins can do everything, including managing staff. Give this only to people you fully trust.
                </Text>
              )}
            </>
          )}
        </Drawer.Body>
        <Drawer.Footer>
          <Drawer.Close asChild>
            <Button variant="secondary">Cancel</Button>
          </Drawer.Close>
          <Button isLoading={save.isPending} onClick={() => save.mutate()} disabled={member?.owner}>
            Save
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

const DefaultsDrawer = ({ open, data, onClose }: { open: boolean; data: StaffResponse; onClose: () => void }) => {
  const qc = useQueryClient()
  const [perms, setPerms] = useState<string[]>([])
  useEffect(() => {
    if (open) {
      setPerms(data.defaults)
    }
  }, [open, data.defaults])

  const save = useMutation({
    mutationFn: () => sdk.client.fetch("/admin/staff/defaults", { method: "POST", body: { permissions: perms } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY })
      toast.success("Defaults saved")
      onClose()
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  })

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content className="max-w-[560px]">
        <Drawer.Header>
          <Drawer.Title>Defaults for new moderators</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-5 overflow-y-auto">
          <Text size="small" className="text-ui-fg-subtle">
            New moderators start with these. Moderators who were never given their own toggles also follow them.
          </Text>
          <Toggles permissions={data.permissions} value={perms} onChange={setPerms} />
        </Drawer.Body>
        <Drawer.Footer>
          <Drawer.Close asChild>
            <Button variant="secondary">Cancel</Button>
          </Drawer.Close>
          <Button isLoading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

const StaffPage = () => {
  const [editing, setEditing] = useState<StaffMember | null>(null)
  const [defaultsOpen, setDefaultsOpen] = useState(false)
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY,
    queryFn: () => sdk.client.fetch<StaffResponse>("/admin/staff"),
    retry: false,
  })

  if (error) {
    return (
      <Container className="px-6 py-4">
        <Heading level="h1">Staff & permissions</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">
          Only the admin can manage staff and permissions.
        </Text>
      </Container>
    )
  }

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex items-start justify-between gap-x-4 px-6 py-4">
          <div>
            <Heading level="h1">Staff & permissions</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Admins can do everything. Moderators (employees) can only do what you switch on for each of them.
              Changes apply within a few seconds, checked by the server on every action.
            </Text>
          </div>
          <div className="flex shrink-0 gap-x-2">
            <Button size="small" variant="secondary" onClick={() => setDefaultsOpen(true)} disabled={!data}>
              Defaults
            </Button>
            <Button size="small" variant="secondary" asChild>
              <Link to="/settings/users">Invite staff</Link>
            </Button>
          </div>
        </div>
        {isLoading || !data ? (
          <Text className="px-6 py-4">Loading...</Text>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Person</Table.HeaderCell>
                <Table.HeaderCell>Role</Table.HeaderCell>
                <Table.HeaderCell>Permissions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.staff.map((m) => (
                <Table.Row key={m.id} className="cursor-pointer" onClick={() => setEditing(m)}>
                  <Table.Cell>
                    <div className="flex flex-col py-1">
                      <span>{nameOf(m)}</span>
                      {nameOf(m) !== m.email && <span className="text-ui-fg-subtle txt-small">{m.email}</span>}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    {m.owner ? (
                      <Badge color="purple" size="2xsmall">Main admin</Badge>
                    ) : m.role === "admin" ? (
                      <Badge color="blue" size="2xsmall">Admin</Badge>
                    ) : (
                      <Badge color="grey" size="2xsmall">Moderator</Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell className="text-ui-fg-subtle">
                    {m.role === "admin"
                      ? "Everything"
                      : `${m.permissions.length} of ${data.permissions.length}${m.custom ? "" : " (defaults)"}`}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
        {data && !data.staff.some((m) => m.owner) && (
          <Text size="small" className="px-6 py-3 text-ui-tag-orange-text">
            The main admin ({data.owner_email}) has no account yet. Invite it under Invite staff; it becomes an admin
            automatically.
          </Text>
        )}
      </Container>
      {data && (
        <Container className="px-6 py-4">
          <Heading level="h2">Admin only</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            These can never be given to a moderator:
          </Text>
          <ul className="mt-2 list-disc pl-5 text-ui-fg-subtle txt-small">
            {data.admin_only.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Container>
      )}
      {data && <PersonDrawer member={editing} data={data} onClose={() => setEditing(null)} />}
      {data && <DefaultsDrawer open={defaultsOpen} data={data} onClose={() => setDefaultsOpen(false)} />}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Staff & permissions",
  rank: 1,
})

export default StaffPage
