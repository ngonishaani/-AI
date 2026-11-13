#!/usr/bin/env bash
# Copy mall website into bot/public for Render deploys with rootDir=bot.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$ROOT/bot/public"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -a "$ROOT/index.html" "$ROOT/favicon.svg" \
  "$ROOT/trade-square-day.png" "$ROOT/trade-square-night.png" "$DEST/"
for img in featured-barber-salon.jpg featured-clothes.jpg featured-shoes.jpg rooftop-lounge.jpg featured-barber.mp4 featured-sneakers.mp4 featured-fashion.mp4; do
  if [[ -f "$ROOT/$img" ]]; then
    cp -a "$ROOT/$img" "$DEST/"
  fi
done
cp -a "$ROOT/assets" "$ROOT/shop" "$ROOT/shops" "$ROOT/enroll" "$ROOT/enrol" "$DEST/"
# Hero video used by the homepage background
if [[ -f "$ROOT/hero-bg.mp4" ]]; then
  cp -a "$ROOT/hero-bg.mp4" "$DEST/"
fi
echo "Synced site → $DEST ($(du -sh "$DEST" | awk '{print $1}'))"
