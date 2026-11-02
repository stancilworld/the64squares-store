#!/usr/bin/env bash
# Nightly backup of The64Squares database and uploaded images. Keeps 14 days.
set -euo pipefail
DIR=/opt/the64squares/backups
STAMP=$(date +%F)
sudo -u postgres pg_dump -Fc the64squares > "$DIR/db-$STAMP.dump"
tar -czf "$DIR/uploads-$STAMP.tar.gz" -C /opt/the64squares uploads
find "$DIR" -type f -mtime +14 -delete
