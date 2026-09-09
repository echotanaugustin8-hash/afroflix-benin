#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
[ -f data/afroflix.db ] && cp data/afroflix.db "backups/afroflix-db-$STAMP.sqlite"
[ -d uploads ] && tar -czf "backups/afroflix-uploads-$STAMP.tar.gz" uploads
find backups -type f -mtime +14 -delete
printf 'Sauvegarde terminée: %s\n' "$STAMP"
