#!/usr/bin/env bash
# Nightly backup of the database and uploaded images. Keeps 14 days.
set -euo pipefail
DIR=/opt/stancil/backups
STAMP=$(date +%F)
sudo -u postgres pg_dump -Fc stancil > "$DIR/db-$STAMP.dump"
tar -czf "$DIR/uploads-$STAMP.tar.gz" -C /opt/stancil uploads
find "$DIR" -type f -mtime +14 -delete
