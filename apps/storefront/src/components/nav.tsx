"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ChevronDown, CloseIcon, MenuIcon, SearchIcon } from "./icons"

type NavLink = { href: string; label: string }
type Menu = {
  charactersLabel: string
  charactersShow: boolean
  categoriesLabel: string
  aboutLabel: string
  extraLinks: NavLink[]
}
type Props = { categoryLinks: NavLink[]; aboutLinks: NavLink[]; menu: Menu }

const isExternal = (href: string) => /^https?:\/\//.test(href)
const aboutPaths = (links: NavLink[]) => ["/about", "/blog", "/contact", "/help", ...links.map((l) => l.href).filter((h) => h.startsWith("/"))]

const underline = "underline decoration-[1.5px] underline-offset-[8px]"

function Dropdown({
  label,
  links,
  active,
}: {
  label: string
  links: NavLink[]
  active: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-[6px] whitespace-nowrap ${active ? underline : ""}`}
      >
        {label}
        <ChevronDown className="h-[12px] w-[12px]" />
      </button>
      {open && (
        <div className="absolute left-0 top-full pt-3">
          <ul className="min-w-[220px] rounded-2xl border border-black/10 bg-white py-2 shadow-lg">
            {links.map((l) => (
              <li key={l.href + l.label}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block px-5 py-2 text-[17px] hover:bg-pill"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function NavLinks(props: Props) {
  return <NavLinksView {...props} path={usePathname()} />
}

export function NavLinksView({ categoryLinks, aboutLinks, menu, path }: Props & { path: string }) {
  return (
    <nav
      aria-label="Main"
      className="ml-[47px] hidden items-center gap-[43px] text-[20px] lg:flex xl:ml-[47px]"
    >
      {menu.charactersShow && (
        <Link
          href="/characters"
          className={`whitespace-nowrap ${path.startsWith("/characters") ? underline : ""}`}
        >
          {menu.charactersLabel}
        </Link>
      )}
      <Dropdown
        label={menu.categoriesLabel}
        links={categoryLinks}
        active={path.startsWith("/shop")}
      />
      {aboutLinks.length > 0 && (
        <Dropdown
          label={menu.aboutLabel}
          links={aboutLinks}
          active={aboutPaths(aboutLinks).some((p) => path.startsWith(p))}
        />
      )}
      {menu.extraLinks.map((l) => (
        <Link
          key={l.href + l.label}
          href={l.href}
          {...(isExternal(l.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={`whitespace-nowrap ${l.href !== "/" && path.startsWith(l.href) ? underline : ""}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  )
}

export function MobileMenu(props: Props) {
  return <MobileMenuView {...props} path={usePathname()} />
}

export function MobileMenuView({ categoryLinks, aboutLinks, menu, path }: Props & { path: string }) {
  // The menu is open only for the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === path
  const setOpen = (value: boolean) => setOpenOn(value ? path : null)

  return (
    <div className="lg:hidden">
      <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="-m-2 flex p-2">
        <MenuIcon className="h-[18px] w-[18px] sm:h-6 sm:w-6" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white px-6 pb-10 pt-5">
          <div className="flex justify-end">
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>
              <CloseIcon className="h-7 w-7" />
            </button>
          </div>
          <form action="/shop" method="get" role="search" className="mt-4 flex h-[46px] items-center rounded-full bg-pill px-4">
            <SearchIcon className="h-5 w-5" />
            <input name="q" type="search" placeholder="Search" aria-label="Search" className="ml-2 h-full w-full bg-transparent text-[17px] outline-none" />
          </form>
          <nav className="mt-8 flex flex-col gap-6 text-[22px]" aria-label="Mobile">
            {menu.charactersShow && <Link href="/characters">{menu.charactersLabel}</Link>}
            {menu.extraLinks.map((l) => (
              <Link key={l.href + l.label} href={l.href}>
                {l.label}
              </Link>
            ))}
            <div>
              <p className="font-medium">{menu.categoriesLabel}</p>
              <ul className="mt-3 flex flex-col gap-3 pl-4 text-[18px]">
                {categoryLinks.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            {aboutLinks.length > 0 && (
              <div>
                <p className="font-medium">{menu.aboutLabel}</p>
                <ul className="mt-3 flex flex-col gap-3 pl-4 text-[18px]">
                  {aboutLinks.map((l) => (
                    <li key={l.href + l.label}>
                      <Link href={l.href}>{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link href="/contact">Contact</Link>
            <Link href="/list">Wishlist</Link>
            <Link href="/cart">Cart</Link>
            <Link href="/account">Account</Link>
          </nav>
        </div>
      )}
    </div>
  )
}
