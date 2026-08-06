#!/bin/sh
# Bring the coterie web host into line with this repository: the built site AND
# every server-side component under deploy/. Deploying and installing are the
# same operation — a component that exists here is installed there, or this
# fails and says which one did not.
#
#   ./deploy.sh          build, publish, and reconcile the host
#   ./deploy.sh --check  report what is missing or stale on the host, change nothing
set -e
cd "$(dirname "$0")"

HOST=coterie
WEBROOT=/srv/theneontemple.com
# Where the host keeps its copy of deploy/, which is what install.sh reads.
STAGE=/var/lib/theneontemple-deploy

case "${1:-}" in
  --check) check=1 ;;
  '') check=0 ;;
  *) echo "usage: $0 [--check]" >&2; exit 2 ;;
esac

if [ "$check" = 0 ]; then
  hugo --minify
  # --delete removes anything in the web root that is not in public/, so every
  # server-generated path has to be excluded by name or it is destroyed here:
  #   yt-feed.xml        - the cached YouTube feed (deploy/yt-feed-cache)
  #   /e/ /a/            - generated share pages (deploy/share-pages)
  #   share-sitemap.xml  - their crawlable index, owned by the same refresher
  rsync -av --delete \
    --exclude=yt-feed.xml --exclude=/e/ --exclude=/a/ --exclude=share-sitemap.xml \
    --chown=1000:1000 public/ "$HOST:$WEBROOT/"
fi

# The staging directory is the installer's SOURCE, not part of the host's
# installed state — so --check still refreshes it and still touches nothing that
# the host is actually running.
rsync -a --delete deploy/ "$HOST:$STAGE/"

# shellcheck disable=SC2029  # $STAGE is a constant here; expanding it locally is the intent.
if [ "$check" = 1 ]; then
  ssh "$HOST" "sh $STAGE/install.sh --check"
else
  ssh "$HOST" "sh $STAGE/install.sh"
fi
