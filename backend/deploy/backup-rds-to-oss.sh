#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${RDS_HOST:?missing RDS_HOST}" "${RDS_DATABASE:?missing RDS_DATABASE}"
: "${RDS_USER:?missing RDS_USER}" "${RDS_PASSWORD:?missing RDS_PASSWORD}"
: "${OSS_BACKUP_URI:?missing OSS_BACKUP_URI, e.g. oss://bucket/database}"
command -v mysqldump >/dev/null
command -v ossutil >/dev/null
backup_dir="$(mktemp -d)"
trap 'find "$backup_dir" -type f -delete; rmdir "$backup_dir"' EXIT
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$backup_dir/gagachat-rds-$stamp.sql.gz"
MYSQL_PWD="$RDS_PASSWORD" mysqldump --host="$RDS_HOST" --port="${RDS_PORT:-3306}" \
  --user="$RDS_USER" --single-transaction --quick --routines --events --triggers \
  --set-gtid-purged=OFF "$RDS_DATABASE" | gzip -9 > "$archive"
test -s "$archive"
sha256sum "$archive" > "$archive.sha256"
ossutil cp "$archive" "$OSS_BACKUP_URI/" --force
ossutil cp "$archive.sha256" "$OSS_BACKUP_URI/" --force
