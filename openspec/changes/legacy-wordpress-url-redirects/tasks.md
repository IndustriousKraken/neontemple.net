# Tasks

## 1. The redirect map

- [ ] 1.1 Add the redirects to `deploy/caddy/theneontemple.com.caddy`, which is
  where this site's routing now lives. Do not add them to the shared
  `/etc/caddy/Caddyfile` and do not use Hugo aliases — an alias emits a
  meta-refresh stub that returns `200` for a page that does not exist, which is a
  worse answer than the redirect.
- [ ] 1.2 Use permanent (301) redirects so search engines transfer the indexed
  URL rather than continuing to offer a failing link.
- [ ] 1.3 Map, at minimum, the paths observed in the access log:
  - `/events/` and `/events/ics/`
  - `/register/remote-membership/`
  - `/join-the-guild-intermediary-page/`
  - `/guild/`
  - `/blog/`
  - `/feed/`, `/feed/atom/`, `/rss/`
  - `/login`
- [ ] 1.4 Choose each destination by what the legacy page was for, not by name
  similarity. `/events/` is the calendar; `/register/remote-membership/` and
  `/join-the-guild-intermediary-page/` are both the join page; `/guild/` is the
  about page; the feed paths are the site's current feed.
- [ ] 1.5 Where no honest equivalent exists, redirect to the nearest true
  destination rather than inventing a page. Do not create stub pages to be
  redirect targets.
- [ ] 1.6 Place the redirects so they are evaluated before the static file
  handler, and confirm they do not shadow any real path — particularly `/events/`
  against anything the generated share pages or the calendar use.

## 2. The calendar feed

- [ ] 2.1 `/events/ics/` redirects to the iCal feed Coterie serves at
  `/public/feed/calendar` on the API origin.
- [ ] 2.2 Verify a calendar client following the redirect actually receives
  calendar data — not just that the redirect is issued. The failure being fixed is
  invisible to the subscriber, so a redirect that leads somewhere unusable would
  be equally invisible.
- [ ] 2.3 Check whether the redirect needs to preserve any query the legacy feed
  accepted, and if it does not, say so in a comment rather than leaving it
  unconsidered.

## 3. No catch-all

- [ ] 3.1 Do NOT add a fallback redirect for unmatched paths. Unmatched requests
  keep returning 404.
- [ ] 3.2 Record the reason beside the map: the bulk of 404 traffic is hostile
  scanning, a catch-all would answer all of it with a redirect to a real page,
  and that manufactures soft-404s, confirms every probed path to the scanner, and
  destroys the log signal this map was derived from.
- [ ] 3.3 Keep the `neontemple.net` block's path-preserving redirect exactly as
  it is. It is why per-path mapping is possible.

## 4. Verification

- [ ] 4.1 Each mapped path returns 301 to its intended destination, and that
  destination returns 200.
- [ ] 4.2 `/events/ics/` yields calendar data at the end of the redirect chain.
- [ ] 4.3 A path from the legacy hostname — `neontemple.net/events/` — completes
  the whole chain to the calendar, since that is how these requests actually
  arrive.
- [ ] 4.4 An unmapped path still returns 404. Assert this explicitly; it is the
  property task 3.1 protects and the easiest to lose by adding one convenient
  rule later.
- [ ] 4.5 Existing routes are unaffected: `/`, `/calendar/`, `/announcements/`,
  `/join/`, `/yt-feed`, and a generated share page under `/e/`.

## 5. Documentation

- [ ] 5.1 Note in the deploy README how the map was derived — filtering 404s in
  the site access log, discarding scanner probes — so the next person extends it
  from evidence rather than by guessing.
