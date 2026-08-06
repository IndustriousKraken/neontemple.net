# YouTube feed cache

The homepage video slider fetches `/yt-feed`. This used to reverse-proxy
YouTube's RSS live on every page view; YouTube rate-limits datacenter
IPs in bursts, so the widget often fell back to the "Watch on YouTube"
button. Instead, a systemd timer refreshes a cached copy every 30
minutes and Caddy serves it as a static file — a failed refresh keeps
the last good copy, so the widget never regresses transiently.

## Installation

`./deploy.sh` installs this. There are no steps to follow by hand.

`component.conf` is the single description of what installing it means, and the
deploy acts on that file: `yt-feed-refresh.sh` to `/usr/local/bin`, the service
and timer to `/etc/systemd/system`, `daemon-reload` when a unit file changed,
`enable --now` on the timer, and a `start` of the oneshot to prime the cache
when anything here changed. Running the deploy against a host that already
matches changes nothing and says so; `./deploy.sh --check` answers the same
question without deploying.

The `handle /yt-feed` block that serves the cached file is part of this site's
repository-owned Caddy configuration — see
[`deploy/caddy/`](../caddy/README.md).

Note: the cache file lives at /srv/theneontemple.com/yt-feed.xml. Site
deploys DO rsync with --delete (see `deploy.sh`) — the file survives
only because of the matching `--exclude=yt-feed.xml`. Anything else
generated into the web root needs its own exclude or the next deploy
removes it; see deploy/share-pages/, which relies on the same
protection.
