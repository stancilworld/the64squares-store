import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AUTOMATION_MODULE } from "../modules/automation"
import type AutomationModuleService from "../modules/automation/service"
import { logAutomaticEmailWorkflow } from "../workflows/automations"
import { buildMail } from "./automations"
import { sendEmail, storeUrl } from "./emails"
import { secretsOf } from "./marketing/engine"
import { apiBase, waNumber } from "./marketing/events"
import { WA_API_VERSION } from "./marketing/senders"
import { isLive, loadMarketingSettings } from "./marketing/settings"
import { formatWhen } from "./tournaments"

// Messages to a tournament's players: reminders before the start (24 hours, 1 hour and 10
// minutes), and staff messages to everyone registered. By email, and by WhatsApp when the
// business number and a "Tournament reminder" template are set up (Settings → Marketing).

export const tournamentLink = (handle: string) => `${storeUrl()}/play/tournaments/${handle}`

export const sendTournamentWhatsApp = async (c: MedusaContainer, phone: string | null | undefined, vars: [string, string, string, string]) => {
  const to = waNumber(phone)
  if (!to) return false
  const [s, k] = await Promise.all([loadMarketingSettings(c), secretsOf(c)])
  const template = s.whatsapp.template_tournament
  if (!template || !isLive(s, "whatsapp", k)) return false
  try {
    const res = await fetch(`${apiBase("meta", "https://graph.facebook.com")}/${WA_API_VERSION}/${encodeURIComponent(s.whatsapp.phone_number_id)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${k.whatsapp}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: { name: template, language: { policy: "deterministic", code: s.whatsapp.language }, components: [{ type: "body", parameters: vars.map((text) => ({ type: "text", text: text.slice(0, 1000) })) }] },
      }),
      signal: AbortSignal.timeout(15_000),
    })
    return res.ok
  } catch {
    return false
  }
}

const inWords = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000))
  if (m < 60) return `${m} minutes`
  const h = Math.round(m / 60)
  return h === 1 ? "1 hour" : `${h} hours`
}

type Row = Record<string, any>
type Pg = { raw: (q: string, b?: unknown[]) => Promise<{ rows: Row[] }> }

// Run every 5 minutes. Each player gets each reminder once; someone who registers late only
// gets the reminders still ahead.
export const sendTournamentReminders = async (c: MedusaContainer) => {
  const pg = c.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Pg
  const auto: AutomationModuleService = c.resolve(AUTOMATION_MODULE)
  const { rows } = await pg.raw(
    `select r.id, r.email, r.phone, r.player_name, r.checked_in_at, t.title, t.handle, t.starts_at, t.check_in_minutes, t.format, t.time_control
       from tournament_registration r join tournament t on t.id = r.tournament_id
      where t.deleted_at is null and r.deleted_at is null and t.status = 'published' and t.mode = 'online' and t.reminders
        and r.status = 'confirmed' and t.id not like 'trn\\_demo\\_%' and t.starts_at > now() and t.starts_at <= now() + interval '24 hours 5 minutes'`
  )
  let sent = 0
  for (const r of rows) {
    const left = new Date(r.starts_at).getTime() - Date.now()
    const kind = left <= 11 * 60_000 ? "10m" : left <= 61 * 60_000 ? "1h" : "24h"
    const key = `${r.id}:${kind}`
    if ((await auto.listEmailLogs({ kind: "tournament_reminder", key }, { take: 1 })).length) continue
    const link = tournamentLink(r.handle)
    const first = String(r.player_name ?? "").split(" ")[0] || "there"
    const checkIn = Number(r.check_in_minutes) > 0 && !r.checked_in_at ? `Check-in opens ${r.check_in_minutes} minutes before the start: players who don't check in aren't paired.` : "Open the tournament page a few minutes early."
    const mail = buildMail(
      {
        enabled: true,
        subject: kind === "10m" ? `${r.title} starts in 10 minutes` : `${r.title} starts in ${inWords(left)}`,
        heading: kind === "10m" ? "Take your seat" : "Get ready to play",
        body: `Hi {name}, ${r.title} (${r.time_control}) starts ${formatWhen(r.starts_at)}.\n\n${checkIn}`,
        button_label: kind === "24h" ? "See the tournament" : "Open the tournament",
        coupon_code: "",
      },
      { name: first, link }
    )
    const emailed = r.email ? await sendEmail(c, r.email, `tournament-reminder-${kind}`, mail) : false
    const whatsapped = await sendTournamentWhatsApp(c, r.phone, [first, r.title, formatWhen(r.starts_at), link])
    if (emailed || whatsapped) {
      await logAutomaticEmailWorkflow(c).run({ input: { kind: "tournament_reminder", key, email: r.email ?? "" } })
      sent++
    }
  }
  return sent
}

// A message from staff to every registered (or checked-in) player.
export const messagePlayers = async (c: MedusaContainer, t: Row, regs: Row[], subject: string, body: string) => {
  let emailed = 0
  let whatsapped = 0
  const link = tournamentLink(t.handle)
  for (const r of regs) {
    const first = String(r.player_name ?? "").split(" ")[0] || "there"
    const mail = buildMail({ enabled: true, subject, heading: subject, body: `Hi {name},\n\n${body}`, button_label: "Open the tournament", coupon_code: "" }, { name: first, link })
    if (r.email && (await sendEmail(c, r.email, "tournament-message", mail))) emailed++
    if (await sendTournamentWhatsApp(c, r.phone, [first, t.title, subject, link])) whatsapped++
  }
  return { emailed, whatsapped }
}
