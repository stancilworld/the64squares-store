import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"
import { createPageWorkflow } from "../workflows/page"

/**
 * Online tournaments: the Tournament rules and Fair-play policy help pages that players
 * agree to when they first register (edit them in Website → Help pages). Runs once and never
 * overwrites a page that already exists.
 */

const RULES = `These rules apply to every online tournament on The 64 Squares. A tournament's own page can add to them (its format, time control, prizes and any age or rating limit).

## Entry

- Online tournaments are free to enter. Most use a **Tournament Pass**: you get one when you create an account, and earn more by playing rated games, solving the daily puzzle several days in a row, finishing tournaments and inviting friends who join and play.
- Passes are never sold, can't be transferred to anyone else and have no cash value.
- If you can't make it, give up your place on the tournament page before check-in closes and your pass comes back. If we cancel a tournament, every pass comes back.
- One account per player. Your name, date of birth, city and state must be true: prizes and certificates use them.

## Players under 18

A parent or guardian must agree to a player under 18 taking part, and give their name and phone number. We may contact them before sending a prize.

## Check-in

Swiss and Knockout tournaments open check-in before the start (usually 30 minutes). Press **Check in now** on the tournament page. Players who don't check in aren't paired, and their pass isn't returned. Arenas don't need check-in: press **Join the arena** while it's on.

If too few players check in, the tournament is called off and every pass comes back.

## Playing

- Your game opens by itself when you're paired. Stay on the tournament page.
- If you don't make your first move in time, you lose that game. In a Swiss tournament you also leave the tournament; in a Knockout you lose the match.
- Tournament games can't be aborted. Leaving or disconnecting doesn't stop your clock.
- Only real players take part: no computer opponents and no House Players.

## Formats and tie-breaks

- **Arena:** play as many games as you can before the time runs out. A win scores 2, a draw 1. Two wins in a row put you on fire: double points until you stop winning. Ties go to more wins, then fewer games.
- **Swiss:** everyone plays every round against someone on the same score, never the same opponent twice. A bye scores 1 point. Ties are split by Buchholz (cut 1), then Sonneborn-Berger, then wins, then games with Black.
- **Knockout:** players are seeded by rating. A match is one or more games; a drawn match goes to a sudden-death (Armageddon) game in which a draw is enough for Black, and the higher seed plays Black. If sudden death is off, the higher seed goes through.

## Results and prizes

Results are provisional when the last game ends. The prize places are checked under our [fair-play policy](/help/fair-play) and the results are confirmed within 48 hours. Prize winners are then asked for a delivery address in India; we post prizes free. A disqualified player loses their place and prize.

Everyone who plays gets a certificate with a number and a QR code anyone can use to check it.

## The arbiter

Our arbiters can pause pairing, correct a result (with a reason shown to players), remove a player, or cancel a tournament. Their decision is final. Questions? [Contact us](/contact).`

const FAIR_PLAY = `We want every game on The 64 Squares to be a fair game between two people.

## Not allowed

- Any help during a game: chess engines, analysis boards, apps, books, databases or another person.
- Playing on someone else's account, or letting someone play on yours.
- More than one account, or losing games on purpose to help another player.
- Leaving games on purpose, stalling, or abusing other players in chat.

## How we check

Every rated game and every tournament game is checked automatically for signs of engine help (how closely moves match an engine, how fast difficult moves are found, and sudden changes in strength). Flagged players are reviewed by a person; a flag on its own is never enough to close an account.

The top finishers of every tournament are reviewed before prizes are confirmed, within 48 hours of the end.

## What happens

Depending on what we find, we clear the player, warn them, or close their account for rated games or for all play. A player closed for cheating loses their tournament places, prizes and certificates, and the tournament's results are corrected.

If you think we got it wrong, write to us through the [contact page](/contact) within 14 days and we'll look again.

## Tell us about a player

If you think an opponent cheated, send us the game's link through the [contact page](/contact). What you tell us stays private.`

export default async function tournament_pages_v1({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)
  const pages = [
    { handle: "tournament-rules", title: "Tournament rules", body: RULES, rank: 6 },
    { handle: "fair-play", title: "Fair-play policy", body: FAIR_PLAY, rank: 7 },
  ]
  for (const p of pages) {
    const [existing] = await content.listPages({ handle: p.handle }, { withDeleted: true, take: 1 })
    if (existing) continue
    await createPageWorkflow(container).run({ input: { ...p, is_published: true } })
    logger.info(`Help page added: ${p.title}`)
  }
}
