import Image from "next/image"
import Link from "next/link"
import { getCategories, getSiteNavigation } from "@/lib/data"
import { SearchIcon, UserIcon } from "./icons"
import { Suspense } from "react"
import { CartLink } from "./cart-link"
import { ListLink } from "./list-link"
import { ExperienceSwitch } from "./experience-switch"
import { MobileSearch, MobileSearchView } from "./mobile-search"
import { MobileMenu, MobileMenuView, NavLinks, NavLinksView } from "./nav"

export async function Header() {
  const [categories, { menu: m, experience }] = await Promise.all([getCategories(), getSiteNavigation()])
  const categoryLinks = [
    { href: "/shop", label: m.all_label },
    ...categories.map((c) => ({ href: `/shop?category=${c.handle}`, label: c.name })),
  ]
  const aboutLinks = m.about_links
  // Words and extra links set in the admin (Website → Menu & footer).
  const menu = {
    categoriesLabel: m.categories_label,
    aboutLabel: m.about_label,
    extraLinks: m.extra_links,
  }

  return (
    <>
      {/* The bar stays at the top of the screen while the page scrolls. */}
      <header className="sticky top-0 z-40 border-b border-rule bg-white">
        <div className="mx-auto flex h-[60px] max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:h-[76px] lg:px-10">
          <Suspense fallback={<MobileMenuView categoryLinks={categoryLinks} aboutLinks={aboutLinks} menu={menu} path="" />}>
            <MobileMenu categoryLinks={categoryLinks} aboutLinks={aboutLinks} menu={menu} />
          </Suspense>

          <Link href="/" aria-label="The 64 Squares home" className="shrink-0">
            <Image
              src="/brand/logo-header.webp"
              alt="The 64 Squares"
              width={388}
              height={160}
              priority
              className="h-[38px] w-auto lg:h-[50px]"
            />
          </Link>
          {experience?.show_switch !== false && <ExperienceSwitch active="shop" className="hidden min-[400px]:flex" />}

          <Suspense fallback={<NavLinksView categoryLinks={categoryLinks} aboutLinks={aboutLinks} menu={menu} path="" />}>
            <NavLinks categoryLinks={categoryLinks} aboutLinks={aboutLinks} menu={menu} />
          </Suspense>

          <div className="ml-auto flex items-center gap-4 sm:gap-5">
            <form
              action="/shop"
              method="get"
              role="search"
              className="hidden h-[40px] w-[260px] items-center rounded-md border border-rule bg-white px-3 focus-within:border-black xl:flex"
            >
              <SearchIcon className="h-[17px] w-[17px] shrink-0 text-muted" />
              <label htmlFor="site-search" className="sr-only">
                Search
              </label>
              <input
                id="site-search"
                name="q"
                type="search"
                placeholder="Search sets, boards, clocks"
                className="ml-2 h-full w-full bg-transparent text-[14px] outline-none placeholder:text-muted"
              />
            </form>
            <ListLink />
            <Link href="/account" aria-label="Account" className="hidden sm:block">
              <UserIcon className="h-[22px] w-[21px]" />
            </Link>
            <CartLink />
          </div>
        </div>
      </header>

      <Suspense fallback={<MobileSearchView path="" />}>
        <MobileSearch />
      </Suspense>
    </>
  )
}
