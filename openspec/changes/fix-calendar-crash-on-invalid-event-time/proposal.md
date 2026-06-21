## Why

The Alpine calendar component groups events into day cells using `formatDateKey`
(`themes/terminal/assets/js/calendar.js:188`):

```js
formatDateKey(date) {
  return date.toISOString().split('T')[0];
}
```

`Date.prototype.toISOString()` throws `RangeError: Invalid time value` when the
`Date` is invalid. The component builds each `Date` directly from the API's
`start_time` field with no validation:

- `calendar.js:63` (inside the `calendarDays` getter):
  `this.events.filter(e => this.formatDateKey(new Date(e.start_time)) === dateStr)`
- `calendar.js:102` (`selectedDateEvents` getter): same `new Date(e.start_time)`.

If any single event returned by `CoterieAPI.getEvents()` has a missing or
malformed `start_time` (the API is a trust boundary; the value is consumed
unchecked), `new Date(e.start_time)` produces an `Invalid Date` and
`toISOString()` throws. Because `calendarDays` is a getter evaluated during
Alpine's render, the thrown `RangeError` propagates out of the render pass and
**the entire month grid fails to render** — one bad record blanks the whole
calendar for every visitor.

**Harm: denial of view / crash on attacker- or backend-controlled input.** No
canonical spec yet governs how the calendar handles events with an invalid
`start_time`, so this change establishes that contract.

## What Changes

- Make `formatDateKey` tolerate invalid dates: return a sentinel (e.g. `null`)
  instead of throwing when the supplied `Date` is invalid.
- Ensure events whose `start_time` does not parse to a valid date are excluded
  from the grid, list, and selected-day views rather than aborting the render.
- Establish a `calendar` capability requirement: a single event with an invalid
  `start_time` is skipped and does not prevent the remaining events or the
  calendar grid from rendering.

## Impact

- `themes/terminal/assets/js/calendar.js` (`formatDateKey`, `loadEvents`, and the
  `calendarDays` / `selectedDateEvents` consumers).
- The generated bundle under `public/js/` is rebuilt by Hugo from the theme
  asset; no hand edit there.
- New capability spec: `calendar`.
