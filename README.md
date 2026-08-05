# Neon Temple

A [Hugo](https://gohugo.io/) static site for Neon Temple (a cybersecurity guild
in Tampa Bay) that consumes RSS/calendar feeds from the Coterie backend to show
events, announcements, and member/admin login links.

## Build & run

Prerequisites:

- **Hugo ≥ 0.146 (extended)** — to build and serve the site. Older versions
  (e.g. Debian's packaged 0.131) fail the theme's layout lookup and silently
  emit EMPTY pages — check `hugo` output for a "not compatible" warning.
- **Node.js** — to run the theme's JS unit tests.

Commands:

- `hugo server` — serve the site locally with live reload for development.
- `hugo` — build the static site into `public/`.
- `npm test` — run the theme's JS unit tests, the component installer's, and the
  share-page refresher's (`node --test "themes/terminal/assets/js/*.test.js"
  "deploy/*.test.js" "deploy/share-pages/*.test.js"`).
- `./deploy.sh` — build, publish, and bring the host into line with this
  repository. See below.
- `./deploy.sh --check` — report what is missing or stale on the host, changing
  nothing.

## Deploying

**`./deploy.sh` is the whole procedure, including for a fresh host.** It builds
the site, rsyncs `public/` to the coterie server's Caddy web root
(`/srv/theneontemple.com`), and then installs and reconciles every server-side
component under `deploy/`. Running it against a host that already matches
changes nothing and reports that; running it against a host missing a component
installs the component. You do not have to know which of those you are in.

It runs `rsync --delete`, so every server-generated path is excluded by name in
`deploy.sh`; adding one without its exclude means the next deploy destroys it.

The one manual step in the whole system is a one-time Caddy import line per
host, documented in [`deploy/caddy/`](./deploy/caddy/README.md). The deploy
detects its absence and says so rather than reporting success.

**`./deploy.sh --check` answers "is the host current".** It reports each
component as current, stale, or missing, names any unmet prerequisite, and
changes nothing — no file placed, no unit enabled, no server reloaded. Run it
when you want to know whether what you merged is actually running.

## Server-side pieces

Each directory under `deploy/` is a component. It declares what installing it
means in `component.conf`, and `deploy/install.sh` acts on that declaration —
so **adding a component is adding a directory**, with no installer change, and a
component cannot exist in the repository without the deploy installing it. A
directory without a readable `component.conf` fails the deploy and is named.

- [`deploy/caddy/`](./deploy/caddy/) — this site's Caddy configuration, and the
  one-time host bootstrap that makes Caddy read it.
- [`deploy/yt-feed-cache/`](./deploy/yt-feed-cache/) — the cached YouTube feed
  the homepage slider reads.
- [`deploy/share-pages/`](./deploy/share-pages/) — `/e/<id>/` and `/a/<id>/`
  share pages, one per public event and announcement, so a link to a specific
  item previews as that item. Includes the on-request generator and the
  immediate-purge command for a mistakenly published item.

## Configuration

Operator-settable values live under `[params]` in `hugo.toml`:

| Param | Description |
|-------|-------------|
| `coterieAPI` | Base URL of the Coterie backend API (see below). |
| `portalURL` | Member/admin portal login URL. Emitted as `window.COTERIE_PORTAL_URL`; linked from the Join page and the Login menu. |
| `description` | Site meta description. |
| `email` | Footer "Email" (mailto) link. |
| `facebook` | Footer Facebook link. |
| `twitter` | Footer "X" link. |
| `youtube` | Footer YouTube link. |
| `instagram` | Footer Instagram link. |
| `address` | Footer address line. |

Each footer link renders only when its param is non-empty.

### `coterieAPI` — the backend wiring

`coterieAPI` is the most important deploy-time setting. It is emitted to every
page as `window.COTERIE_API_URL` (`themes/terminal/layouts/baseof.html`) and is
used as:

- the api-client's `baseURL` for all feed/health requests, and
- the base that `getImageUrl` resolves relative `image_url` paths against.

**With `coterieAPI` unset or empty, the site fetches no events, announcements,
images, or login links.** Set it to the backend's base URL before deploying.

For menus and other Hugo-native settings, see `hugo.toml` directly — they are
not duplicated here.

## Further reading

- [PROJECT.md](./PROJECT.md) — design brief / intent.
- [TODO.md](./TODO.md) — outstanding work.
- [OCTOPUS.md](./OCTOPUS.md) / [AGENTS.md](./AGENTS.md) — the in-repo agent &
  contributor workflow protocols (OpenSpec/issues process).
