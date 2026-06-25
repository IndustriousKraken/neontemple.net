## Why

The calendar's search feature is implemented by the `searchFilteredEvents` getter
(`themes/terminal/assets/js/calendar.js:39-49`) and consumed by `filteredEvents`
(the list view), `searchResults`, and `showSearchDropdown`. The getter has
several untested branches:

- the empty-term branch — `if (!this.search.trim()) return this.events`
  (`calendar.js:40`) — which also covers a whitespace-only term;
- the case-insensitive substring match across `title`, `description`, `location`,
  and `event_type` (`calendar.js:43-48`); and
- the null-guards `e.description && ...`, `e.location && ...`,
  `e.event_type && ...` (`calendar.js:45-47`) that tolerate events lacking those
  optional fields.

`calendar.test.js` exercises the invalid-`start_time` tolerance and the load
path, but **does not test search at all** — none of these branches has an
assertion. No canonical spec currently governs the calendar's search semantics,
so this change establishes that contract and the tests that assert it.

## What Changes

- Add tests in `themes/terminal/assets/js/calendar.test.js` for
  `searchFilteredEvents`: empty/whitespace term returns all events; a term
  matches case-insensitively across `title`, `description`, `location`, and
  `event_type`; a non-matching term returns an empty list; and events missing the
  optional fields are tolerated (no throw).
- Add a `calendar` capability requirement specifying the case-insensitive,
  multi-field search filter and its empty-term and missing-field behavior.

## Impact

- Test file: `themes/terminal/assets/js/calendar.test.js` (new tests; no
  production code change).
- Capability spec: `calendar` (one ADDED requirement).
