# Relative asset URLs leave every 404 unstyled and couple share pages to their depth

## Problem

`hugo.toml` sets `relativeURLs = true`, so every page links its assets relatively
— `404.html` emits `href="./css/style.<hash>.css"`.

Caddy serves that one document for **any** missing path, at any depth:

```
handle_errors {
  root * /srv/theneontemple.com
  rewrite * /404.html
  file_server
}
```

The browser resolves the relative href against the URL it requested, not against
where `404.html` lives. So a 404 at `/anything/` asks for
`/anything/css/style.<hash>.css`, which does not exist, and the themed 404 page
renders with no styling at all. This affects every 404 on the site except one at
the literal root — `https://theneontemple.com/definitely-not-a-page/` is as
unstyled as any other. The Caddy block's own comment states the intent it is
failing: *"Serve Hugo's themed 404 page instead of the bare default error body."*

The same root cause leaves a second, quieter problem. The share-page template at
`/_share/template/index.html` emits `../../css/…`, and the generated pages live at
`/e/<id>/` and `/a/<id>/`. Those resolve correctly **only because both paths are
two segments deep**. Nothing enforces that. A share page at any other depth would
lose its styling silently, and the symptom would appear on a shared link — the
place it is least likely to be noticed and most costly to look broken.

## Desired end state

- A 404 served at any path renders fully styled.
- Asset URLs do not depend on the depth of the URL a document is served at, so
  the share-page template and its generated pages are no longer coupled by
  coincidence.
- No visible change to any page that currently renders correctly.

The straightforward fix is to stop emitting relative asset URLs — `baseURL` is
already set to `https://theneontemple.com/`, which is what these should resolve
against. `relativeURLs = true` was introduced by commit `ca2ed1a` ("relative
urls") with no recorded reason; check whether anything still depends on it before
removing it, and if something does, make the 404 template and the share template
emit absolute asset URLs specifically rather than leaving the global setting
fighting them.

## Tasks

- [ ] Determine whether anything still requires `relativeURLs = true`. Local
  preview via `hugo server` rewrites `baseURL` and does not need it.
- [ ] Emit absolute asset URLs, globally if nothing depends on the current
  setting, otherwise at least for `404.html` and the share-page template.
- [ ] Rebuild `public/` so the committed output matches source.
- [ ] Verify a 404 at a nested path loads its stylesheet: request a missing path
  two or more segments deep and assert the referenced CSS returns 200.
- [ ] Verify `/e/<id>/` and `/a/<id>/` still load their stylesheet after the
  change.
- [ ] Add a check that a generated share page's asset URLs resolve independently
  of path depth, so the coincidence cannot quietly return.
