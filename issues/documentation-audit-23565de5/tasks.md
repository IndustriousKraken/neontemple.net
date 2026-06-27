## 1. Add an operator-facing README.md at the repository root

- [ ] 1.1 Create `README.md` at the repo root. Open with a one-line description
  of the project (a Hugo static site for Neon Temple that consumes RSS/calendar
  feeds from the Coterie backend), then the sections below. Keep it a single
  file — do NOT add a `docs/` tree.

- [ ] 1.2 **Build & run** section. Document the prerequisites (Hugo, plus
  Node.js for the JS tests) and the commands:
  - `hugo server` for local development and `hugo` to build the static site
    into `public/`;
  - `npm test` to run the theme's JS unit tests (the `test` script in
    `package.json`, which runs `node --test "themes/terminal/assets/js/*.test.js"`).

- [ ] 1.3 **Configuration** section. Document every operator-settable
  `hugo.toml` `[params]` entry, each with a one-line description:
  - `coterieAPI` — base URL of the Coterie backend API. Call out that it is
    emitted to every page as `window.COTERIE_API_URL`
    (`themes/terminal/layouts/baseof.html`), used as the api-client's `baseURL`,
    and used by `getImageUrl` to resolve relative `image_url` paths. State
    plainly that with this unset/empty the site fetches no events,
    announcements, images, or login links.
  - `portalURL` — member/admin portal login URL (emitted as
    `window.COTERIE_PORTAL_URL`; linked from the Join page and the Login menu).
  - `description` — site meta description.
  - the social/footer fields `email`, `facebook`, `twitter`, `youtube`,
    `instagram`, and `address` — note each footer link renders only when its
    param is non-empty.
  Point the reader at `hugo.toml` for menu and other Hugo-native settings;
  do not duplicate the full menu config in the README.

- [ ] 1.4 **Further reading** section. Cross-link the existing top-level docs so
  onboarding is discoverable from one entry point:
  - `PROJECT.md` — design brief / intent;
  - `TODO.md` — outstanding work;
  - `OCTOPUS.md` / `AGENTS.md` — the in-repo agent & contributor workflow
    protocols.

- [ ] 1.5 Keep the README accurate to the current repo: verify param names and
  the `window.COTERIE_API_URL` / `window.COTERIE_PORTAL_URL` emission against
  `hugo.toml` and `themes/terminal/layouts/baseof.html` before finalizing. Do
  not document params or commands that do not exist. This task is documentation
  only — do not change any template, JS, or `hugo.toml` value.
