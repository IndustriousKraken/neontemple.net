## 1. Add search-filtering tests for the calendar component

- [ ] 1.1 `searchFilteredEvents_returns_all_events_for_empty_or_whitespace_search`
  — build the component via `makeComponent()`, set `component.events` to two or
  more valid events, and assert `component.searchFilteredEvents` returns all of
  them when `component.search` is `''` and when it is `'   '` (whitespace only).
- [ ] 1.2 `searchFilteredEvents_matches_title_case_insensitively` — with an event
  titled `'CTF Night'`, set `component.search = 'ctf'` and assert the result
  contains that event (lower-case term matches mixed-case title).
- [ ] 1.3 `searchFilteredEvents_matches_description_location_and_type` — with
  events carrying distinct `description`, `location`, and `event_type` values,
  assert that a term matching each of those fields (in any letter case) returns
  the corresponding event.
- [ ] 1.4 `searchFilteredEvents_returns_empty_for_no_match` — assert that a term
  matching none of the searchable fields returns an empty array.
- [ ] 1.5 `searchFilteredEvents_tolerates_events_missing_optional_fields` —
  include an event with a `title` but no `description`, `location`, or
  `event_type`; assert that applying a non-empty term does not throw and that the
  event is included only when the term matches its `title`.
