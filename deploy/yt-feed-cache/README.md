# YouTube feed cache

The homepage video slider fetches `/yt-feed`. This used to reverse-proxy
YouTube's RSS live on every page view; YouTube rate-limits datacenter
IPs in bursts, so the widget often fell back to the "Watch on YouTube"
button. Instead, a systemd timer refreshes a cached copy every 30
minutes and Caddy serves it as a static file — a failed refresh keeps
the last good copy, so the widget never regresses transiently.

## Install (as root on the web host)

    install -m 0755 yt-feed-refresh.sh /usr/local/bin/yt-feed-refresh.sh
    install -m 0644 yt-feed-cache.service yt-feed-cache.timer /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable --now yt-feed-cache.timer
    systemctl start yt-feed-cache.service   # prime the cache now

Then replace the `handle /yt-feed` reverse_proxy block in
/etc/caddy/Caddyfile with:

    # Cached YouTube feed (refreshed by yt-feed-cache.timer; see the
    # site repo's deploy/yt-feed-cache/). Same-origin URL kept so the
    # site JS is unchanged.
    handle /yt-feed {
      root * /srv/theneontemple.com
      rewrite * /yt-feed.xml
      header Cache-Control "public, max-age=300"
      header Content-Type "application/atom+xml; charset=utf-8"
      file_server
    }

and `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`.

Note: the cache file lives at /srv/theneontemple.com/yt-feed.xml; site
deploys rsync WITHOUT --delete, so it survives deploys.
