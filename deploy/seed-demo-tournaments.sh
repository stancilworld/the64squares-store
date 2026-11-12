#!/usr/bin/env bash
# Adds demo tournaments (finished, live and upcoming Arena, Swiss and Knockout events with
# results, brackets, prizes, certificates and replayable games) to see how the tournament
# pages look. Everything is titled "Demo ·" and nothing is emailed. Run as root:
#   bash /opt/the64squares/app/deploy/seed-demo-tournaments.sh            add or refresh
#   bash /opt/the64squares/app/deploy/seed-demo-tournaments.sh --remove   delete them
set -euo pipefail
BASE=/opt/the64squares
APP=$BASE/app
if [ ! -f "$APP/apps/game/dist/seed-demo.js" ]; then
  echo "Run the update first: bash $APP/deploy/update.sh"
  exit 1
fi
cd "$APP/apps/game"
set -a
. "$BASE/game.env"
set +a
node dist/seed-demo.js "$@"
