#!/usr/bin/env bash
# Copy mall website into bot/public for Render deploys with rootDir=bot.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$ROOT/bot/public"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$ROOT/index.html" "$ROOT/favicon.svg" \
  "$ROOT/trade-square-day.png" "$ROOT/trade-square-night.png" "$DEST/"
cp -a "$ROOT/assets" "$ROOT/shop" "$ROOT/shops" "$ROOT/enroll" "$ROOT/enrol" "$DEST/"
# Optional large hero video
if [[ "${SYNC_HERO_VIDEO:-0}" == "1" && -f "$ROOT/hero-bg.mp4" ]]; then
  cp -a "$ROOT/hero-bg.mp4" "$DEST/"
fi
echo "Synced site → $DEST ($(du -sh "$DEST" | awk '{print $1}'))"
