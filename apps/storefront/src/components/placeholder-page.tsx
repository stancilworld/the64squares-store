import Link from "next/link"

// Temporary page for sections whose design and content are still coming.
export function PlaceholderPage({ title, text }: { title: string; text: string }) {
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-[110px] text-center lg:py-[150px]">
      <h1 className="font-display text-[56px] lg:text-[96px]">{title}</h1>
      <p className="mx-auto mt-6 max-w-[560px] text-[20px] leading-[30px]">{text}</p>
      <Link href="/shop" className="mt-10 inline-flex h-[42px] items-center rounded-full bg-ink px-8 text-[16px] text-white hover:bg-black">
        Browse the shop
      </Link>
    </section>
  )
}
