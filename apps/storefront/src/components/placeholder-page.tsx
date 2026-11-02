import Link from "next/link"

// Temporary page for sections whose design and content are still coming.
export function PlaceholderPage({ title, text }: { title: string; text: string }) {
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-[110px] text-center lg:py-[150px]">
      <h1 className="font-display h-page">{title}</h1>
      <p className="mx-auto mt-6 max-w-[560px] text-[20px] leading-[30px]">{text}</p>
      <Link href="/shop" className="mt-10 btn btn-solid">
        Browse the shop
      </Link>
    </section>
  )
}
