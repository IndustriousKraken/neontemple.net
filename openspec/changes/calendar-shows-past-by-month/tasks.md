# Tasks

Depends on Coterie's `from`/`to` support (`public-events-past-via-range`). The
home page's upcoming-only path (`main.js`) MUST stay unchanged.

## 1. API client

- [ ] 1.1 `themes/terminal/assets/js/api.js` — `getEvents` accepts optional
  `from`/`to` and appends them as query params when present. Existing
  `limit`/`type` behavior unchanged (a call with neither range param is
  byte-identical to today).

## 2. Calendar per-month loading

- [ ] 2.1 `themes/terminal/assets/js/calendar.js` — add a `loadMonth(year, month)`
  that: builds a `from`/`to` range for that month padded by ~1 day each side
  (ISO instants); returns early if the `YYYY-MM` key is already in a
  `loadedMonths` set; else fetches `getEvents({ from, to })`, drops
  invalid-`start_time` records (as `loadEvents` does today), merges into
  `this.events` de-duplicated by `id`, stores each in `window.contentStore`, and
  records the month as loaded. Preserve the existing error handling (set
  `this.error`, clear `this.loading`).
- [ ] 2.2 `init()` loads the current month via `loadMonth`. `prevMonth`,
  `nextMonth`, `goToToday`, and `goToEvent` call `loadMonth` for the month they
  navigate to.
- [ ] 2.3 Keep day-bucketing on `eventDayKey` (event timezone) — do NOT bucket by
  the fetch range.

## 3. Tests (`calendar.test.js`)

- [ ] 3.1 Navigating to an unloaded month issues a `getEvents` carrying `from`/`to`
  for that month and merges the returned events into the grid.
- [ ] 3.2 Returning to an already-loaded month issues no further fetch.
- [ ] 3.3 An event returned by two overlapping month loads appears once (dedup by
  `id`).
- [ ] 3.4 A rejecting `getEvents` still sets `error` and clears `loading` (the
  existing load-error requirement still holds).

## 4. Verify

- [ ] 4.1 `openspec validate calendar-shows-past-by-month --strict` passes.
- [ ] 4.2 `npm test` green; `hugo` builds.
