## ADDED Requirements

### Requirement: Image paths are resolved to absolute URLs before rendering

Before an `image_url` is rendered, it SHALL be resolved by `getImageUrl`. A value
that already begins with `http://` or `https://` SHALL be returned unchanged. Any
other non-empty value SHALL be treated as a path relative to the configured API
base URL (`window.COTERIE_API_URL`, or the empty string when unset) and joined to
it with a single `/`. A falsy value SHALL resolve to the empty string.

#### Scenario: an absolute URL is returned unchanged

- **WHEN** `getImageUrl('https://cdn.example.com/a.jpg')` is called
- **THEN** it returns `https://cdn.example.com/a.jpg`

#### Scenario: a relative path is joined to the configured API base URL

- **GIVEN** `window.COTERIE_API_URL` is `https://api.test`
- **WHEN** `getImageUrl('uploads/a.jpg')` is called
- **THEN** it returns `https://api.test/uploads/a.jpg`

#### Scenario: a relative path with no configured base URL is rooted at the path separator

- **GIVEN** `window.COTERIE_API_URL` is unset
- **WHEN** `getImageUrl('uploads/a.jpg')` is called
- **THEN** it returns `/uploads/a.jpg`

#### Scenario: a falsy image path resolves to the empty string

- **WHEN** `getImageUrl('')` or `getImageUrl(null)` is called
- **THEN** it returns the empty string
