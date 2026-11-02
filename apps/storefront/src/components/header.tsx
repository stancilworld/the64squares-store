import Image from "next/image"
import Link from "next/link"
import { getCategories, getSiteNavigation } from "@/lib/data"
import { SearchIcon, UserIcon } from "./icons"
import { Suspense } from "react"
import { CartLink } from "./cart-link"
import { ListLink } from "./list-link"
import { MobileSearch, MobileSearchView } from "./mobile-search"
import { MobileMenu, MobileMenuView, NavLinks, NavLinksView } from "./nav"

export async function Header() {
  const [categories, { menu: m }] = await Promise.all([getCategories(), getSiteNavigation()])
  const categoryLinks = [
    { href: "/shop", label: m.all_label },
    ...categories.map((c) => ({ href: `/shop?category=${c.handle}`, label: c.name })),
  ]
  const aboutLinks = m.about_links
  // Words and extra links set in the admin (Website → Menu & footer).
  const menu = {
    charactersLabel: m.characters_label,
    charactersShow: m.characters_show,
    categoriesLabel: m.categories_label,
    aboutLabel: m.about_label,
    extraLinks: m.extra_links,
  }

  return (
    <>
    {/* The bar stays at the top of the screen while the page scrolls. */}
    <header className="sticky top-0 z-40 bg-white shadow-[0_3px_6px_rgba(0,0,0,0.08)] lg:shadow-none">
      <div className="bg-white">
        <div className="mx-auto flex h-[52px] max-w-[1440px] items-center px-5 sm:h-[64px] lg:h-[121px] lg:px-[65px] lg:pr-[109px]">
          <Suspense fallback={<MobileMenuView categoryLinks={categoryLinks} aboutLinks={aboutLinks} menu={menu} path="" />}>
            <MobileMenu categoryLinks={categoryLinks} aboutLinks={aboutLinks} menu={menu} />
          </Suspense>

          <Link href="/" aria-label="Stancil home" className="ml-[15px] shrink-0 lg:ml-0">
            <Image
              src="/brand/logo-header.webp"
              alt="Stancil"
              width={215}
              height={240}
              priority
              className="h-[33px] w-auto sm:h-[44px] lg:h-[79px]"
            />
          </Link>

          <form
            action="/shop"
            method="get"
            role="search"
            className="ml-[58px] hidden h-[46px] w-[404px] shrink items-center rounded-full bg-pill pl-[13px] pr-4 xl:flex"
          >
            <SearchIcon className="h-[22px] w-[22px] shrink-0" />
            <label htmlFor="site-search" className="sr-only">
              Search
            </label>
            <input
              id="site-search"
              name="q"
              type="search"
              className="ml-2 h-full w-full bg-transparent text-[18px] outline-none"
            />
          </form>

          <Suspense fallback={<NavLinksView categoryLinks={categoryLinks} aboutLinks={aboutLinks} menu={menu} path="" />}>
            <NavLinks categoryLinks={categoryLinks} aboutLinks={aboutLinks} menu={menu} />
          </Suspense>

          <div className="ml-auto flex items-center gap-[18px] sm:gap-[24px] lg:ml-[42px] lg:gap-[35px]">
            <ListLink />
            <Link href="/account" aria-label="Account">
              <UserIcon className="h-[20px] w-[19px] sm:h-[28px] sm:w-[27px] lg:h-[42px] lg:w-[38px]" />
            </Link>
            <CartLink />
          </div>
        </div>
      </div>
    </header>

      <Suspense fallback={<MobileSearchView path="" />}>
        <MobileSearch />
      </Suspense>
    </>
  )
}
