#!/bin/sh
# Build the site and deploy it to the coterie server (Caddy web root).
set -e
cd "$(dirname "$0")"
hugo --minify
# --delete removes anything in the web root that is not in public/, so every
# server-generated path has to be excluded by name or it is destroyed here:
#   yt-feed.xml        - the cached YouTube feed (deploy/yt-feed-cache)
#   /e/ /a/            - generated share pages (deploy/share-pages)
#   share-sitemap.xml  - their crawlable index, owned by the same refresher
rsync -av --delete \
  --exclude=yt-feed.xml --exclude=/e/ --exclude=/a/ --exclude=share-sitemap.xml \
  --chown=1000:1000 public/ coterie:/srv/theneontemple.com/
