#!/bin/bash
set -euo pipefail
export PB_URL="https://pbnmt.lab.clneu.com"
while IFS='=' read -r k v; do
  case "$k" in
    POCKETBASE_ADMIN_EMAIL) export PB_EMAIL="$v" ;;
    POCKETBASE_ADMIN_PASSWORD) export PB_PASSWORD="$v" ;;
  esac
done < <(docker inspect neu-money-tracking --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^POCKETBASE_ADMIN_')
node /tmp/fix-neu1-pb.mjs
