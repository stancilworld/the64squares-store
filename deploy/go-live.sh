#!/usr/bin/env bash
# Moves the store from the staging addresses to the real domain. Run once, as root:
#   bash /opt/the64squares/app/deploy/go-live.sh
#
# After this:
#   https://the64squares.in              the store
#   https://www.the64squares.in          redirects to https://the64squares.in
#   https://staging.the64squares.in      redirects to https://the64squares.in
#   https://api.the64squares.in/app      the admin
#   https://api-staging.the64squares.in  still works (pictures uploaded so far use this address)
#
# Safe order: nothing changes until DNS is right and the SSL certificate is issued.
# If the certificate fails, the old web server settings are put back and staging keeps working.
set -euo pipefail

LIVE_DOMAIN="${LIVE_DOMAIN:-the64squares.in}"
WWW_DOMAIN="www.$LIVE_DOMAIN"
LIVE_API="${LIVE_API:-api.$LIVE_DOMAIN}"
OLD_STORE="${OLD_STORE:-staging.$LIVE_DOMAIN}"
OLD_API="${OLD_API:-api-staging.$LIVE_DOMAIN}"

BASE=/opt/the64squares
APP="$BASE/app"
ENV_FILE="$APP/apps/backend/.env"
CONF=/etc/nginx/sites-available/the64squares.conf

say() { printf "\n\033[1;34m==> %s\033[0m\n" "$1"; }
fail() { printf "\n\033[1;31m%s\033[0m\n" "$1"; exit 1; }

[ "$(id -u)" = 0 ] || fail "Run this as root."
[ -f "$ENV_FILE" ] || fail "The 64 Squares is not installed here yet (no $ENV_FILE)."

exec 9>/run/the64squares-setup.lock
flock -n 9 || fail "The setup or go-live is already running. Wait for it to finish, then run this again."

command -v dig >/dev/null || { apt-get install -y -qq dnsutils >/dev/null; }

# ---------------------------------------------------------------- 1. DNS
say "Checking DNS"
SERVER_IP=$(curl -4 -s --max-time 10 https://api.ipify.org || true)
[ -n "$SERVER_IP" ] || SERVER_IP=$(hostname -I | tr ' ' '\n' | grep -E '^[0-9.]+$' | grep -v '^127\.' | head -1 || true)
SERVER_IP6=$(ip -6 addr show scope global 2>/dev/null | awk '/inet6/{print $2}' | cut -d/ -f1 | tr '\n' ' ' || true)
echo "This server: $SERVER_IP"

dns_ok=yes
for name in "$LIVE_DOMAIN" "$WWW_DOMAIN" "$LIVE_API" "$OLD_STORE" "$OLD_API"; do
  ip=$(dig +short A "$name" @1.1.1.1 | grep -E '^[0-9.]+$' | tail -1 || true)
  if [ "$ip" = "$SERVER_IP" ]; then
    echo "  OK       $name -> $ip"
  else
    echo "  NOT YET  $name -> ${ip:-nothing} (needs $SERVER_IP)"
    dns_ok=no
  fi
  # An IPv6 (AAAA) record pointing somewhere else makes the SSL check fail.
  for ip6 in $(dig +short AAAA "$name" @1.1.1.1 | grep ':' || true); do
    if ! grep -qw "$ip6" <<<"$SERVER_IP6"; then
      echo "  PROBLEM  $name has an AAAA (IPv6) record $ip6 that is not this server. Delete it in Hostinger DNS."
      dns_ok=no
    fi
  done
done
if [ "$dns_ok" != yes ]; then
  fail "DNS is not ready. In Hostinger DNS for $LIVE_DOMAIN set:
  A     @        $SERVER_IP
  A     www      $SERVER_IP   (or CNAME www -> $LIVE_DOMAIN)
  A     api      $SERVER_IP
and delete any other A or AAAA records for @, www and api. Do not touch MX or TXT records (email).
Changes can take 5-30 minutes to spread. Then run this again. Nothing was changed."
fi

# ---------------------------------------------------------------- 2. Web server + SSL
say "Web server settings"
BACKUP="$CONF.before-go-live.$(date +%Y%m%d%H%M%S)"
cp "$CONF" "$BACKUP"
cat > "$CONF" <<EOF
# Written by deploy/go-live.sh. certbot adds the HTTPS parts.

# The store.
server {
  listen 80;
  server_name $LIVE_DOMAIN;

  location / {
    proxy_pass http://127.0.0.1:8100;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}

# www and the old staging address go to the real store.
server {
  listen 80;
  server_name $WWW_DOMAIN $OLD_STORE;
  return 301 https://$LIVE_DOMAIN\$request_uri;
}

# Admin, API and uploaded files. The old address stays so earlier picture links keep working.
server {
  listen 80;
  server_name $LIVE_API $OLD_API;
  client_max_body_size 100m;

  location /static/ {
    alias $BASE/uploads/;
    expires 30d;
    add_header Cache-Control "public";
  }

  location / {
    proxy_pass http://127.0.0.1:9100;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
  }
}
EOF

restore_nginx() {
  cp "$BACKUP" "$CONF"
  nginx -t && systemctl reload nginx
}

if ! nginx -t; then
  restore_nginx
  fail "The new web server settings were rejected, so the old ones were put back. Nothing else changed."
fi
systemctl reload nginx

say "SSL certificate for all addresses"
# The certbot account made during setup is reused (it keeps any expiry-notice email given then).
if [ -d /etc/letsencrypt/accounts ]; then EMAIL_ARG=(); else EMAIL_ARG=(--register-unsafely-without-email); fi
if ! certbot --nginx --non-interactive --agree-tos "${EMAIL_ARG[@]}" --redirect \
  --cert-name the64squares-live --expand \
  -d "$LIVE_DOMAIN" -d "$WWW_DOMAIN" -d "$LIVE_API" -d "$OLD_STORE" -d "$OLD_API"; then
  restore_nginx
  fail "The SSL certificate could not be issued, so the old settings were put back and staging still works.
Usually this means DNS has not spread everywhere yet. Wait 15 minutes and run this again."
fi

# ---------------------------------------------------------------- 3. App settings + rebuild
say "Pointing the store and admin at $LIVE_DOMAIN"
set_env() {
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    echo "$1=$2" >> "$ENV_FILE"
  fi
}
set_env MEDUSA_BACKEND_URL "https://$LIVE_API"
set_env STORE_CORS "https://$LIVE_DOMAIN,https://$WWW_DOMAIN,https://$OLD_STORE"
set_env ADMIN_CORS "https://$LIVE_API,https://$OLD_API"
set_env AUTH_CORS "https://$LIVE_DOMAIN,https://$WWW_DOMAIN,https://$LIVE_API,https://$OLD_STORE,https://$OLD_API"

# Remembered so setup and updates keep using the real domain.
cat > "$BASE/domains.env" <<EOF
STORE_DOMAIN=$LIVE_DOMAIN
API_DOMAIN=$LIVE_API
EOF

say "Rebuilding (5-10 minutes; the site stays up meanwhile)"
STORE_DOMAIN="$LIVE_DOMAIN" API_DOMAIN="$LIVE_API" bash "$APP/deploy/build.sh"

# ---------------------------------------------------------------- 4. Check
say "Checking"
ok=yes
for url in "https://$LIVE_DOMAIN/" "https://$LIVE_API/health" "https://$LIVE_API/app/login"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url" || echo 000)
  echo "  $code  $url"
  [ "$code" = 200 ] || ok=no
done

printf "\n\033[1;32m================ The 64 Squares is live ================\033[0m\n"
echo "Store:  https://$LIVE_DOMAIN"
echo "Admin:  https://$LIVE_API/app   (same login as before)"
echo "www.$LIVE_DOMAIN and $OLD_STORE now redirect to https://$LIVE_DOMAIN"
[ "$ok" = yes ] || echo "One check did not return 200. Send me the lines above."
