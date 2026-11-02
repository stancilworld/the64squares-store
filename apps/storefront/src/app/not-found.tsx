import Link from "next/link"

export default function NotFound() {
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-[120px] text-center">
      <h1 className="font-display h-page">We couldn&apos;t find that page</h1>
      <p className="mt-4 text-[16px] text-muted">It may have moved. The shop has everything we sell.</p>
      <Link href="/shop" className="mt-8 btn btn-solid">
        Go to the shop
      </Link>
    </section>
  )
}
