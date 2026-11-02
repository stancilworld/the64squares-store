#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VPS for the Stancil store.
#
# Run as root from inside the cloned repository:
#   bash /opt/stancil/app/deploy/setup-vps.sh
#
# Safe to run again: existing secrets, database and admin user are kept.
set -euo pipefail

STORE_DOMAIN="${STORE_DOMAIN:-staging.stancil.in}"
API_DOMAIN="${API_DOMAIN:-api-staging.stancil.in}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@stancil.in}"
SSL_EMAIL="${SSL_EMAIL:-}"

BASE=/opt/stancil
APP="$BASE/app"
SECRETS="$BASE/secrets.env"
APP_USER=stancil

say() { printf "\n\033[1;34m==> %s\033[0m\n" "$*"; }
die() { printf "\n\033[1;31mERROR: %s\033[0m\n" "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this as root."

# Only one copy of the setup may run at a time.
exec 9>/run/stancil-setup.lock
flock -n 9 || die "The setup is already running. Watch it with: tail -f /root/stancil-setup.log"
[ -f "$APP/apps/backend/medusa-config.ts" ] || die "Clone the repository to $APP first."

# After go-live.sh the server runs the real domain; setup would put the staging addresses back.
if [ -f "$BASE/domains.env" ]; then
  die "This server is already live ($(grep STORE_DOMAIN "$BASE/domains.env" | cut -d= -f2)). Use deploy/update.sh to update it."
fi

if [ -z "$SSL_EMAIL" ] && [ -t 0 ]; then
  read -r -p "Email for SSL certificate expiry notices (press Enter to skip): " SSL_EMAIL || true
fi

say "Swap space (needed for builds on a 4 GB server)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q "^/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
  sysctl -q vm.swappiness=10
  echo "vm.swappiness=10" > /etc/sysctl.d/99-stancil.conf
fi

# Ubuntu installs its own updates in the background after boot; wait for them.
wait_for_apt() {
  local locks="/var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock"
  while fuser $locks >/dev/null 2>&1; do
    echo "Waiting for background system updates to finish..."
    sleep 10
  done
}

say "System packages"
export DEBIAN_FRONTEND=noninteractive
wait_for_apt
apt-get update -q
apt-get install -y -q curl ca-certificates gnupg git build-essential nginx \
  postgresql redis-server certbot python3-certbot-nginx ufw unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  say "Node.js 22"
  wait_for_apt
  # Remove Ubuntu's older Node.js if a previous run installed it by mistake.
  apt-get remove -y -q nodejs nodejs-doc libnode109 >/dev/null 2>&1 || true
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  wait_for_apt
  apt-get install -y -q nodejs
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "$NODE_MAJOR" -ge 22 ] && command -v npm >/dev/null ||
  die "Node.js 22 with npm did not install (found $(node -v 2>/dev/null || echo none)). Run this script again."

say "App user and folders"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$BASE/uploads" "$BASE/backups"
chown -R "$APP_USER:$APP_USER" "$APP" "$BASE/uploads"
chmod 700 "$BASE/backups"

# Let the app user pull updates with the deploy key used for the first clone.
if [ -f /root/.ssh/stancil_deploy ]; then
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
  install -m 600 -o "$APP_USER" -g "$APP_USER" /root/.ssh/stancil_deploy "/home/$APP_USER/.ssh/stancil_deploy"
  [ -f /root/.ssh/known_hosts ] && install -m 644 -o "$APP_USER" -g "$APP_USER" /root/.ssh/known_hosts "/home/$APP_USER/.ssh/known_hosts"
  sudo -u "$APP_USER" git -C "$APP" config core.sshCommand \
    "ssh -i /home/$APP_USER/.ssh/stancil_deploy -o StrictHostKeyChecking=accept-new"
fi

say "Secrets"
if [ ! -f "$SECRETS" ]; then
  umask 077
  cat > "$SECRETS" <<EOF
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
COOKIE_SECRET=$(openssl rand -hex 32)
AUTH_MFA_ENCRYPTION_KEY=$(openssl rand -hex 32)
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)
EOF
  umask 022
fi
chown root:root "$SECRETS"
chmod 600 "$SECRETS"
# shellcheck disable=SC1090
. "$SECRETS"

say "PostgreSQL and Redis"
systemctl enable --now postgresql redis-server
if ! sudo -u postgres psql -Atc "select 1 from pg_roles where rolname='stancil'" | grep -q 1; then
  sudo -u postgres psql -qc "create role stancil login password '$DB_PASSWORD'"
fi
if ! sudo -u postgres psql -Atc "select 1 from pg_database where datname='stancil'" | grep -q 1; then
  sudo -u postgres createdb -O stancil stancil
fi

say "Backend settings"
umask 077
cat > "$APP/apps/backend/.env" <<EOF
DATABASE_URL=postgres://stancil:$DB_PASSWORD@localhost:5432/stancil
REDIS_URL=redis://localhost:6379
MEDUSA_BACKEND_URL=https://$API_DOMAIN
STORE_CORS=https://$STORE_DOMAIN
ADMIN_CORS=https://$API_DOMAIN
AUTH_CORS=https://$STORE_DOMAIN,https://$API_DOMAIN
JWT_SECRET=$JWT_SECRET
COOKIE_SECRET=$COOKIE_SECRET
AUTH_MFA_ENCRYPTION_KEY=$AUTH_MFA_ENCRYPTION_KEY
EOF
umask 022
chown "$APP_USER:$APP_USER" "$APP/apps/backend/.env"

say "Services"
install -m 644 "$APP"/deploy/systemd/*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable stancil-backend stancil-worker stancil-storefront >/dev/null

say "Building the store (takes 5-10 minutes)"
STORE_DOMAIN="$STORE_DOMAIN" API_DOMAIN="$API_DOMAIN" bash "$APP/deploy/build.sh"

if [ ! -f "$BASE/.admin-created" ]; then
  say "Admin user"
  (cd "$APP/apps/backend/.medusa/server" && sudo -u "$APP_USER" npx medusa user -e "$ADMIN_EMAIL" -p "$ADMIN_PASSWORD")
  touch "$BASE/.admin-created"
fi

say "Web server"
sed -e "s/__STORE_DOMAIN__/$STORE_DOMAIN/g" -e "s/__API_DOMAIN__/$API_DOMAIN/g" \
  "$APP/deploy/nginx/stancil.conf" > /etc/nginx/sites-available/stancil.conf
ln -sf /etc/nginx/sites-available/stancil.conf /etc/nginx/sites-enabled/stancil.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

say "Firewall"
ufw allow OpenSSH >/dev/null
ufw allow "Nginx Full" >/dev/null
ufw --force enable >/dev/null

say "Nightly backups (kept 14 days in $BASE/backups)"
install -m 755 "$APP/deploy/backup.sh" /usr/local/bin/stancil-backup
echo "30 2 * * * root /usr/local/bin/stancil-backup" > /etc/cron.d/stancil-backup

say "SSL certificates"
SSL_OK=no
if [ -n "$SSL_EMAIL" ]; then EMAIL_ARG=(-m "$SSL_EMAIL"); else EMAIL_ARG=(--register-unsafely-without-email); fi
if certbot --nginx --non-interactive --agree-tos "${EMAIL_ARG[@]}" --redirect \
  -d "$STORE_DOMAIN" -d "$API_DOMAIN"; then
  SSL_OK=yes
fi

printf "\n\033[1;32m================ Stancil is installed ================\033[0m\n"
echo "Store:  https://$STORE_DOMAIN"
echo "Admin:  https://$API_DOMAIN/app"
echo "Admin login: $ADMIN_EMAIL"
echo "Admin password: $ADMIN_PASSWORD"
echo "Save the password in a password manager. Do not share it."
echo "(It is also stored in $SECRETS, readable by root only.)"
if [ "$SSL_OK" != yes ]; then
  echo
  echo "SSL could not be set up yet, usually because the DNS records are not live."
  echo "Once they are, run:  bash $APP/deploy/setup-vps.sh"
fi
