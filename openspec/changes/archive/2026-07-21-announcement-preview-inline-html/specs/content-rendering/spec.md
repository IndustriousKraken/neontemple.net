# content-rendering Specification

## MODIFIED Requirements

### Requirement: Untrusted API field values are encoded for their DOM output context

Values sourced from the Coterie public API SHALL be treated as untrusted and
encoded for the output context into which they are inserted before reaching the
DOM, with a single explicit exception — the server-sanitized `content_html`
field described below. In particular:

- an `image_url` value placed into an HTML attribute (such as an `href`, `src`,
  or inline `style` `url(...)`) SHALL be encoded such that it cannot terminate
  the attribute or introduce additional markup, attributes, or event handlers;
  and
- an event or announcement `id` interpolated into an inline event-handler
  attribute (such as `onclick="showEventModal('<id>')"`) SHALL be encoded for
  that JS-string-inside-an-HTML-attribute context such that it cannot terminate
  the JS string literal or the surrounding attribute, while still round-tripping
  to the original `id` value (which is also used as a lookup key).

The announcement `content_html` field is produced by Coterie's server-side
Markdown sanitizer and is the ONLY API value that MAY be inserted as HTML (via
`innerHTML`). The full announcement view (the modal) SHALL render it as-is.
List, card, and banner previews MAY render it only through a
structure-preserving truncation that:

- truncates by a budget of visible characters, where a character entity counts
  as one visible character, and never splits a tag or entity;
- emits only inline formatting tags from a fixed whitelist (`em`, `strong`,
  `del`, `s`, `code`, `sub`, `sup`, `mark`, `u`, `i`, `b`), re-emitted bare so
  no attributes from the input pass through;
- unwraps all other markup — block structure becomes spaced text and links
  become their text content — so the fragment stays valid in an inline
  context; and
- closes any tags left open at the cut, so the emitted fragment is always
  balanced.

When `content_html` is absent, previews SHALL fall back to rendering the raw
`content` as encoded text. All other announcement fields, including the raw
`content` and `title`, remain untrusted and SHALL be inserted as text, never as
HTML.

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

#### Scenario: sanitized content_html renders as formatted HTML in the modal

- **WHEN** an announcement whose `content_html` is
  `<p>hello <strong>world</strong></p>` is opened in the modal
- **THEN** the modal body SHALL contain a rendered `<strong>` element, not the
  literal tag text

#### Scenario: the raw title and content are still inserted as text

- **WHEN** an announcement whose `title` or raw `content` contains
  `<script>alert(1)</script>` is rendered
- **THEN** that value SHALL appear as literal text and no script SHALL execute

#### Scenario: a preview truncation of content_html keeps inline formatting and stays balanced

- **WHEN** a preview of an announcement whose `content_html` is
  `<strong><em>abcdef</em></strong>` is rendered with a visible-character
  budget of 3
- **THEN** the preview fragment is `<strong><em>abc...</em></strong>` — the cut
  falls between visible characters, never inside a tag, and every opened tag is
  closed

#### Scenario: a preview truncation unwraps blocks and links and drops attributes

- **WHEN** a preview of an announcement whose `content_html` is
  `see <a href="https://x.test">the <em class="x">docs</em></a>` is rendered
  within budget
- **THEN** the preview fragment is `see the <em>docs</em>` — no `<a>` element
  and no attribute from the input survives

#### Scenario: a preview falls back to escaped raw content when content_html is absent

- **WHEN** a preview is rendered for an announcement that has no `content_html`
  and whose raw `content` contains `<script>alert(1)</script>`
- **THEN** the preview renders that value as literal text and no script executes
