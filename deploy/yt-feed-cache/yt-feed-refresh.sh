#!/bin/sh
# Refresh the cached YouTube RSS feed served at /yt-feed (see the
# yt-feed handle block in /etc/caddy/Caddyfile). Runs from
# yt-feed-cache.timer every 30 minutes; on ANY failure the previous
# cached copy stays in place, so the homepage widget never regresses
# to the fallback button because of a transient YouTube rate-limit.
set -eu
CHANNEL_ID="UCjO4E92PJnYuazpZfllS98Q"
OUT="/srv/theneontemple.com/yt-feed.xml"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
curl -sfL --max-time 30 \
  "https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}" -o "$TMP"
# A 200 consent/anti-bot page is not a feed - only entries count.
grep -q "<entry>" "$TMP" || { echo "no <entry> in response; keeping last good copy" >&2; exit 1; }
install -m 0644 "$TMP" "$OUT"
