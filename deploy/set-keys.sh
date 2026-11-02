#!/usr/bin/env bash
# Adds or changes the keys for payments, emails, Google sign-in and Delhivery. Run as root:
#   bash /opt/the64squares/app/deploy/set-keys.sh
#
# Easier: the main admin can do all of this in the admin, under Settings → Payments &
# delivery → Keys. Keys saved there take priority over the ones set here.
#
# For each key it shows whether it's set, and asks for a new value. Press Enter to keep the
# current one. Secret keys are hidden while you type (paste, then press Enter).
# Keys are stored only on this server (apps/backend/.env, readable by the app only), never in
# Git and never in the admin. The API and worker restart at the end (about 30 seconds).
set -euo pipefail

BASE=/opt/the64squares
APP="$BASE/app"
APP_USER=the64squares
ENV_FILE="$APP/apps/backend/.env"
SERVER_ENV="$APP/apps/backend/.medusa/server/.env"

say() { printf "\n\033[1;34m==> %s\033[0m\n" "$1"; }
fail() { printf "\n\033[1;31m%s\033[0m\n" "$1"; exit 1; }
note() { printf "    %s\n" "$1"; }

[ "$(id -u)" = 0 ] || fail "Run this as root."
[ -f "$ENV_FILE" ] || fail "The64Squares is not installed here yet (no $ENV_FILE)."
[ -f "$BASE/domains.env" ] && . "$BASE/domains.env"
API_URL="$(grep -E '^MEDUSA_BACKEND_URL=' "$ENV_FILE" | cut -d= -f2- || true)"
STORE_URL="$(grep -E '^STORE_CORS=' "$ENV_FILE" | cut -d= -f2- | cut -d, -f1 || true)"

current() { grep -E "^$1=" "$ENV_FILE" | cut -d= -f2- || true; }

set_env() {
  local key="$1" value="$2"
  # Values are written as-is; refuse characters that would break the file.
  case "$value" in *$'\n'*|*'|'*) fail "That value has a character that isn't allowed. Nothing was changed for $key." ;; esac
  if grep -q "^$key=" "$ENV_FILE"; then
    sed -i "s|^$key=.*|$key=$value|" "$ENV_FILE"
  else
    echo "$key=$value" >> "$ENV_FILE"
  fi
}

CHANGED=0
ask() {
  # ask KEY "Label" secret|plain "pattern hint" regex
  local key="$1" label="$2" kind="$3" hint="$4" pattern="${5:-}"
  local now value status
  now="$(current "$key")"
  if [ -n "$now" ]; then
    if [ "$kind" = secret ]; then status="set (…${now: -4})"; else status="set: $now"; fi
  else
    status="not set"
  fi
  printf "\n\033[1m%s\033[0m  [%s]\n" "$label" "$status"
  [ -n "$hint" ] && note "$hint"
  while true; do
    if [ "$kind" = secret ]; then
      read -r -s -p "    New value (Enter = keep, - = remove): " value; echo
    else
      read -r -p "    New value (Enter = keep, - = remove): " value
    fi
    if [ "$kind" = secret ]; then
      value="$(printf "%s" "$value" | tr -d '[:space:]')"
    else
      value="$(printf "%s" "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    fi
    [ -z "$value" ] && return 0
    if [ "$value" = "-" ]; then
      sed -i "/^$key=/d" "$ENV_FILE"; CHANGED=1; note "Removed."; return 0
    fi
    if [ -n "$pattern" ] && ! printf "%s" "$value" | grep -Eq "$pattern"; then
      note "That doesn't look right ($hint). Try again, or press Enter to skip."
      continue
    fi
    set_env "$key" "$value"; CHANGED=1; note "Saved."; return 0
  done
}

say "Razorpay (online payments)"
note "Razorpay dashboard → Account & Settings → API Keys. Use the rzp_test_ keys first, then the rzp_live_ keys."
ask RAZORPAY_KEY_ID "Razorpay Key Id" plain "starts with rzp_test_ or rzp_live_" '^rzp_(test|live)_[A-Za-z0-9]+$'
ask RAZORPAY_KEY_SECRET "Razorpay Key Secret" secret "shown once when the key is made" '^[A-Za-z0-9]{10,}$'
note "Webhook: Razorpay → Account & Settings → Webhooks → Add New Webhook"
note "  URL:    ${API_URL:-https://api.the64squares.in}/hooks/payment/razorpay_razorpay"
note "  Events: order.paid, payment.captured, payment.failed"
note "  Secret: make up a long random password, type it there AND here."
ask RAZORPAY_WEBHOOK_SECRET "Razorpay Webhook Secret" secret "the secret you typed in Razorpay's webhook form" '^.{8,}$'

say "Emails (Resend)"
note "resend.com → Domains → add the64squares.in and copy its DNS records into Hostinger; then API Keys → Create."
ask RESEND_API_KEY "Resend API key" secret "starts with re_" '^re_[A-Za-z0-9_]+$'
ask EMAIL_FROM "Send emails from" plain "e.g. The64Squares <orders@the64squares.in>, on the domain you added in Resend" '^[^<>]*<?[^ <>@]+@[^ <>@]+\.[a-z]{2,}>?$'

say "Sign in with Google (optional)"
note "console.cloud.google.com → APIs & Services → Credentials → Create OAuth client ID → Web application."
note "  Authorised redirect URI: ${STORE_URL:-https://the64squares.in}/account/google"
ask GOOGLE_CLIENT_ID "Google Client ID" plain "ends with .apps.googleusercontent.com" '\.apps\.googleusercontent\.com$'
ask GOOGLE_CLIENT_SECRET "Google Client Secret" secret "starts with GOCSPX-" '^.{10,}$'

say "Delhivery (optional)"
note "Delhivery One → Settings → API Setup → API token. Without it, every valid pincode is accepted."
ask DELHIVERY_TOKEN "Delhivery API token" secret "a long string of letters and numbers" '^[A-Za-z0-9]{16,}$'

if [ "$CHANGED" = 0 ]; then
  say "Nothing changed."
  exit 0
fi

chown "$APP_USER:$APP_USER" "$ENV_FILE"; chmod 600 "$ENV_FILE"
if [ -d "$(dirname "$SERVER_ENV")" ]; then
  install -m 600 -o "$APP_USER" -g "$APP_USER" "$ENV_FILE" "$SERVER_ENV"
fi

say "Restarting the API and worker"
systemctl restart the64squares-backend the64squares-worker
for _ in $(seq 1 40); do
  curl -sf http://127.0.0.1:9100/health >/dev/null && break
  sleep 3
done
if curl -sf http://127.0.0.1:9100/health >/dev/null; then
  say "Done. Check Settings → Payments & delivery in the admin: each key shows Connected."
else
  fail "The API didn't come back. Run: journalctl -u the64squares-backend -n 50"
fi
