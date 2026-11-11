import type { Metadata } from "next"
import { FillMedia } from "@/components/media"
import { NewsletterSection } from "@/components/newsletter-section"
import { TeamFaces } from "@/components/team-faces"
import { getContent, getTeamMembers } from "@/lib/data"
import { seoMetadata } from "@/lib/seo"

export const generateMetadata = (): Promise<Metadata> => seoMetadata({ path: "/about", title: "About us" })

export default async function AboutPage() {
  const [blocks, home, members] = await Promise.all([
    getContent("about"),
    getContent("home"),
    getTeamMembers(),
  ])
  const faces = members.filter((m) => m.box && m.canvas_width && m.canvas_height)
  const one = (section: string) => blocks.find((b) => b.section === section)
  const intro = one("intro")
  const team = one("team")
  const contact = one("contact")
  const newsletter = home.find((b) => b.section === "newsletter")

  return (
    <>
      {intro && (
        <section className="pt-[56px] lg:pt-[60px]">
          <h1 className="mx-auto max-w-[1440px] px-6 text-center font-display h-page lg:px-[74px]">
            {intro.title}
          </h1>
          {/* Full screen width; at least as tall as the old in-page picture (2880 × 856 shape at
              the page's content width). It grows only if the text needs more room. */}
          <div className="relative mt-[32px] flex min-h-[calc((100vw_-_48px)*856/2880)] w-full items-center overflow-hidden bg-placeholder lg:mt-[8px] lg:min-h-[calc(min(1292px,100vw_-_148px)*856/2880)]">
            {intro.image_url && (
              // Narrower screens crop to the left (the plain side behind the text); wide screens show it all.
              <FillMedia src={intro.image_url} sizes="100vw" className="object-cover object-left xl:object-center" />
            )}
            {intro.body && (
              <div className="relative mx-auto w-full max-w-[1440px] px-6 py-[28px] lg:px-[74px] lg:py-[24px]">
                <div className="max-w-[640px] lg:max-w-[min(640px,55vw)] space-y-[14px] text-[15px] leading-[20px] lg:space-y-[16px] lg:text-[16px] lg:leading-[21px]">
                  {intro.body.split(/\n\s*\n/).map((p, i) => (
                    <p key={i} className="whitespace-pre-line">
                      {p.trim()}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {team && (
        <section className="mx-auto mt-[96px] max-w-[1440px] px-6 lg:mt-[139px] lg:pl-[178px] lg:pr-[166px]">
          <h2 className="text-center font-display h-page">{team.title}</h2>
          {faces.length > 0 ? (
            // Interactive faces (edited under About us → Team faces in the admin).
            <div className="-mx-3 mt-[16px] max-w-[1100px] sm:mx-auto sm:w-full lg:mt-[24px]">
              <TeamFaces members={faces} />
            </div>
          ) : (
            <div className="relative mt-[40px] aspect-[1096/430] w-full overflow-hidden bg-placeholder lg:mt-[100px]">
              {team.image_url && (
                <FillMedia src={team.image_url} sizes="(min-width: 1024px) 1096px, 100vw" />
              )}
            </div>
          )}
        </section>
      )}

      {contact && (
        <section className="mx-auto mt-[96px] grid max-w-[1440px] gap-10 px-6 lg:mt-[180px] xl:grid-cols-[492px_545px] xl:gap-[50px] xl:pl-[179px]">
          <div className="relative aspect-[492/641] w-full overflow-hidden bg-placeholder">
            {contact.image_url && (
              <FillMedia src={contact.image_url} sizes="(min-width: 1024px) 492px, 100vw" />
            )}
          </div>
          <div className="lg:mt-[19px]">
            <p className="font-display h-page">
              {contact.title}
            </p>
            {contact.body && (
              <p className="mt-[34px] font-display h-page lg:mt-[70px]">
                {contact.body}
              </p>
            )}
            {contact.link_url && (
              <a
                href={contact.link_url}
                className="mt-[40px] btn btn-solid lg:mt-[93px]"
              >
                {contact.link_label || "Email us"}
              </a>
            )}
          </div>
        </section>
      )}

      {newsletter && (
        <NewsletterSection
          block={newsletter}
          className="mb-[96px] mt-[96px] lg:mb-[145px] lg:mt-[161px] lg:pl-[178px] lg:pr-[166px]"
        />
      )}
    </>
  )
}
