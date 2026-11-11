"use client"

import { useState } from "react"
import type { Invite } from "@/lib/auth"
import { formatPrice } from "@/lib/format"
import { WhatsAppIcon } from "../icons"

// "Invite friends" on the account page: a friend gets money off, you get a thank-you code.
export function InviteFriends({ invite }: { invite: Invite }) {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (what: string, text: string) =>
    navigator.clipboard?.writeText(text).then(
      () => setCopied(what),
      () => {}
    )
  const message = `I buy my chess sets from The 64 Squares. Use my code ${invite.code} to get ${formatPrice(invite.give_amount)} off: ${invite.link}`
  return (
    <div className="max-w-[640px]">
      <p className="text-[16px] lg:text-[17px]">
        Your friends get <strong>{formatPrice(invite.give_amount)} off</strong>
        {invite.min_order > 0 ? ` orders over ${formatPrice(invite.min_order)}` : ""}.
        {invite.get_amount > 0 && (
          <>
            {" "}
            When a friend places their first order, you get a <strong>{formatPrice(invite.get_amount)}</strong> code by email.
          </>
        )}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="rounded-md border-2 border-dashed border-black/40 bg-amber/20 px-4 py-2 text-[20px] font-extrabold tracking-[0.08em]">{invite.code}</span>
        <button type="button" onClick={() => copy("code", invite.code)} className="h-[40px] rounded-md border border-black px-4 text-[15px] hover:bg-chalk">
          {copied === "code" ? "Copied" : "Copy code"}
        </button>
        <button type="button" onClick={() => copy("link", invite.link)} className="h-[40px] rounded-md border border-black px-4 text-[15px] hover:bg-chalk">
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-[40px] items-center gap-2 rounded-md bg-[#25d366] px-4 text-[15px] font-semibold text-black"
        >
          <WhatsAppIcon className="h-[18px] w-[18px]" />
          Share on WhatsApp
        </a>
      </div>
      {(invite.uses > 0 || invite.rewards > 0) && (
        <p className="mt-4 text-[15px] text-black/70">
          {invite.uses} {invite.uses === 1 ? "friend has" : "friends have"} ordered with your code
          {invite.rewards > 0 ? ` · ${invite.rewards} thank-you ${invite.rewards === 1 ? "code" : "codes"} sent` : ""}.
        </p>
      )}
    </div>
  )
}
