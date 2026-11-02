import type { Metadata } from "next"
import { Gang } from "@/components/gang"
import { getCharacters } from "@/lib/data"

export const metadata: Metadata = { title: "Meet the Gang" }

export default async function CharactersPage() {
  const characters = await getCharacters()
  return (
    <section className="mx-auto max-w-[1440px] px-6 pb-[80px] pt-[30px] text-center lg:px-[104px] lg:pb-[167px] lg:pt-[94px]">
      <h1 className="font-display text-[48px] leading-[36px] text-ink sm:text-[96px] sm:leading-[72px] lg:text-[150px] lg:leading-[112px]">Meet the Gang</h1>
      <p className="mt-[8px] text-[11px] sm:mt-[18px] sm:text-[22px] lg:mt-[12px] lg:text-[28px]">Choose your friend carefully</p>
      <Gang characters={characters} />
    </section>
  )
}
