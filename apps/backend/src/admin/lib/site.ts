import { useQuery } from "@tanstack/react-query"
import { sdk } from "./sdk"

// The public store address (e.g. https://stancil.in), for "View on website" links.
export const useStoreUrl = () => {
  const { data } = useQuery({
    queryKey: ["site-info"],
    queryFn: () => sdk.client.fetch<{ store_url: string }>("/admin/site-info"),
    staleTime: Infinity,
  })
  return data?.store_url ?? null
}
