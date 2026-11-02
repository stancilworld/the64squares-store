#!/usr/bin/env bash
# Pulls the latest code from GitHub and rebuilds. Run as root:
#   bash /opt/the64squares/app/deploy/update.sh
set -euo pipefail
APP=/opt/the64squares/app
# The store build may rewrite this file; drop such edits so the download never stops on them.
sudo -u the64squares -H git -C "$APP" checkout -- apps/storefront/tsconfig.json 2>/dev/null || true
sudo -u the64squares -H git -C "$APP" pull --ff-only
bash "$APP/deploy/build.sh"
