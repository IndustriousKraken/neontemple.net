# api-client Specification

## ADDED Requirements

### Requirement: The API client exposes the membership-types listing

The API client SHALL provide a `getMembershipTypes` method that requests
`/public/membership-types` through the shared fetch wrapper (inheriting its
error contract) and resolves to the parsed list of active membership types.

#### Scenario: getMembershipTypes requests the bare endpoint

- **WHEN** `getMembershipTypes()` is called
- **THEN** the request targets `/public/membership-types` with no query string
  and resolves to the parsed JSON body
