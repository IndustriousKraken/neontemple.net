# api-client Specification

## MODIFIED Requirements

### Requirement: The API client builds list endpoints from optional query parameters

The API client's `getEvents` and `getAnnouncements` methods SHALL append a `limit`
and/or `type` query parameter to their endpoint only when that parameter has a
truthy value, and SHALL request the bare endpoint when no parameters are supplied.
`getEvents` SHALL additionally append `from` and/or `to` query parameters, each
only when supplied a truthy value, so the caller can request an event date range.

#### Scenario: a limit and type produce a combined query string

- **WHEN** `getEvents({ limit: 25, type: 'ctf' })` is called
- **THEN** the request targets `/public/events?limit=25&type=ctf`

#### Scenario: no parameters request the bare endpoint

- **WHEN** `getEvents()` is called with no arguments
- **THEN** the request targets `/public/events` with no query string

#### Scenario: a zero limit is omitted from the query string

- **WHEN** `getEvents({ limit: 0 })` is called
- **THEN** the request targets `/public/events` with no `limit` parameter

#### Scenario: a from/to range is appended for getEvents

- **WHEN** `getEvents({ from: '2026-06-01T00:00:00Z', to: '2026-07-01T00:00:00Z' })` is called
- **THEN** the request URL SHALL carry both a `from` and a `to` query parameter with those values
