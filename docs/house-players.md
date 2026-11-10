# House Players

Computer opponents that step in on **Play Online** when nobody at the player's level is free,
so a game is always available while the site is new. They are presented honestly: the player
is told before the game, and their profiles say what they are.

## How a game is found

1. The player picks a time control and clicks Play. They join the pool as before.
2. People are always paired first (closest rating, the allowed gap widening as they wait).
3. After **15–30 seconds** (random) with no person found, the page says:
   *"No one at your level is online right now. You'll play one of our House Players:
   computer opponents built to play like people."* with the opponent's card (name, picture,
   place, rating, "House Player" tag), **Play now** (starts by itself after 6 seconds) and
   **Keep waiting for a person** (no new offer for a minute).
4. If a person turns up while the offer is showing, they are paired instead.

Games are normal online games: same clocks and rules, rated (guests: casual), XP, chat, rematch,
history, review. Arena tournaments and friend challenges are people only. House Players can't
be added as friends, aren't on the leaderboard, and aren't checked by fair play (their
opponents still are).

## The roster

- 1,200 players made once on first start (`play.house`, plus `play.profile` and `play.rating`
  like everyone), from names and cities of about 30 countries (about 40% India).
- Each has a strength (400–2400, most between 800 and 1600), a pace, a style (calm ↔ attacking),
  an opening repertoire (one first move as White with answers, one defence to 1.e4 and one to
  1.d4), how readily it resigns and how chatty it is. Some have a pattern picture, others initials.
- Starting ratings equal their strength; from then on their ratings move with their games,
  like anyone's. No made-up game history.
- The level offered is the player's rating for that speed, nudged by their last six games
  (a losing run gives a slightly easier opponent, a winning run a harder one). Brand-new players
  get about 1200. A player isn't offered someone they've played in the last 30 days or 40 games.

## How they play (`apps/game/src/house`)

- **Openings:** follow their own repertoire while the game stays on it (deeper for stronger
  players), then think for themselves.
- **Moves:** Stockfish (native if the server has it, otherwise the bundled engine) looks at the
  best 6–8 moves at a depth that grows with strength. The move is chosen like a person of that
  strength would: usually a good one, sometimes the second-best, sometimes a natural-looking
  mistake; more mistakes when short of time. Attacking players lean to captures and checks.
- **Time:** depends on the clock and increment, the move number, how hard the position is
  (obvious recaptures are quick, close choices slow), known opening moves (quick), a random
  spread with occasional long thinks, and hurrying when short of time. Bullet averages about a
  second a move, 10-minute games about 10 seconds.
- **Behaviour:** resigns when clearly lost for a while (some play on to mate; never when the
  opponent is about to flag), answers draw offers (accepts when worse, or level late on),
  rarely offers a draw in long level endings, sometimes says hi / good game (quick messages
  only), usually accepts a rematch, claims the game if the opponent leaves and doesn't return.

Move quality was measured in self-play, judged by a deeper search (average loss per move in
centipawns, and moves losing 3+ pawns): strength 600 ≈ 114 / 10%, 1000 ≈ 77 / 4%, 1400 ≈ 60 / 3%,
1800 ≈ 34 / under 1%, 2200 ≈ 24 / 1%. That was before a last small adjustment toward typical
online players (roughly 100 / 75 / 50 / 30 for 1000 / 1400 / 1800 / 2200), so they now err a little more.
Stronger players clearly beat weaker ones (a 400-point gap wins about 9 games in 10).

## Settings and data

- Tables: `play.house` (persona JSON, `active` to retire one). Pictures in the avatar folder
  (`house_xxxx-p.webp`).
- Lobby API adds `house_ready` (House Players free right now). The homepage "players online"
  count is people only.
- To pause House Players: `update play.house set active = false;` (nobody is offered one).
