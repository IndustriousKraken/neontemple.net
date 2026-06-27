# Neon Temple

A [Hugo](https://gohugo.io/) static site for Neon Temple (a cybersecurity guild
in Tampa Bay) that consumes RSS/calendar feeds from the Coterie backend to show
events, announcements, and member/admin login links.

## Build & run

Prerequisites:

- **Hugo** — to build and serve the site.
- **Node.js** — to run the theme's JS unit tests.

Commands:

- `hugo server` — serve the site locally with live reload for development.
- `hugo` — build the static site into `public/`.
- `npm test` — run the theme's JS unit tests (`node --test
  "themes/terminal/assets/js/*.test.js"`).

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
