# api-client Specification

## Purpose
TBD - created by archiving change tests-coterie-api-client-contract. Update Purpose after archive.
## Requirements
### Requirement: The API client surfaces backend errors from non-OK responses

The Coterie API client's `fetch` wrapper SHALL treat any response whose status is
not OK as an error. When the response body parses to JSON containing a `message`,
the client SHALL reject with an `Error` carrying that `message`. When the body
does not parse as JSON, the client SHALL reject with an `Error` whose message is
`HTTP <status>`. A failure of the underlying network request SHALL propagate to
the caller rather than being swallowed. On an OK response, the client SHALL
resolve to the parsed JSON body.

#### Scenario: a non-OK response with a JSON message surfaces that message

- **GIVEN** the backend responds with a non-OK status whose JSON body is
  `{ "message": "boom" }`
- **WHEN** a request is made through the API client's `fetch` wrapper
- **THEN** the returned promise rejects with an `Error` whose message is `boom`

#### Scenario: a non-OK response with an unparseable body falls back to the HTTP status

- **GIVEN** the backend responds with status `503` and a body that does not parse
  as JSON
- **WHEN** a request is made through the API client's `fetch` wrapper
- **THEN** the returned promise rejects with an `Error` whose message is `HTTP 503`

#### Scenario: a network failure propagates to the caller

- **GIVEN** the underlying `fetch` rejects (for example, the network is
  unreachable)
- **WHEN** a request is made through the API client's `fetch` wrapper
- **THEN** the returned promise rejects with that error rather than resolving

#### Scenario: an OK response resolves to the parsed JSON body

- **GIVEN** the backend responds with an OK status and a JSON array body
- **WHEN** a request is made through the API client's `fetch` wrapper
- **THEN** the returned promise resolves to that parsed array

### Requirement: The API client builds list endpoints from optional query parameters

The API client's `getEvents` and `getAnnouncements` methods SHALL append a `limit`
and/or `type` query parameter to their endpoint only when that parameter has a
truthy value, and SHALL request the bare endpoint when no parameters are supplied.

#### Scenario: a limit and type produce a combined query string

- **WHEN** `getEvents({ limit: 25, type: 'ctf' })` is called
- **THEN** the request targets `/public/events?limit=25&type=ctf`

#### Scenario: no parameters request the bare endpoint

- **WHEN** `getEvents()` is called with no arguments
- **THEN** the request targets `/public/events` with no query string

#### Scenario: a zero limit is omitted from the query string

- **WHEN** `getEvents({ limit: 0 })` is called
- **THEN** the request targets `/public/events` with no `limit` parameter

