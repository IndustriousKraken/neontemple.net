## 1. Make date-key formatting tolerate invalid dates

- [ ] 1.1 In `themes/terminal/assets/js/calendar.js`, change `formatDateKey`
  (line 188) to detect an invalid `Date` (`Number.isNaN(date.getTime())`) and
  return `null` instead of calling `toISOString()` on it.

## 2. Skip events with an unparseable start_time

- [ ] 2.1 In `loadEvents` (`calendar.js:110`), after fetching events, filter out
  any event whose `start_time` does not parse to a valid date
  (`Number.isNaN(new Date(e.start_time).getTime())`) before assigning to
  `this.events`, so invalid records never reach the grid or list views.
- [ ] 2.2 Verify the `calendarDays` getter (line 63) and `selectedDateEvents`
  getter (line 102) no longer pass an invalid date into `formatDateKey` (a `null`
  key returned by 1.1 must never equal a real `dateStr`, so invalid events fall
  out of every day cell rather than throwing).

## 3. Regression test

- [ ] 3.1 Add a test `calendar_renders_when_an_event_has_invalid_start_time`
  that loads an event set containing one event with `start_time: "not-a-date"`
  (or missing) and asserts that reading the `calendarDays` getter does not throw
  and that the valid events still appear in their day cells.
