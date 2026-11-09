import Link from "next/link"

// A missing product, post or tournament inside the shop: the header and footer are already
// around it, so this is only the message.
export default function NotFound() {
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-[120px] text-center">
      <h1 className="font-display h-page">We couldn&apos;t find that page</h1>
      <p className="mt-4 text-[16px] text-muted">It may have moved. The shop has everything we sell.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/shop" className="btn btn-solid">
          Go to the shop
        </Link>
        <Link href="/play" className="btn btn-outline">
          Play chess
        </Link>
      </div>
    </section>
  )
}
