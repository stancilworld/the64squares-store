// Questions and answers about a product (admin → product → Questions and answers).
export function ProductFaq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section aria-labelledby="faq-title" className="mx-auto mt-16 max-w-[860px] lg:mt-20">
      <h2 id="faq-title" className="text-[22px] font-bold tracking-[-0.02em] lg:text-[26px]">
        Questions and answers
      </h2>
      <div className="mt-5 divide-y divide-rule border-y border-rule">
        {items.map((x) => (
          <details key={x.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold">
              {x.q}
              <span aria-hidden="true" className="text-[20px] leading-none transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 whitespace-pre-line text-[15px] leading-[1.7] text-ink/80">{x.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
