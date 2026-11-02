import { useQuery } from "@tanstack/react-query"
import { sdk } from "./sdk"

type Me = { role: "admin" | "moderator"; owner: boolean; permissions: string[] }

// The signed-in person's role and switched-on permissions (Settings → Staff & permissions).
// `can` is true while loading so nothing flickers away for admins.
export const useMe = () => {
  const { data } = useQuery({
    queryKey: ["staff-me"],
    queryFn: () => sdk.client.fetch<{ staff: Me }>("/admin/staff/me"),
    staleTime: 10_000,
  })
  const me = data?.staff ?? null
  const can = (permission: string) =>
    !me || me.role === "admin" || (permission !== "admin" && me.permissions.includes(permission))
  return { me, can }
}
