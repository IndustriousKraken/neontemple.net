# content-rendering Specification

## Purpose
TBD - created by archiving change secure-escape-image-urls-in-rendered-html. Update Purpose after archive.
## Requirements
### Requirement: Untrusted API field values are encoded for their DOM output context

Values sourced from the Coterie public API (events and announcements) SHALL be
encoded for the output context into which they are inserted before reaching the
DOM. In particular:

- an `image_url` value placed into an HTML attribute (such as an `href`, `src`,
  or inline `style` `url(...)`) SHALL be encoded such that it cannot terminate
  the attribute or introduce additional markup, attributes, or event handlers;
  and
- an event or announcement `id` interpolated into an inline event-handler
  attribute (such as `onclick="showEventModal('<id>')"`) SHALL be encoded for
  that JS-string-inside-an-HTML-attribute context such that it cannot terminate
  the JS string literal or the surrounding attribute, while still round-tripping
  to the original `id` value (which is also used as a lookup key).

#### Scenario: image_url containing an attribute-breakout payload is neutralized

- **WHEN** an event or announcement is rendered whose `image_url` is
  `https://x"><img src=y onerror=alert(1)>`
- **THEN** the rendered DOM contains no element bearing an injected `onerror`
  (or other) event handler
- **AND** no script derived from the `image_url` value executes

#### Scenario: a well-formed image_url still renders the image

- **WHEN** an event or announcement is rendered whose `image_url` is
  `https://example.com/photo.jpg`
- **THEN** the rendered `<img>` element's `src` resolves to
  `https://example.com/photo.jpg`
- **AND** the image displays normally

#### Scenario: an id placed in an inline event handler cannot break out

- **WHEN** an event or announcement card is rendered whose `id` is
  `1');window.__xss=1;//`
- **THEN** activating the rendered inline handler invokes the modal function
  exactly once with the original `id` value
- **AND** no statement injected through the `id` executes

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

