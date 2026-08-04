# Tasks

## 1. Building the link

- [ ] 1.1 `themes/terminal/assets/js/main.js`: add a helper that returns an
  event's direct link — `/calendar/?m=<YYYY-MM>#event-<encodeURIComponent(id)>`,
  absolute against `location.origin` so the copied value is pasteable off-site.
- [ ] 1.2 Derive `<YYYY-MM>` from the event's start time in the event's own
  timezone. `calendar.js` already has `eventDayKey`, which does exactly this
  bucketing and exists because a Thu 7pm EST event is Fri 00:00Z — take the
  year-month from the same derivation rather than from `new Date(...)` in the
  browser's zone. Export or relocate it rather than writing a second copy.
- [ ] 1.3 In `openEventModal`, write the link's path+query+fragment with
  `history.replaceState`, mirroring what `showAnnouncementModal` does for
  `#announcement-`. Guard on the id being present, as that function does.
- [ ] 1.4 Add a "Copy link" button to the event modal's `modal-meta` block, next
  to the register button. Reuse `copyAnnouncementLink`'s copy-and-confirm shape —
  generalize that function rather than cloning it, so the "Copied!" behavior has
  one implementation.

## 2. Opening from a link

- [ ] 2.1 Parse the `m` parameter with a strict `^\d{4}-\d{2}$` test plus a range
  check on the month (01–12) and a sane year window. Anything else is discarded
  and the current month used — do not pass an unvalidated string to `new Date`,
  which accepts far more than it should and fails silently.
- [ ] 2.2 In the calendar component's `init()`, when the URL carries an
  `#event-<id>` fragment: set `currentDate` to the parsed month first, then
  `await this.loadMonth(...)`, then open the modal. Order matters — the event is
  not in `contentStore` until the month resolves.
- [ ] 2.3 Add the `hashchange` listener for `#event-`, alongside the existing
  `openAnnouncementFromHash` registration. Reuse the same month-then-open path so
  a pasted link behaves identically to a followed one.
- [ ] 2.4 An id absent from the store after the month loads opens nothing. Do not
  retry other months, and do not clear the calendar — leave the visitor on a
  working month view.
- [ ] 2.5 Extend `closeModal` to drop the `m` query parameter and the `#event-`
  fragment. It currently strips only `#announcement-`; keep that branch working.

## 3. Encoding

- [ ] 3.1 `encodeURIComponent` on write, `decodeURIComponent` on read.
- [ ] 3.2 The id must not reach the DOM as un-encoded markup. It is an API value
  crossing the same trust boundary `content-rendering` governs — route it through
  the existing `escapeAttr` / `escapeHtml` helpers wherever it is interpolated,
  and do not build the Copy link button's handler by string-interpolating the id
  into an `onclick`.

## 4. Tests

- [ ] 4.1 The link helper produces the event's own month for an evening event
  whose UTC instant lands on the following day — the boundary case that motivates
  deriving the month in the event's zone.
- [ ] 4.2 Opening a modal writes the expected URL; closing it removes both the
  fragment and the `m` parameter.
- [ ] 4.3 A URL naming a month other than the current one loads that month before
  opening the modal. Assert the ordering, not just the end state — an
  implementation that opens first and loads second passes an end-state-only
  assertion by accident once the month is cached.
- [ ] 4.4 Malformed `m` values fall back to the current month without throwing:
  absent, `"2026-13"`, `"garbage"`, `"2026-1"`, and a year far outside range.
- [ ] 4.5 An `#event-<id>` naming an id absent from the loaded month opens no
  modal and leaves the calendar rendered.
- [ ] 4.6 An id containing URL-significant characters survives a write/read round
  trip and never appears un-encoded in generated markup.
- [ ] 4.7 Announcement deep links still work — `#announcement-<id>` opens, copies,
  and clears exactly as before. This change generalizes the copy helper and edits
  `closeModal`, both shared with announcements.

## 5. Build

- [ ] 5.1 Rebuild `public/` (`hugo --gc --minify`) so the fingerprinted bundle in
  the committed output matches the source, as the repo's other JS changes do.
