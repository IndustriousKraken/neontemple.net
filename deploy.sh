#!/bin/sh
# Build the site and deploy it to the coterie server (Caddy web root).
set -e
cd "$(dirname "$0")"
hugo --minify
# yt-feed.xml is generated on the server by the yt-feed-cache timer (deploy/yt-feed-cache)
rsync -av --delete --exclude=yt-feed.xml --chown=1000:1000 public/ coterie:/srv/theneontemple.com/
