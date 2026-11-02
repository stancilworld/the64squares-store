import type { Metadata } from "next"
import { ListPageView } from "./list-page"

export const metadata: Metadata = { title: "Wishlist" }

export default function ListPage() {
  return (
    <section className="mx-auto mb-[96px] max-w-[1440px] px-6 pt-[48px] lg:mb-[150px] lg:px-[199px] lg:pt-[85px]">
      <h1 className="font-display h-page">Wishlist</h1>
      <ListPageView />
    </section>
  )
}
