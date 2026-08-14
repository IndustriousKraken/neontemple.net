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
| `redir` block | Legacy WordPress URLs → their current equivalents. See below. |
| `handle /yt-feed` | Serves the cached feed from [`deploy/yt-feed-cache/`](../yt-feed-cache/) as a static file at the same-origin URL the site JS already fetches. |
| `@share` / `handle @share` | Serves a generated share page from [`deploy/share-pages/`](../share-pages/) when the file exists, and falls through to the loopback responder on `127.0.0.1:8787` when it does not, so a link posted seconds after publication previews correctly. |
| `handle` | The Hugo build in `/srv/theneontemple.com`. |
| `handle_errors` | Hugo's themed 404 for any miss at any depth. Its assets must be absolute — see `issues/archive/2026-08-05-relative-asset-urls-break-404-and-couple-share-pages.md`. |
| `header` | HSTS. |
| `log` | Per-site access log at `/var/log/caddy/theneontemple.com.log`. |

Edit the file here and deploy. An edit made on the host is overwritten by the
next deploy — which is the point.

## Legacy URL redirects

The guild's previous site ran on WordPress at `neontemple.net`. That hostname's
block — in the shared `/etc/caddy/Caddyfile`, **not** here — forwards to this
site with the request path intact:

    neontemple.net, www.neontemple.net {
      redir https://theneontemple.com{uri} permanent
    }

That is correct and should stay exactly as it is: preserving the path is the
only reason a specific legacy URL can be recognized at all. A redirect that
discarded it would land everyone on the home page with no way to do better. The
cost is that every indexed WordPress URL, bookmark and saved link arrives here
carrying a path this site never had.

### How the map was derived

**From the access log, not from memory of the old site.** The map is the 404s in
`/var/log/caddy/site-access.log` with scanner probes discarded:

    ssh coterie "jq -r 'select(.status == 404) | .request.uri' \
      /var/log/caddy/site-access.log | sort | uniq -c | sort -rn" | head -50

Then read down the list and throw out the noise — `wp_filemanager.php`, `/.env`
in a dozen spellings, `/.git/config`, `/.aws/credentials`, `/secrets.json`. What
is left is people and their software asking for something that used to exist.
That residue is the map.

Extend it the same way. A path nobody requests needs no redirect however
plausible it looks; a path that shows up in the log is a fact rather than a
guess. Destinations are chosen by what the old page was *for*, not by name
similarity, and nothing gets a stub page created just to be a redirect target —
where there is no exact equivalent, the nearest honest page wins.

Two entries are not pages. `/events/ics/` is a calendar feed: its request count
is a handful of subscribed clients polling on a schedule, not that many people,
and a client that gets a 404 for its feed shows the subscriber *nothing* — no
error, no empty calendar, silently dead since the migration. It and the RSS
paths go to the feeds Coterie serves, which are the same URLs the site's own
"Subscribe" buttons use. `/login` is not a legacy URL at all: it is people
typing the hostname they associate with the guild and expecting to sign in.

### There is deliberately no catch-all

Do not add a fallback sending unmatched paths to the home page. The bulk of this
site's 404 traffic is hostile scanning, and a catch-all would answer all of it
with a 301 to a 200: it manufactures soft-404s across a URL space search engines
will index, it confirms to a scanner that every path it tries resolves, and it
destroys the log signal above — the next person looking for genuinely broken
inbound links would find every probe redirected and nothing left to tell them
apart. A 404 is the correct answer to a request for something that does not
exist. `redirects.test.js` asserts this explicitly, because it is the property
easiest to lose by adding one convenient rule later.

### Tests

`redirects.test.js` runs *this* config file under a real `caddy` on loopback —
the site address, the web root, the Coterie origin and the log path are the only
things substituted — and follows each redirect to its end. Run it with
`npm test`. After a deploy, one live check the tests cannot make from a sandbox
is that Coterie is still serving the feed the redirect now points at:

    curl -sSL -o /dev/null -w '%{http_code} %{content_type}\n' \
      https://theneontemple.com/events/ics/
