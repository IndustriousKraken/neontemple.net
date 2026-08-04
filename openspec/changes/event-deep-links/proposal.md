# Change: A calendar event has a direct link that can be shared

## Why

Announcements have shareable direct links. Commit `cf42f70` gave
`showAnnouncementModal` three things: a **Copy link** button, a
`#announcement-<id>` fragment written to the URL on open, and
`openAnnouncementFromHash()` wired to `hashchange` and re-run after the list
loads. Events got none of it, and never have — `git log -S "Copy link" --all --
themes/` returns exactly that one commit, and `-S` for `#event-`, `copyEventLink`,
and `EventFromHash` return nothing in the entire history.

So there is no way to point anyone at a specific event. Posting one to social
media means linking `/calendar/` and describing which tile to click, which is
worse the further out the event is: a September workshop is two clicks of month
navigation away from an August visitor, with nothing on the landing page
indicating it exists.

Events cannot copy the announcement solution outright, and that is the whole
design problem. `loadAllAnnouncements` fetches the entire list in one call, so by
the time the hash is read every announcement is in `contentStore`. Events are
fetched **per displayed month** by `loadMonth(year, month)`, so a bare
`#event-<id>` for a September event opened during August finds nothing in the
store and silently does nothing. Coterie's public API offers no
`GET /public/events/:id` to fall back on — only the `from`/`to` list — so the id
alone is not enough information to resolve the event.

The link therefore has to carry the month. That keeps the whole feature
client-side, needs no Coterie change, and reuses `loadMonth`, which already
de-duplicates by id and skips months it has loaded.

Two pieces of the plumbing already exist: `calendar.js` writes every fetched event
into `window.contentStore.events[e.id]`, which is the store `openEventModal`
reads from, and the `calendar` capability's month-loading requirement already
names "jump-to-event" as a reason the displayed month changes — a trigger no code
currently provides.

## What Changes

- An event modal reflects the open event in the URL as
  `/calendar/?m=<YYYY-MM>#event-<id>`, and carries a **Copy link** button that
  copies that URL, matching the announcement modal's affordance.
- Opening `/calendar/` with such a URL loads the month named by `m`, then opens
  that event's modal. Loading the month first is what makes the link work for an
  event outside the current month — the case the feature exists for.
- The month parameter is a hint, not a trust boundary: an absent, malformed, or
  out-of-range `m` falls back to the current month rather than erroring, and an
  id that is not in the loaded month opens nothing and leaves the calendar
  usable.
- Closing the modal drops both the fragment and the month parameter, so the URL
  reflects that nothing is open — the same way `closeModal` already handles
  `#announcement-`.
- `hashchange` opens an event the same way it opens an announcement, so editing
  or pasting a link while already on the page works.

Non-goals:

- **No new Coterie endpoint.** A `GET /public/events/:id` would make the bare
  `#event-<id>` form resolvable, but it is a server change in the other repo for a
  link this site can already construct completely.
- **No per-event Hugo pages.** Events live in Coterie and change without a
  rebuild; a static page per event would be stale by construction.
- **Announcement deep links are untouched.** They work, they are live, and this
  change follows their shape rather than reworking them.
