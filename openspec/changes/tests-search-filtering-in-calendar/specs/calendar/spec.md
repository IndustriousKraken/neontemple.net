## ADDED Requirements

### Requirement: The calendar filters events by a case-insensitive search term

When a search term is present, the calendar's filtered event list SHALL include
only events whose `title`, `description`, `location`, or `event_type` contains the
term, compared case-insensitively. A search term that is empty or contains only
whitespace SHALL impose no filter (all events are included). Events that lack the
optional `description`, `location`, or `event_type` fields SHALL be tolerated
during the match rather than causing an error.

#### Scenario: an empty or whitespace search term returns all events

- **GIVEN** an event list with two or more events
- **WHEN** the search term is empty or contains only whitespace
- **THEN** the filtered list contains every event

#### Scenario: the search term matches across title, description, location, and type

- **GIVEN** events that differ in `title`, `description`, `location`, and
  `event_type`
- **WHEN** the search term, in any letter case, is a substring of one event's
  `title`, `description`, `location`, or `event_type`
- **THEN** the filtered list contains that event
- **AND** the comparison is case-insensitive

#### Scenario: a search term with no match returns no events

- **WHEN** the search term matches none of the events' searchable fields
- **THEN** the filtered list is empty

#### Scenario: events missing optional fields are tolerated during search

- **GIVEN** an event that has a `title` but no `description`, `location`, or
  `event_type`
- **WHEN** a non-empty search term is applied
- **THEN** filtering completes without throwing
- **AND** the event is included only when the term matches its `title`
