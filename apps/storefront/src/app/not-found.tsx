import Link from "next/link"

export default function NotFound() {
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-[120px] text-center">
      <h1 className="font-display text-[56px] lg:text-[96px]">Oops, this page wandered off</h1>
      <p className="mt-6 text-[20px]">Some pages are still being built.</p>
      <Link href="/" className="mt-8 inline-flex h-[42px] items-center rounded-full bg-ink px-8 text-[16px] text-white">
        Back home
      </Link>
    </section>
  )
}
