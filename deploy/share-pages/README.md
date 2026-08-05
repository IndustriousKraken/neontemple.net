# Share pages

A link to a specific event or announcement used to preview as the page it lived
on — "Calendar | Neon Temple" and the site-wide description — because a crawler
never receives a URL fragment, never runs the JavaScript that fetches the item,
and gets the same static file whatever query string it asks for. The only fix is
a real page at a real path per shareable item.

That is what this is: `/e/<id>/` per public event and `/a/<id>/` per public
announcement, each a standalone document in the site's own chrome, carrying that
item's Open Graph and Twitter card metadata in the served bytes. It is the
destination, not a redirect, and every requester — crawler or person — gets
byte-identical output.

`share-pages.js` has two entry points and **one renderer**:

- `share-pages.js refresh` — reconcile every page against the public API. Run by
  `share-pages.timer`.
- `share-pages.js serve` — a loopback responder that generates a page on the
  first request for one that does not exist yet. Run by
  `share-pages-responder.service`; Caddy falls through to it.

Both fill the same Hugo-built template at `/_share/template/index.html`. A theme
change reaches share pages with no script edit, and the two paths cannot drift.

## Installation

`./deploy.sh` installs this. There are no steps to follow by hand — this
component being merged, deployed, and yet absent from the host, so that
`/e/<id>/` returned a 404 for every event, is the reason the deploy installs
components at all.

`component.conf` is the single description of what installing it means, and the
deploy acts on that file: `share-pages.js` to `/usr/local/bin`, the three units
to `/etc/systemd/system`, `daemon-reload` when a unit file changed, `enable
--now` on the responder and the timer, a restart of the responder when the
script changed, and a `start` of the oneshot so a deployed template change
reaches the pages without waiting on the timer.

**Node.js ≥ 18** (`apt install nodejs`) is required for the global `fetch` the
script uses. The deploy checks for it and will not install it: a host without
Node is named, told what is missing and what to run, and the deploy exits
non-zero with nothing half-installed. Install Node and re-run.

The `@share` handler that serves these pages, including the loopback
fall-through to the responder, is part of this site's repository-owned Caddy
configuration — see [`deploy/caddy/`](../caddy/README.md).

`./deploy.sh --check` reports whether this component is installed, stale, or
missing on the host without changing anything.

## Deploys will delete these pages unless excluded

`deploy.sh` runs `rsync -av --delete`. Anything in the web root that is
not in `public/` is deleted on the next deploy **unless it is excluded** — that
is the only reason `yt-feed.xml` survives, and it is why `deploy.sh` now carries:

    --exclude=yt-feed.xml --exclude=/e/ --exclude=/a/ --exclude=share-sitemap.xml

Adding a generated path here means adding an exclude there in the same commit.
The manifest is deliberately outside the web root, so it needs no exclude.

## Purge a mistakenly published item NOW

Publishing to the public API makes an item visible everywhere at once, and
retracting it withdraws it everywhere at once — except a generated page, which
keeps serving the withdrawn content until something notices. Unpublish the item
in Coterie, then:

    systemctl start share-pages.service

That is the same reconcile the timer runs, immediately. The page is removed, its
sitemap entry with it, and the responder will not recreate it: an id that no
longer resolves to a public item returns not-found and writes nothing.

**This bounds what this site serves and nothing else.** A platform that already
scraped a preview keeps its own copy, and no action here reaches it — that is a
consequence of having published, not something the removal can undo. The honest
guarantee is that the window is short (the timer interval, and less if you run
the command above), not that a preview can be recalled.

## Configuration

Environment variables, all with working defaults; set them in the unit files if
the host layout differs.

| Variable | Default | Purpose |
|----------|---------|---------|
| `SHARE_API` | `https://coterie.theneontemple.com` | Public Coterie API origin. Also what relative `image_url` paths resolve against. |
| `SHARE_SITE` | `https://theneontemple.com` | Site origin, for canonical URLs and the sitemap. |
| `SHARE_ROOT` | `/srv/theneontemple.com` | Caddy web root. |
| `SHARE_MANIFEST` | `/var/lib/share-pages/manifest.json` | Record of what has been generated. Outside the web root. |
| `SHARE_PORT` | `8787` | Loopback port for the responder. |

## What reconcile does, and what it refuses to do

- **Both payloads or nothing.** A non-2xx, a timeout, an unparseable body, or a
  body that is not a JSON array exits non-zero having changed nothing — the same
  rule `yt-feed-refresh.sh` follows with its `<entry>` check.
- **Removal is scoped to what was asked about** — which differs by kind. Events
  are fetched over a bounded window, so an event dated outside it is absent
  because it was never requested, not because it was retracted; deleting on that
  basis would wipe every page older than the window on the first run. The
  manifest records each page's item date, which is what tells the two apart.
  Announcements are fetched with no date range at all, so absence from that
  payload IS a retraction however old the item is — the sole exception being a
  payload that came back at the limit, where the tail may have been truncated
  rather than withdrawn.
- **Age governs polling, never removal.** A page whose item has aged out stops
  being re-fetched and keeps being served indefinitely. A shared link does not
  stop working because the event it names got old.
- **Deletion never leaves the two prefixes.** The delete set comes from the
  manifest, and both the kind and the id are re-validated against the resolved
  path before anything is removed.
- **No placeholder files.** An id that does not resolve returns not-found and
  writes nothing; a placeholder would be indistinguishable from a real page to
  the next reconcile.

## Discoverability

The refresher writes `share-sitemap.xml` and reconciles it in the same pass, and
`static/robots.txt` points crawlers at it. Without that these pages are orphans:
the calendar's links to events are rendered by script and are absent from the
served HTML, so a crawler walking the site has no path to a share page.
