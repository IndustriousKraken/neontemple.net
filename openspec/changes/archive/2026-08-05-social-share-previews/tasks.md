# Tasks

## 1. Site-level metadata

- [x] 1.1 `themes/terminal/layouts/_partials/head.html`: add Open Graph and
  Twitter card tags — `og:title`, `og:description`, `og:url`, `og:type`,
  `og:site_name`, `og:image`, `twitter:card`, and the Twitter title/description/
  image equivalents. There are none today; this partial is currently four lines.
- [x] 1.2 Resolve each value from the page's own front matter with a fallback to
  `site.Title` / `site.Params.description`. Use `.Permalink` for `og:url` — it is
  absolute, which `relativeURLs = true` in `hugo.toml` makes worth checking
  explicitly rather than assuming.
- [x] 1.3 Add a default share image to `static/` and reference it as an absolute
  URL. A card with no image is a thin grey strip on most platforms.
- [x] 1.4 Do not mark any of these values `| safe`. Titles and descriptions are
  free text.
- [x] 1.5 `partialCached` is used for the css/js partials in this file — do not
  extend caching to the OG block, whose values vary per page.

## 2. Share page template

- [x] 2.1 Have the Hugo build emit a share-page template into the web root — a
  complete page in the site's chrome and CSS, with substitution tokens where the
  item's metadata and content go. The refresher fills tokens; it does not contain
  markup. A theme change then reaches share pages with no refresher edit.
- [x] 2.2 Give the template a path that is clearly not a visitable page and that
  the refresher can find deterministically.
- [x] 2.3 Token set covers: canonical URL, title, plain-text description, image
  URL (and its presence/absence), body content, and item-specific display fields
  — event date/time/location, announcement published date.
- [x] 2.4 The template's event body links to `/calendar/` and the announcement
  body to `/announcements/` for onward browsing. This is a link, not a redirect.

## 3. On-request generation

- [x] 3.1 A small responder bound to loopback only, started by systemd, that
  takes an item kind and id, resolves it against the public API, fills the same
  template the refresher uses, writes the page, and returns it. Stock Caddy has
  no CGI or exec, and their build is stock — a loopback `reverse_proxy` target is
  the option that needs no Caddy plugin and no rebuild.
- [x] 3.2 Caddy: serve the generated file when it exists and fall through to the
  responder when it does not, for the two share path prefixes only. Nothing else
  on the site changes routing.
- [x] 3.3 One renderer. The responder and the refresher MUST call the same fill
  function against the same template; do not write a second renderer that "does
  roughly the same thing" — the drift would show up only in previews, which is
  the hardest place to notice it.
- [x] 3.4 An id that does not resolve to a public item returns not-found and
  writes nothing. Do not retry, do not cache the negative, do not create a
  placeholder file — a placeholder would be indistinguishable from a real page to
  the reconciler.
- [x] 3.5 The responder is not reachable from outside the host. It takes an id
  from a path segment and does one outbound API call; treat the id as untrusted
  and reject anything that is not a well-formed identifier before it reaches a
  filesystem path.

## 4. Refresher

- [x] 4.1 New `deploy/share-pages/` holding a refresh script, a oneshot
  `.service`, a `.timer`, and a README — the same four-file shape as
  `deploy/yt-feed-cache/`, whose README is the model for the install steps.
- [x] 4.2 Fetch public events over a bounded window using the API's `from`/`to`
  range parameters, so recently past events keep their pages and a link shared
  before an event does not die when it ends. Pick the window in the script with a
  comment saying why; do not retain forever.
- [x] 4.3 Fetch public announcements from `/public/announcements`.
- [x] 4.4 Select events by `visibility === "Public"`. Members-only entries arrive
  already sanitized — title `"Members-Only Event"`, null description/location/
  image — so a selection bug produces a useless page rather than a disclosure.
  Note that property in the script; it is why this is safe to run unattended.
- [x] 4.5 Write `/e/<id>/index.html` and `/a/<id>/index.html` under the web root
  by filling the template.
- [x] 4.6 Maintain a crawlable index of the generated pages — a sitemap the
  refresher owns, reconciled in the same pass. Without it these pages are orphans:
  the calendar's links to events are script-rendered and absent from the served
  HTML, so a crawler walking the site never reaches a share page and the SEO half
  of this change is lost. Remove an entry when its page is removed.
- [x] 4.7 Resolve `image_url` against the API origin. The API returns paths like
  `uploads/<uuid>.jpg`, relative to Coterie, not to this site.
- [x] 4.8 Reconcile, do not merely add — but scope removal to what was actually
  queried. Delete a page only when its id was **in the window the refresher asked
  about** and came back missing; that is a retraction. A page whose item falls
  outside the queried window is absent because it was not requested, and deleting
  on that basis would wipe every page older than the window on the first run.
- [x] 4.9 Maintain a manifest the refresher owns, recording each generated page's
  id, kind, and item date. It is what lets 4.7 tell "retracted" from "out of
  scope", and it is also how the on-request responder's pages become known to the
  refresher — a page written by the responder must appear in the manifest or the
  next reconcile cannot reason about it.
- [x] 4.10 Age-out governs polling only. Stop refreshing an item older than the
  refresh window; keep serving its page indefinitely. Do NOT delete for age — the
  only cause for removal is retraction observed while the item was in scope.
  Re-fetching years of events that will never change is unbounded work; serving an
  already-written file costs nothing.
- [x] 4.11 Make reconciliation conditional on a successful fetch of **both**
  payloads. On any failure — non-2xx, timeout, unparseable body, or a body that
  is not a JSON array — exit non-zero having changed nothing.
  `yt-feed-refresh.sh` sets this precedent with its `grep -q "<entry>"` sanity
  check; do the equivalent before touching the web root.
- [x] 4.12 Never delete anything outside the generated path prefixes. Compute the
  delete set from directories the refresher itself owns, not from a glob of the
  web root.
- [x] 4.13 Escape every interpolated value for its context. `content_html` from
  the announcements API is already server-sanitized by Coterie's ammonia
  whitelist and is the one value rendered as markup; everything else, including
  every metadata attribute, is escaped text.
- [x] 4.14 Derive the metadata description as plain text — strip markup, bound
  the length on a word boundary. Do not put `content_html` in an `og:description`.

## 5. Retraction

- [x] 5.1 Pick the timer interval as an exposure bound and say so in the timer
  unit's comment: on-request generation already covers creation latency, so the
  interval's only real job is capping how long a retracted item lingers. Short —
  minutes, not the 30 the yt-feed cache uses for a different purpose.
- [x] 5.2 Document the immediate-purge action in the README next to the install
  steps: the one command that runs the reconcile now. The moment it is needed is
  not the moment to be reading the script to figure out how.
- [x] 5.3 Serve share pages with `no-cache` plus an ETag in the Caddy block —
  revalidate, not don't-store. These documents are a few KB, so a conditional
  request per view is free at this traffic, and it buys effectively instant
  retraction at the browser and proxy layer. A long-lived header would keep a
  removed page alive downstream after the origin dropped it, extending exactly
  the exposure the removal was meant to end.
- [x] 5.4 Do NOT fingerprint or version the share URL. Asset fingerprinting works
  because the referencing document is rewritten; a share URL is the thing being
  shared, so changing it breaks every saved link and does not invalidate the
  previews already cached against the old address. Cache correctness here comes
  from lifetime, not from the address.
- [x] 5.5 Confirm by test that the on-request path cannot resurrect a removed
  page — this is already required by section 3, but it is load-bearing for
  retraction and deserves an explicit assertion here rather than being assumed.
- [x] 5.6 Do not claim in docs that removal recalls anything already scraped. A
  platform that fetched a preview keeps it. Say plainly that the window is bounded
  and that third-party copies are not recoverable, so nobody plans around a
  guarantee that does not exist.

## 6. Deploy safety

- [x] 6.1 `deploy.sh` line 7 is `rsync -av --delete --exclude=yt-feed.xml`. Add
  excludes for the generated share-page paths. **Without this the next deploy
  deletes every generated page.**
- [x] 6.2 Fix `deploy/yt-feed-cache/README.md:35`, which states "deploys rsync
  WITHOUT --delete, so it survives deploys." That is false — `--delete` is
  present and `yt-feed.xml` survives because of the `--exclude`. Anyone adding a
  generated path while trusting that sentence loses it on the next deploy, which
  is exactly the trap this change has to walk past.
- [x] 6.3 State the exclude requirement in the new README too, next to the
  install steps, so the two generated paths are documented in the same place they
  are created.

## 7. Copy control

- [x] 7.1 In the event modal, the copy control copies `/e/<id>/` as an absolute
  URL. The `#event-<id>` fragment and its month parameter stay exactly as they
  are for in-page state and `hashchange`.
- [x] 7.2 Keep one copy-and-confirm helper shared with the announcement modal;
  the announcement control now copies `/a/<id>/`.
- [x] 7.3 Both copy controls fire a request to the share URL when used, priming
  the page. Copying does not fetch, so without this the first request is whatever
  fetches the pasted link — usually a crawler on a short timeout with no retry.
  Fire it without blocking the copy: the clipboard write must not wait on the
  network, and a failed prime is harmless because the on-request path still
  covers it.

## 8. Tests

- [x] 8.1 The rendered `head` carries OG and Twitter tags with page-specific
  values, and falls back to site values on a page with no front-matter
  description.
- [x] 8.2 `og:url` and `og:image` are absolute.
- [x] 8.3 Refresher: a payload with two public events and one members-only event
  produces exactly two event pages.
- [x] 8.4 An id present on disk and inside the queried window, but absent from the
  payload, has its directory removed.
- [x] 8.5 An id present on disk whose item falls **outside** the queried window is
  retained, not removed. This is the regression that would silently delete every
  older page on the first run, so assert it directly rather than trusting the
  window arithmetic.
- [x] 8.6 A page whose item is older than the refresh window is kept and not
  re-fetched. Assert it is still present after a run — deleting for age is the
  regression this guards.
- [x] 8.7 On-request: a public item with no page on disk is generated and returned;
  the file exists afterwards and a second request does not regenerate it.
- [x] 8.8 On-request: an id that is not a public item returns not-found and leaves
  no file behind — assert the absence, since a stray placeholder is what would
  confuse the reconciler.
- [x] 8.9 On-request and refresher output for the same item are byte-identical.
  This is the assertion that keeps the two paths from drifting.
- [x] 8.10 A responder request with a path segment that is not a well-formed id —
  including traversal attempts — is rejected before any filesystem access.
- [x] 8.11 Using a copy control for an item with no page on disk results in that
  page existing, and the clipboard write is not blocked by the prime request.
- [x] 8.12 Retraction: a page exists, its item flips to members-only, reconcile
  runs, the page is gone — and a subsequent request for it returns not-found
  without recreating it. Assert the second half; a removal the on-request path
  immediately undoes is not a removal.
- [x] 8.13 A failed fetch — non-2xx, and separately an unparseable body — leaves
  every existing page byte-identical and deletes nothing. Assert both failure
  modes; a body that parses to the wrong shape is the one that slips through.
- [x] 8.14 A title containing `"`, `<`, and `&` cannot break out of either the
  metadata attribute or the page body.
- [x] 8.15 An item with no image produces no item-specific `og:image`.
- [x] 8.16 The refresher deletes nothing outside its own path prefixes — give it a
  web root containing an unrelated file and assert the file survives.
- [x] 8.17 The copy control yields the share page URL, not the calendar deep link.
- [x] 8.18 Announcement deep links still work: `#announcement-<id>` opens and
  clears as before. The shared copy helper is being changed underneath them.

## 9. Build

- [x] 9.1 Rebuild `public/` (`hugo --gc --minify`) so the committed output
  matches source, as this repo's other JS and template changes do.
