# Change: Shared links preview as the thing they link to

## Why

The site emits **no Open Graph metadata at all**.
`themes/terminal/layouts/_partials/head.html` is a charset, a viewport, a
`<title>`, and two asset partials — nothing else. Every link ever shared from
this site has previewed from whatever the platform could scrape: the page title
and the site-wide description.

For the event deep links that just shipped, a link to a specific September
workshop previews as **"Calendar | Neon Temple"** with "A cybersecurity guild in
Tampa Bay. Not a cult!" and no image — while the link itself opens that
workshop. The preview describes a month grid; the destination is an event. The
same is true of announcement links, which have had `#announcement-<id>` deep
links since July.

This cannot be fixed on `/calendar/` or `/announcements/`, and not for lack of
trying:

- A crawler **never receives the fragment**. `#event-<id>` is resolved
  browser-side; the request Discord or Facebook makes does not contain it.
- A crawler **does not run JavaScript**. Titles, descriptions, and images arrive
  from the Coterie API via Alpine after load; a crawler reads the served bytes
  and stops.
- A query string **does not vary a static file**. `?m=2026-09` returns the same
  `calendar/index.html`.

At the moment metadata is read, the page cannot know which item is meant. The
only fix is a real page, at a real path, per shareable item.

## What Changes

- **Site-level Open Graph and Twitter card defaults on every page.** Title,
  description, canonical URL, type, site name, and a default image. This alone
  repairs every link anyone has ever shared from this site.
- **A generated share page per public event and per public announcement**, at
  `/e/<id>/` and `/a/<id>/`. Each carries that item's own metadata and renders
  its content, in the site's own chrome and CSS.
- **A refresher on a timer** — the same shape as `deploy/yt-feed-cache`, which
  already refreshes `yt-feed.xml` on this host every 30 minutes — reads the
  public Coterie API and reconciles the generated pages. Staleness is bounded by
  the timer interval rather than by when someone last ran `deploy.sh` from a
  laptop.
- **Generation on first request**, so a page is never merely *scheduled* to
  exist. A timer alone leaves a window between creating an event and its page
  appearing, and that window is not benign: a share link is scraped at the instant
  it is posted, which is exactly when the page is most likely to be missing.
  Platforms cache what that scrape returns — including a not-found — and a cached
  miss outlives the page's eventual creation until the platform re-scrapes on its
  own schedule. A gap measured in minutes therefore yields a broken preview
  measured in days. A miss on a share path instead generates that one page,
  writes it, and serves it, after which it is a static file like any other. The
  copy control also primes the page when used, so in the ordinary flow the page is
  already written before the link is ever pasted — copying a link does not fetch
  it, so without priming the first request would be the crawler's.
- **Bounded polling, unbounded serving.** Items are actively refreshed only
  within a window; older pages stop being re-fetched and keep being served
  indefinitely. Age governs polling, never removal — re-checking years of events
  that will never change again is work that grows without bound, while serving an
  already-written file costs nothing. The only cause for removing a page is
  retraction.
- **The event modal's copy control copies the share page URL**, not the in-page
  calendar deep link. The `#event-<id>` fragment stays exactly as it is for
  in-page state and `hashchange`; sharing and address-bar state are two jobs and
  stop being asked of one control.

### Everyone gets the same bytes

The share page is served identically to every requester. No user-agent
detection, no crawler-specific variant. Serving crawlers different content from
humans is cloaking: platforms penalize it, it breaks the moment a UA string
changes, and it reintroduces the exact defect being fixed — a preview that
describes something other than the destination. The page is the destination.

### Why the marketing site and not Coterie

Coterie could render these pages; it already renders `/events/:id/register`. But
that makes Coterie grow a public marketing surface, and a shared link would land
visitors on portal-styled pages at `coterie.theneontemple.com`. Generating them
here keeps public presentation in the repo that owns public presentation, keeps
the link on the marketing domain, and needs **no Coterie change at all** — the
public API already exposes every field required.

### Why generation is safe

`/public/events` sanitizes members-only entries before they leave Coterie:
`title` becomes `"Members-Only Event"`, and `description`, `location`, and
`image_url` are nulled. Verified against production — of 12 events in a
twelve-month window, 8 are `Public` and 4 arrive already sanitized. So the worst
outcome of a bug in the selection logic is a useless page titled "Members-Only
Event" with no details. **The generator cannot leak private content, because the
feed it reads does not contain any.** That property is what makes an unattended
timer an acceptable thing to point at a web root.

## Known hazards this change must handle

- **`deploy.sh` runs `rsync --delete`.** Generated pages live in the web root and
  a manual deploy will delete them unless excluded — the same protection
  `yt-feed.xml` already relies on. Worth stating loudly because
  `deploy/yt-feed-cache/README.md:35` currently claims *"deploys rsync WITHOUT
  --delete, so it survives deploys"*, which is **false**: line 7 of `deploy.sh`
  is `rsync -av --delete --exclude=yt-feed.xml`. The file survives because of the
  exclude, not because of the absence of `--delete`. Anyone trusting that README
  while adding a second generated path would lose it on the next deploy.
- **An item that stops being public must lose its page, promptly.** Publishing to
  the public API makes an item visible everywhere at once and retracting it
  withdraws it everywhere at once — except a generated page, which keeps serving
  the withdrawn content until something notices. The generated pages must not
  become the one place a retraction fails to take effect. An operator who
  publishes by mistake and corrects it in seconds must not find the correction
  took half an hour to reach the public site. This makes the polling interval an
  **exposure bound rather than a freshness bound** — on-request generation already
  covers creation latency, so how often the timer runs governs nothing except how
  long a retracted item lingers. It also requires a documented immediate purge, a
  short cache lifetime so a removed page is not still served downstream, and the
  on-request path refusing to resurrect a retracted item. What it cannot do is
  recall a preview a platform already scraped; that is a consequence of having
  published, and the honest mitigation is a short window, not an undo.
- **Removal must not be inferred from a bounded query.** "Delete anything absent
  from the payload" combined with a windowed fetch deletes every page older than
  the window on the first run. Absence from a query that never asked about an item
  is not evidence the item was retracted, so the refresher has to tell the two
  apart — which is why it keeps a manifest of what it has generated and when each
  item is dated.
- **A failed fetch must change nothing**, following `yt-feed-refresh.sh`'s rule
  that a transient API failure keeps the last good copy rather than degrading the
  site.

Non-goals:

- **No per-item Hugo content files.** Hugo owns the template; the refresher fills
  it. Committing a content file per event would put Coterie's data in git.
- **No redirect from the share page into the calendar.** The share page is where
  the link goes. A redirect would decouple preview from destination again.
- **No change to the calendar's month loading, fragment handling, or modal
  behavior.** Only what the copy control places on the clipboard changes.
