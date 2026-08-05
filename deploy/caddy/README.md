# This site's Caddy configuration

`theneontemple.com.caddy` is the whole of this site's web-server configuration,
owned by the repository. `./deploy.sh` places it at
`/etc/caddy/sites/theneontemple.com.caddy`, runs `caddy validate` against the
resulting configuration, and reloads Caddy — only when the file actually
changed, and only after validation passes. A validation failure restores the
previous file and fails the deploy, because reloading an invalid configuration
takes the site down and not deploying does not.

The deploy never writes `/etc/caddy/Caddyfile`. Other sites live in that file,
and a script that rewrites a shared file is how the four `Caddyfile.bak-*`
copies on the host came to exist.

## One-time host bootstrap

This is the only manual step, and it is done once per host. As root:

    mkdir -p /etc/caddy/sites
    printf 'import sites/*.caddy\n' >> /etc/caddy/Caddyfile
    caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy

Then remove this site's old inline block from `/etc/caddy/Caddyfile` — the
imported file replaces it, and two copies of the same site address will not
adapt.

Until the import line is present, `./deploy.sh` fails with

    [failed] caddy: /etc/caddy/Caddyfile is not bootstrapped — it does not
    contain: import sites/*.caddy

rather than placing a file nothing reads and reporting success. Run
`./deploy.sh --check` to ask a host whether it has been bootstrapped.

## What the block does

| Part | Why |
|------|-----|
| `handle /yt-feed` | Serves the cached feed from [`deploy/yt-feed-cache/`](../yt-feed-cache/) as a static file at the same-origin URL the site JS already fetches. |
| `@share` / `handle @share` | Serves a generated share page from [`deploy/share-pages/`](../share-pages/) when the file exists, and falls through to the loopback responder on `127.0.0.1:8787` when it does not, so a link posted seconds after publication previews correctly. |
| `handle` | The Hugo build in `/srv/theneontemple.com`. |
| `handle_errors` | Hugo's themed 404 for any miss at any depth. Its assets must be absolute — see `issues/archive/2026-08-05-relative-asset-urls-break-404-and-couple-share-pages.md`. |
| `header` | HSTS. |
| `log` | Per-site access log at `/var/log/caddy/theneontemple.com.log`. |

Edit the file here and deploy. An edit made on the host is overwritten by the
next deploy — which is the point.
