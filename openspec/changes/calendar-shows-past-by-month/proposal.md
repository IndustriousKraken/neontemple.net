# calendar-shows-past-by-month

## Why

The public calendar blanks out past days: it fetches upcoming events only
(`getEvents({ limit: 100 })` once in `loadEvents`), so navigating to a past month
shows nothing. Members want to see what happened on those days.

Coterie is adding an opt-in date range to `/public/events` (its
`public-events-past-via-range` change): supplying `from`/`to` returns events in
that window, past included. This change has the calendar fetch the **month it is
displaying** and refetch as you navigate, so past events appear on their days and
older months load when you page back. Ships with the Coterie change (depends on
the `from`/`to` params).

The marketing **home page** "Upcoming Events" section is a separate code path
(`main.js`) and stays upcoming-only — it does not send a range.

## What Changes

- `api.js` `getEvents` accepts optional `from`/`to` params (passed through to
  `/public/events`).
- `calendar.js` fetches events for the displayed month's range instead of a flat
  upcoming list:
  - On init, load the current month (its past days included).
  - On previous/next/today/jump-to-event, load the target month if not already
    loaded, and merge results into `this.events` de-duplicated by `id`.
  - A month already loaded is not refetched.
  - The month range is padded by ~1 day on each side so events near a timezone
    boundary aren't missed; day-bucketing (`eventDayKey`, the event's own zone)
    still places them on the correct day.
- Error handling is preserved: a failed fetch still sets the error state and
  clears loading (the existing calendar requirement).

## Impact

- **Spec:** `calendar` — 1 ADDED requirement (load the displayed month, including
  past; refetch-and-merge on navigation). `api-client` — 1 MODIFIED requirement
  ("builds list endpoints from optional query parameters"): `getEvents` also
  appends `from`/`to`. Existing calendar requirements (invalid-time tolerance,
  load-error, search) are unchanged.
- **Code:** `themes/terminal/assets/js/api.js` (`getEvents` params),
  `themes/terminal/assets/js/calendar.js` (per-month load + merge + loaded-month
  tracking; navigation triggers loads).
- **Tests:** `calendar.test.js` — navigating to an unloaded month triggers a
  ranged `getEvents` and merges; a loaded month is not refetched; a rejecting
  fetch still sets the error state.
- **Home page:** unchanged (upcoming-only, no range param).
- **Sequencing:** deploy with Coterie's `from`/`to` support.
