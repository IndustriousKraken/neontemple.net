# Operator-facing setup docs are missing (no README, no backend-wiring config)

## Problem

The repository ships no operator-facing entry-point documentation. There is no
`README.md` and no `docs/` directory. An operator who clones the repo to build,
run, or configure the Hugo site has nowhere to learn the required steps or the
configurable `hugo.toml` `[params]`. The only top-level Markdown is a terse
design brief (`PROJECT.md`), a task list (`TODO.md`), and agent-workflow guides
(`OCTOPUS.md`/`AGENTS.md`, which document the in-repo OpenSpec/issues process,
not site setup); none serve as setup docs and none cross-link to each other.

The most important deploy-time setting is undocumented: the API base URL is set
via the `coterieAPI` param in `hugo.toml` and emitted to every page as
`window.COTERIE_API_URL` (`themes/terminal/layouts/baseof.html:11`). The
`content-rendering` canon (`Image paths are resolved to absolute URLs before
rendering`) resolves relative `image_url` values against
`window.COTERIE_API_URL`, and the api-client uses the same value as its
`baseURL`. Without this setting the site fetches no events, announcements,
images, or login links — yet nothing tells an operator it exists. The
companion `portalURL` param (member/admin login target, emitted as
`window.COTERIE_PORTAL_URL` and used on the Join page) is likewise undocumented,
as are the social-link and `address` footer params.

This is a structural documentation gap, not poorly-organized existing docs. It
leaves the site's operator surface (build + backend wiring) discoverable only by
reading `hugo.toml` and the templates directly.

## Desired end state

A `README.md` at the repository root that lets an operator build, run, and
configure the site without reading the templates:

- how to build and serve the Hugo site, and how to run the JS tests;
- a configuration reference for every operator-settable `hugo.toml` `[param]`,
  centered on `coterieAPI` (the backend API base URL — what breaks without it,
  and that it surfaces as `window.COTERIE_API_URL`) and `portalURL`;
- cross-links to the existing top-level docs (`PROJECT.md`, `TODO.md`,
  `OCTOPUS.md`/`AGENTS.md`) so onboarding is discoverable from one place.

No code, template, or config behavior changes — this is documentation only.
