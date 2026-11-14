#!/usr/bin/env bash
# Lobby voice: installs and runs a LiveKit server on this VPS (called by build.sh, as root).
# It sits idle (a few MB of memory, no CPU) until lobby voice is switched on in
# Website → Site features and a moderator starts voice in a lobby. It is held to one CPU
# core so games and the shops always keep the other.
#   Signalling: wss://API_DOMAIN/rtc through nginx (private port 7880).
#   Audio: 7881/tcp and 7882/udp, opened in the firewall here. If your hosting has its own
#   firewall in its control panel (Hostinger: VPS → Firewall), open those two there too.
# To use LiveKit Cloud instead, add its URL, key and secret in Settings → Keys; this server
# then simply stays idle.
set -euo pipefail

BASE=${BASE:-/opt/the64squares}
APP=${APP:-$BASE/app}
APP_USER=${APP_USER:-the64squares}
SERVER=${SERVER:-$APP/apps/backend/.medusa/server}
API_DOMAIN=${API_DOMAIN:?API_DOMAIN not set}
LK_VERSION=1.13.10
LK_BIN=/usr/local/bin/livekit-server
LK_CONF=/etc/the64squares/livekit.yaml

echo "-> Lobby voice server (LiveKit $LK_VERSION)"
if ! "$LK_BIN" --version 2>/dev/null | grep -q " $LK_VERSION$"; then
  case "$(uname -m)" in
    x86_64) LK_ARCH=amd64 ;;
    aarch64 | arm64) LK_ARCH=arm64 ;;
    *) LK_ARCH="" ;;
  esac
  if [ -z "$LK_ARCH" ]; then
    echo "Warning: no voice server for this kind of processor; lobby voice needs LiveKit Cloud here."
    exit 0
  fi
  TMP=$(mktemp -d)
  if curl -fsSL --retry 3 "https://github.com/livekit/livekit/releases/download/v$LK_VERSION/livekit_${LK_VERSION}_linux_${LK_ARCH}.tar.gz" | tar -xz -C "$TMP" livekit-server; then
    install -m 755 "$TMP/livekit-server" "$LK_BIN"
  else
    echo "Warning: the voice server couldn't be downloaded; lobby voice stays unavailable until the next update."
    rm -rf "$TMP"
    exit 0
  fi
  rm -rf "$TMP"
fi

# Its own key and secret, made once.
LK_FILE="$BASE/livekit.keys"
if [ ! -s "$LK_FILE" ]; then
  (umask 077 && printf 'LK_KEY=T64%s\nLK_SECRET=%s\n' "$(openssl rand -hex 6)" "$(openssl rand -hex 32)" > "$LK_FILE")
fi
# shellcheck disable=SC1090
. "$LK_FILE"

install -d -m 750 -o root -g "$APP_USER" /etc/the64squares
(
  umask 027
  cat > "$LK_CONF" <<CONF
port: 7880
bind_addresses:
  - 127.0.0.1
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true
keys:
  $LK_KEY: $LK_SECRET
room:
  max_participants: 160
  empty_timeout: 300
logging:
  level: warn
CONF
)
chown root:"$APP_USER" "$LK_CONF"
chmod 640 "$LK_CONF"

if ! cmp -s "$APP/deploy/systemd/the64squares-voice.service" /etc/systemd/system/the64squares-voice.service; then
  install -m 644 "$APP/deploy/systemd/the64squares-voice.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable the64squares-voice >/dev/null
fi
systemctl restart the64squares-voice

# The backend tells the game server where the voice server is (unless LiveKit Cloud keys
# are saved in the admin, which win).
for kv in "LIVEKIT_URL=wss://$API_DOMAIN" "LIVEKIT_API_KEY=$LK_KEY" "LIVEKIT_API_SECRET=$LK_SECRET" "LIVEKIT_API_URL=http://127.0.0.1:7880"; do
  grep -q "^${kv%%=*}=" "$SERVER/.env" || printf '%s\n' "$kv" >> "$SERVER/.env"
done

# Firewall: the audio ports.
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 7881/tcp comment "the64squares voice" >/dev/null
  ufw allow 7882/udp comment "the64squares voice" >/dev/null
fi

# Web server: signalling on the API domain.
NGINX_CONF=/etc/nginx/sites-available/the64squares.conf
if [ -f "$NGINX_CONF" ] && ! grep -q 'location /rtc' "$NGINX_CONF"; then
  cp "$NGINX_CONF" "$NGINX_CONF.before-voice"
  awk -v route="$APP/deploy/nginx/voice-route.conf" '
    /location \/game\/ \{/ { while ((getline line < route) > 0) print line; close(route) }
    { print }' "$NGINX_CONF.before-voice" > "$NGINX_CONF"
  if nginx -t 2>/dev/null; then
    systemctl reload nginx
  else
    mv "$NGINX_CONF.before-voice" "$NGINX_CONF"
    echo "Warning: the web server rejected the voice route, so it was left as it was. Lobby voice won't connect."
  fi
fi
