#!/usr/bin/env bash
# Builds and (re)starts The64Squares backend and storefront. Run as root.
# Called by setup-vps.sh, update.sh and go-live.sh.
#
# This server also runs another store (Stancil). Builds run inside a generous memory limit
# (BUILD_MEM_MAX) so even a runaway build can never take the other store's memory.
set -euo pipefail

BASE=/opt/the64squares
APP="$BASE/app"
APP_USER=the64squares
DB_NAME=the64squares
BACKEND_PORT=9100
STORE_PORT=8100
STORE_DOMAIN="${STORE_DOMAIN:-staging.the64squares.in}"
API_DOMAIN="${API_DOMAIN:-api-staging.the64squares.in}"
SERVER="$APP/apps/backend/.medusa/server"
BUILD_MEM_MAX="${BUILD_MEM_MAX:-3500M}"
# Set by go-live.sh once the store runs on the real domain.
[ -f "$BASE/domains.env" ] && . "$BASE/domains.env"

# Runs a command as the app user inside the memory limit, at slightly lower CPU priority.
as_app() {
  systemd-run --quiet --scope --collect -p MemoryMax="$BUILD_MEM_MAX" \
    nice -n 5 sudo -u "$APP_USER" -H env NODE_OPTIONS=--max-old-space-size=2048 "$@"
}

echo "-> Installing packages"
installed=no
for attempt in 1 2 3; do
  if (cd "$APP" && as_app npm ci --no-audit --no-fund --loglevel=error); then
    installed=yes
    break
  fi
  echo "Package install failed (attempt $attempt). Clearing the download cache and retrying..."
  sudo -u "$APP_USER" -H npm cache clean --force >/dev/null 2>&1 || true
  rm -rf "$APP/node_modules" "$APP"/apps/*/node_modules
  sleep 5
done
[ "$installed" = yes ] || { echo "Package install failed 3 times."; exit 1; }

echo "-> Building backend and admin"
(cd "$APP/apps/backend" && as_app npx medusa build)

echo "-> Preparing the production server"
install -m 600 -o "$APP_USER" -g "$APP_USER" "$APP/apps/backend/.env" "$SERVER/.env"
# Website preview (admin → Preview): one random secret shared by the backend and storefront.
PREVIEW_FILE="$BASE/preview.secret"
if [ ! -s "$PREVIEW_FILE" ]; then
  (umask 077 && openssl rand -hex 32 > "$PREVIEW_FILE")
fi
PREVIEW_SECRET=$(tr -d '[:space:]' < "$PREVIEW_FILE")
if ! grep -q '^T64_PREVIEW_SECRET=' "$SERVER/.env"; then
  printf '\nT64_PREVIEW_SECRET=%s\n' "$PREVIEW_SECRET" >> "$SERVER/.env"
fi
# No separate install here: the built server lives inside the repo, so it uses the packages
# already installed above from package-lock.json.
rm -rf "$SERVER/node_modules"
# Uploaded images live outside the build folder so rebuilds keep them.
rm -rf "$SERVER/static"
ln -s "$BASE/uploads" "$SERVER/static"

echo "-> Updating the database"
(cd "$SERVER" && as_app npx medusa db:migrate)

echo "-> Starting backend and worker"
systemctl restart the64squares-backend the64squares-worker
for _ in $(seq 1 60); do
  curl -sf "http://localhost:$BACKEND_PORT/health" >/dev/null && break
  sleep 3
done
curl -sf "http://localhost:$BACKEND_PORT/health" >/dev/null || {
  echo "Backend did not start. See: journalctl -u the64squares-backend -n 100"
  exit 1
}

echo "-> Building storefront"
KEY=$(cd / && sudo -u postgres psql -d "$DB_NAME" -Atc \
  "select token from api_key where type = 'publishable' and title = 'The64Squares Storefront' and deleted_at is null order by created_at limit 1")
[ -n "$KEY" ] || { echo "No publishable key found in the database."; exit 1; }
cat > "$APP/apps/storefront/.env.local" <<EOF
MEDUSA_BACKEND_URL=http://localhost:$BACKEND_PORT
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$KEY
T64_PREVIEW_SECRET=$PREVIEW_SECRET
EOF
chown "$APP_USER:$APP_USER" "$APP/apps/storefront/.env.local"
chmod 600 "$APP/apps/storefront/.env.local"
# Build into .next-new first; the running store keeps using .next until this succeeds.
SF="$APP/apps/storefront"
rm -rf "$SF/.next-new"
if ! (cd "$SF" && as_app env NEXT_DIST_DIR=.next-new npx next build); then
  rm -rf "$SF/.next-new"
  echo "Storefront build failed. The website was left as it was (nothing changed for customers)."
  exit 1
fi
rm -rf "$SF/.next-old"
[ -d "$SF/.next" ] && mv "$SF/.next" "$SF/.next-old"
mv "$SF/.next-new" "$SF/.next"

systemctl restart the64squares-storefront
for _ in $(seq 1 30); do
  curl -sf -o /dev/null "http://localhost:$STORE_PORT/" && break
  sleep 2
done
echo "-> Done. Store on :$STORE_PORT, API on :$BACKEND_PORT (https://$API_DOMAIN)"
