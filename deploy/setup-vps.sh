#!/usr/bin/env bash
# One-time setup of The 64 Squares store on an Ubuntu 24.04 VPS. Works on a fresh server and
# on a server that already runs another store (Stancil): it only adds its own user, folder,
# database, Redis database number, services and web server file, and never touches the
# other store's.
#
# Run as root from inside the cloned repository:
#   OWNER_EMAIL=you@example.com bash /opt/the64squares/app/deploy/setup-vps.sh
#
# Safe to run again: existing secrets, database and admin user are kept.
set -euo pipefail

STORE_DOMAIN="${STORE_DOMAIN:-staging.the64squares.in}"
API_DOMAIN="${API_DOMAIN:-api-staging.the64squares.in}"
OWNER_EMAIL="${OWNER_EMAIL:-}"
SUPPORT_EMAIL="${SUPPORT_EMAIL:-info@the64squares.in}"
SSL_EMAIL="${SSL_EMAIL:-}"

BASE=/opt/the64squares
APP="$BASE/app"
SECRETS="$BASE/secrets.env"
APP_USER=the64squares
DB_NAME=the64squares
DB_ROLE=the64squares
# Redis database 0 belongs to the first store on this server; this store uses its own.
REDIS_DB=1

say() { printf "\n\033[1;34m==> %s\033[0m\n" "$*"; }
die() { printf "\n\033[1;31mERROR: %s\033[0m\n" "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this as root."

# Only one copy of the setup may run at a time.
exec 9>/run/the64squares-setup.lock
flock -n 9 || die "The setup is already running. Watch it with: tail -f /root/the64squares-setup.log"
[ -f "$APP/apps/backend/medusa-config.ts" ] || die "Clone the repository to $APP first."

# After go-live.sh the server runs the real domain; setup would put the staging addresses back.
if [ -f "$BASE/domains.env" ]; then
  die "The 64 Squares is already live ($(grep STORE_DOMAIN "$BASE/domains.env" | cut -d= -f2)). Use deploy/update.sh to update it."
fi

if [ -z "$OWNER_EMAIL" ] && [ -t 0 ]; then
  read -r -p "Main admin email (the only login that can change payment and email keys): " OWNER_EMAIL || true
fi
[[ "$OWNER_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}$ ]] || die "Give the main admin email: OWNER_EMAIL=you@example.com bash $0"
OWNER_EMAIL=$(printf "%s" "$OWNER_EMAIL" | tr '[:upper:]' '[:lower:]')

if [ -z "$SSL_EMAIL" ] && [ -t 0 ]; then
  read -r -p "Email for SSL certificate expiry notices (press Enter to skip): " SSL_EMAIL || true
fi

say "Swap space (needed for builds on a 4 GB server)"
if swapon --show | grep -q .; then
  echo "Swap already set up: $(swapon --show --noheadings --bytes | awk '{s+=$3} END {printf "%.1f GB", s/1073741824}')"
else
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q "^/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
  sysctl -q vm.swappiness=10
  echo "vm.swappiness=10" > /etc/sysctl.d/99-the64squares.conf
fi

# Ubuntu installs its own updates in the background after boot; wait for them.
wait_for_apt() {
  local locks="/var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock"
  while fuser $locks >/dev/null 2>&1; do
    echo "Waiting for background system updates to finish..."
    sleep 10
  done
}

say "System packages (already installed ones are left as they are)"
export DEBIAN_FRONTEND=noninteractive
wait_for_apt
apt-get update -q
apt-get install -y -q curl ca-certificates gnupg git build-essential nginx \
  postgresql redis-server certbot python3-certbot-nginx ufw unattended-upgrades

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  say "Node.js 22"
  wait_for_apt
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
if [ -f /root/.ssh/t64_deploy ]; then
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
  install -m 600 -o "$APP_USER" -g "$APP_USER" /root/.ssh/t64_deploy "/home/$APP_USER/.ssh/t64_deploy"
  [ -f /root/.ssh/known_hosts ] && install -m 644 -o "$APP_USER" -g "$APP_USER" /root/.ssh/known_hosts "/home/$APP_USER/.ssh/known_hosts"
  sudo -u "$APP_USER" git -C "$APP" config core.sshCommand \
    "ssh -i /home/$APP_USER/.ssh/t64_deploy -o StrictHostKeyChecking=accept-new"
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

say "PostgreSQL and Redis (own database, own Redis number $REDIS_DB)"
systemctl enable --now postgresql redis-server
if ! sudo -u postgres psql -Atc "select 1 from pg_roles where rolname='$DB_ROLE'" | grep -q 1; then
  sudo -u postgres psql -qc "create role $DB_ROLE login password '$DB_PASSWORD'"
fi
if ! sudo -u postgres psql -Atc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1; then
  sudo -u postgres createdb -O "$DB_ROLE" "$DB_NAME"
fi

say "Backend settings"
umask 077
cat > "$APP/apps/backend/.env" <<EOF
DATABASE_URL=postgres://$DB_ROLE:$DB_PASSWORD@localhost:5432/$DB_NAME
REDIS_URL=redis://localhost:6379/$REDIS_DB
MEDUSA_BACKEND_URL=https://$API_DOMAIN
STORE_CORS=https://$STORE_DOMAIN
ADMIN_CORS=https://$API_DOMAIN
AUTH_CORS=https://$STORE_DOMAIN,https://$API_DOMAIN
JWT_SECRET=$JWT_SECRET
COOKIE_SECRET=$COOKIE_SECRET
AUTH_MFA_ENCRYPTION_KEY=$AUTH_MFA_ENCRYPTION_KEY
OWNER_EMAIL=$OWNER_EMAIL
SUPPORT_EMAIL=$SUPPORT_EMAIL
EOF
umask 022
chown "$APP_USER:$APP_USER" "$APP/apps/backend/.env"

say "Services"
install -m 644 "$APP"/deploy/systemd/the64squares-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable the64squares-backend the64squares-worker the64squares-storefront the64squares-game >/dev/null

say "Building the store (5-10 minutes; the other store stays up)"
STORE_DOMAIN="$STORE_DOMAIN" API_DOMAIN="$API_DOMAIN" bash "$APP/deploy/build.sh"

if [ ! -f "$BASE/.admin-created" ]; then
  say "Admin user"
  (cd "$APP/apps/backend/.medusa/server" && sudo -u "$APP_USER" npx medusa user -e "$OWNER_EMAIL" -p "$ADMIN_PASSWORD")
  touch "$BASE/.admin-created"
fi

say "Web server (adds the64squares.conf; other sites are left alone)"
sed -e "s/__STORE_DOMAIN__/$STORE_DOMAIN/g" -e "s/__API_DOMAIN__/$API_DOMAIN/g" \
  "$APP/deploy/nginx/the64squares.conf" > /etc/nginx/sites-available/the64squares.conf
ln -sf /etc/nginx/sites-available/the64squares.conf /etc/nginx/sites-enabled/the64squares.conf
if ! nginx -t; then
  rm -f /etc/nginx/sites-enabled/the64squares.conf
  die "The web server rejected the new settings, so they were removed again. Nothing else changed."
fi
systemctl reload nginx

say "Firewall"
ufw allow OpenSSH >/dev/null
ufw allow "Nginx Full" >/dev/null
ufw --force enable >/dev/null

say "Nightly backups (kept 14 days in $BASE/backups)"
install -m 755 "$APP/deploy/backup.sh" /usr/local/bin/the64squares-backup
echo "45 2 * * * root /usr/local/bin/the64squares-backup" > /etc/cron.d/the64squares-backup

say "SSL certificates"
SSL_OK=no
if [ -n "$SSL_EMAIL" ]; then EMAIL_ARG=(-m "$SSL_EMAIL"); elif [ -d /etc/letsencrypt/accounts ]; then EMAIL_ARG=(); else EMAIL_ARG=(--register-unsafely-without-email); fi
if certbot --nginx --non-interactive --agree-tos "${EMAIL_ARG[@]}" --redirect \
  --cert-name the64squares-staging -d "$STORE_DOMAIN" -d "$API_DOMAIN"; then
  SSL_OK=yes
fi

printf "\n\033[1;32m================ The 64 Squares is installed ================\033[0m\n"
echo "Store:  https://$STORE_DOMAIN"
echo "Admin:  https://$API_DOMAIN/app"
echo "Admin login: $OWNER_EMAIL"
echo "Admin password: $ADMIN_PASSWORD"
echo "Save the password in a password manager. Do not share it."
echo "(It is also stored in $SECRETS, readable by root only.)"
if [ "$SSL_OK" != yes ]; then
  echo
  echo "SSL could not be set up yet, usually because the DNS records are not live."
  echo "Once they are, run:  bash $APP/deploy/setup-vps.sh"
fi
