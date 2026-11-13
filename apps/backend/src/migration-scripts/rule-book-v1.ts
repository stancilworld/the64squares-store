import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"
import { createPageWorkflow } from "../workflows/page"

/**
 * The 64 Squares Rule Book: two help pages, "The rules of chess" and "Playing on The 64
 * Squares", which with the Tournament rules and Fair-play policy make up the rule book on
 * /play/rules and in tournament lobbies. Edit them in Website → Help pages. Runs once and
 * never overwrites a page that already exists.
 */

const CHESS_RULES = `Chess is played by two players, White and Black, on a board of 64 squares. White moves first, then the players take turns. Each player starts with sixteen pieces: a king, a queen, two rooks, two bishops, two knights and eight pawns.

## The aim

Checkmate the other king: attack it so that it can't escape. The king is never captured; the game ends at checkmate.

## How the pieces move

- **King:** one square in any direction. It may never move onto a square that is attacked.
- **Queen:** any number of squares in a straight line: along a row, a column or a diagonal.
- **Rook:** any number of squares along a row or a column.
- **Bishop:** any number of squares along a diagonal. Each bishop stays on its own colour.
- **Knight:** in an L: two squares one way and one square to the side. It is the only piece that jumps over others.
- **Pawn:** one square straight forward, or two from its starting square. It captures one square diagonally forward. Pawns never move backwards.

A piece captures by moving onto the square of an opponent's piece, which is removed from the board. Only pawns capture differently from the way they move.

## Check and checkmate

A king that is attacked is **in check**. The player in check must get out of it at once: move the king, block the attack, or capture the attacking piece. A move that leaves your own king in check is not allowed.

If there is no way out of check, it is **checkmate** and the game is over.

## Special moves

- **Castling:** the king moves two squares towards a rook, and that rook jumps to the square the king crossed. Allowed only if neither piece has moved yet, the squares between them are empty, and the king is not in check, doesn't pass through an attacked square and doesn't land on one.
- **En passant:** when a pawn moves two squares and lands beside an opponent's pawn, that pawn may capture it as if it had moved only one square. This is allowed only on the very next move.
- **Promotion:** a pawn that reaches the last row becomes a queen, rook, bishop or knight (almost always a queen).

## How a game ends

- **Checkmate:** the player who gives checkmate wins.
- **Resignation:** a player may give up; the other player wins.
- **Time:** a player whose clock runs out loses, unless the opponent has no way at all to checkmate (then it's a draw).
- **Draw by agreement:** both players agree to a draw.
- **Stalemate:** the player to move has no legal move and is not in check. It's a draw.
- **Repetition:** the same position appears three times with the same player to move. It's a draw.
- **Fifty moves:** fifty moves by each player without a capture or a pawn move. It's a draw.
- **Not enough pieces:** neither player can possibly checkmate (for example king against king, or king and bishop against king). It's a draw.

## Tips for new players

- Control the centre, bring out your knights and bishops, and castle early.
- Before every move, ask what your opponent is threatening.
- Check every capture: is the piece really free?

Practise on [Puzzles](/play/puzzles) or against the [computer](/play/computer) at eight levels, from beginner to master.`

const PLAYING_GUIDE = `Everything about playing on The 64 Squares: the kinds of game, ratings, levels, Tournament Passes and how to behave at the board.

## Kinds of game

The time control is shown as minutes plus seconds: **3+2** means three minutes each, and two seconds added after every move.

- **Bullet** (1 to 2 minutes): pure speed.
- **Blitz** (3 to 5 minutes): fast and tactical, the most played.
- **Rapid** (10 to 15 minutes): time to think, plan and calculate.
- **Classical** (30 minutes): slow, deep chess, like a real tournament.

You can play **online** against people near your level, against the **computer** at eight levels, or against a **friend** with a link.

## Rated and casual games

Signed-in players play **rated** games: your rating (one for each speed) goes up when you win and down when you lose, depending on your opponent's rating. A **?** after a rating means it's still settling: new players' ratings move faster for their first games. Guests play **casual** games, which don't count for a rating.

## House Players

When nobody near your level is online, you may be offered a **House Player**: a computer opponent built to play like a person, at your level. They're always marked "House Player". Games against them count like any other game.

## Levels and XP

Every game earns XP (more for wins, for longer games and for daily missions). XP raises your level, and levels bring titles: Pawn, Knight, Bishop, Rook, Queen, King and Grandmaster. Special offers sometimes give double XP for a while.

## Tournaments and Tournament Passes

Online tournaments are free to enter with a **Tournament Pass**. You get one when you create an account and earn more by playing, solving the daily puzzle, finishing tournaments and inviting friends. See the [Tournament rules](/help/tournament-rules) for formats, check-in and prizes.

## Good manners

- Say hello and "good game". Be kind in chat, win or lose.
- Don't leave a lost game: resign instead of letting the clock run.
- No help during a game: no engines, books or other people. See the [Fair-play policy](/help/fair-play).
- Never share your phone number or address in chat.

Questions? [Contact us](/contact).`

export default async function rule_book_v1({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)
  const pages = [
    { handle: "chess-rules", title: "The rules of chess", body: CHESS_RULES, rank: 4 },
    { handle: "playing-guide", title: "Playing on The 64 Squares", body: PLAYING_GUIDE, rank: 5 },
  ]
  for (const p of pages) {
    const [existing] = await content.listPages({ handle: p.handle }, { withDeleted: true, take: 1 })
    if (existing) continue
    await createPageWorkflow(container).run({ input: { ...p, is_published: true } })
    logger.info(`Help page added: ${p.title}`)
  }
}
