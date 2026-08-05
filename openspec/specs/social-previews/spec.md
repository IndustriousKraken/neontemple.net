# social-previews Specification

## Purpose
TBD - created by archiving change social-share-previews. Update Purpose after archive.
## Requirements
### Requirement: Every page carries Open Graph and Twitter card metadata

Every page the site serves SHALL emit Open Graph and Twitter card metadata in its
`<head>`: a title, a description, a canonical absolute URL, a type, the site
name, and an image. The site emits none today, so every link shared from it
previews from whatever a platform can infer.

Values SHALL come from the page's own front matter where it has them and fall
back to the site-level title, description, and default share image otherwise, so
a page that says nothing about itself still previews as the site rather than as
nothing.

The canonical URL SHALL be absolute. Crawlers do not resolve relative URLs
against the page they fetched.

Every value SHALL be escaped for the HTML attribute context it lands in.

#### Scenario: An ordinary page previews as itself

- **WHEN** a crawler fetches any page of the site
- **THEN** the served HTML SHALL contain Open Graph title, description, url,
  type, site-name, and image values

#### Scenario: A page without its own description falls back to the site's

- **WHEN** a page defines no description of its own
- **THEN** the site-level description SHALL be emitted rather than an empty value

### Requirement: Each public event and announcement has a generated share page

The site SHALL serve a share page for each public event at `/e/<id>/` and for
each public announcement at `/a/<id>/`, rendering that item's content in the
site's own chrome and stylesheet, and carrying Open Graph and Twitter card
metadata describing that item.

A share page SHALL be a standalone document at its own URL, not the existing
in-page modal. The calendar and announcements modals remain what they are and are
not replaced: a modal is an overlay rendered by script on an already-loaded page,
which is precisely why it cannot be linked to or previewed. The share page is the
same content delivered as a document a crawler and a first-time visitor can both
consume with no script and no prior page.

A share page SHALL be the destination, not a waypoint. It SHALL NOT redirect to
the calendar or announcements page. A redirect would separate what a preview
describes from where the link lands, which is the defect this requirement exists
to remove.

A share page SHALL be served identically to every requester. The site SHALL NOT
vary its response by user agent or serve a crawler a different document than a
person receives. Beyond being penalized as cloaking, a crawler-specific variant
reintroduces the mismatch between preview and destination by construction.

Metadata SHALL be present in the served bytes, not written by client-side script.
A crawler does not execute JavaScript, so script-written metadata is metadata no
preview will show.

An item's `og:image` SHALL be emitted only when that item has an image, resolved
to an absolute URL against the API's origin — the API returns image paths
relative to it.

The metadata description SHALL be plain text with markup removed and length
bounded to what platforms render, while the page body SHALL carry the item's full
content. Announcement bodies arrive as server-sanitized `content_html` and SHALL
be rendered as such; the metadata description SHALL NOT be that HTML.

Share page paths SHALL NOT collide with any path the static site generator
produces.

Generated share pages SHALL be discoverable by search engines. A page that
nothing links to is not indexed: the calendar's own links to events are rendered
by script and are absent from the served HTML, so a crawler following the site
has no path to a share page. The set of generated pages SHALL therefore be
advertised — via the site's sitemap or an equivalent crawlable index — and that
advertisement SHALL be reconciled alongside the pages themselves, so a retracted
item is not still listed after its page is gone.

Wherever the site offers a control that produces a link to a single event or
announcement for sharing, that control SHALL yield the item's share page URL, and
SHALL request that URL when used so the page is generated before the copied link
can be pasted anywhere.

Copying a link does not by itself fetch it — the value goes to the clipboard and
no request is made — so without this the first request for a share page is
whatever fetches the pasted link, which is typically a platform's crawler. That
still works, but it puts page generation on the critical path of a fetch with a
short timeout and no second chance if it fails. Priming on copy moves generation
to a moment when nobody is waiting on it, and leaves the crawler a static file.
This governs the announcement modal's copy control as well as the event
modal's: both previously copied an in-page fragment URL, and both have the same
reason not to. A share affordance that yields a link previewing as something
else is the defect this capability exists to remove, and it is not removed by
fixing only one of the two places it occurs.

#### Scenario: A shared event link previews as that event

- **WHEN** a crawler fetches the share page for a public event that has a title,
  description, and image
- **THEN** the served HTML SHALL contain Open Graph values describing that event,
  including an absolute image URL

#### Scenario: A shared announcement link previews as that announcement

- **WHEN** a crawler fetches the share page for a public announcement
- **THEN** the served HTML SHALL contain Open Graph values describing that
  announcement

#### Scenario: The page is the destination

- **WHEN** a person opens a share page
- **THEN** the response SHALL render the item's content and SHALL NOT redirect

#### Scenario: Generated pages are discoverable

- **WHEN** a share page has been generated
- **THEN** it SHALL be listed in the site's crawlable index of pages

#### Scenario: A retracted item is dropped from the index

- **WHEN** an item's share page is removed
- **THEN** it SHALL no longer be listed in that index

#### Scenario: A crawler and a person receive the same document

- **WHEN** the same share page URL is fetched with a crawler user agent and with
  a browser user agent
- **THEN** both responses SHALL be byte-identical

#### Scenario: An item with no image emits no image tag

- **WHEN** the item has no image
- **THEN** no item-specific `og:image` SHALL be emitted

#### Scenario: Using the copy control generates the page

- **WHEN** a visitor uses a copy control for an item whose share page has not been
  generated
- **THEN** that item's share page SHALL exist afterwards, without the visitor
  having navigated to it

#### Scenario: The announcement copy control yields a share page URL

- **WHEN** a visitor uses the copy control on an announcement modal
- **THEN** the copied value SHALL be that announcement's share page URL, and SHALL
  NOT be the announcements page URL carrying an `#announcement-<id>` fragment

### Requirement: A share page is generated on first request when it is missing

A request for a share page that has not yet been generated SHALL cause that
item's page to be generated and returned, rather than returning a not-found
response. The page SHALL then be written so subsequent requests are served
statically without regenerating.

Waiting for the next scheduled run is not acceptable here, and the reason is
specific rather than aesthetic. A share link is scraped at the instant it is
posted — that is what a preview is — so the one moment a page is most likely to
be missing is the one moment it is most likely to be fetched. Platforms cache
what that scrape returns, including a not-found, and a cached miss outlives the
page's eventual creation until the platform chooses to re-scrape. A delay
measured in minutes therefore produces a broken preview measured in days.

Generating on request SHALL be bounded so it cannot be used to drive load: a
request naming an item that is not public, or not present, SHALL return
not-found without retrying, and SHALL NOT be written to disk. Only a
successfully resolved public item SHALL produce a page.

The generated result SHALL be identical to what the scheduled refresher would
produce for the same item. One template and one fill path — a second renderer
would drift from the first and the drift would only be visible in previews.

#### Scenario: A newly posted event is shareable immediately

- **WHEN** a share page is requested for a public event whose page has not been
  generated
- **THEN** the response SHALL be that event's share page, not a not-found

#### Scenario: The generated page is persisted

- **WHEN** a share page has been generated on request
- **THEN** a subsequent request SHALL be served from the written page

#### Scenario: An unknown or non-public item is not generated

- **WHEN** a share page is requested for an id that is not a public item
- **THEN** the response SHALL be not-found and no page SHALL be written

#### Scenario: On-request and scheduled output agree

- **WHEN** the same item is rendered by the on-request path and by the scheduled
  refresher
- **THEN** the two documents SHALL be identical

### Requirement: Retraction propagates promptly and is manually forceable

A generated share page SHALL stop being served promptly once its item ceases to
be public, and an operator SHALL be able to force that removal immediately
without waiting for the schedule.

The reason this matters more than the rest of the reconcile logic: publishing an
event to the public API makes it visible everywhere at once, and retracting it
withdraws it from everywhere at once — except a generated page, which keeps
serving the withdrawn content until something notices. **The generated pages must
not be the one place where a retraction fails to take effect.** An operator who
publishes by mistake and corrects it within seconds must not discover that the
correction took thirty minutes to reach the public site.

The scheduled interval SHALL therefore be chosen as an exposure bound, not as a
freshness bound. Creation latency is already handled by generating on request, so
the only thing the interval governs is how long a retracted item can linger. It
SHALL be documented as such where the schedule is defined, so that a future
change to the interval is understood as changing an exposure window.

An immediate, documented operator action SHALL exist that reconciles now — the
same reconcile the schedule performs, run on demand. It SHALL be stated alongside
the install instructions, because the moment it is needed is not the moment to be
reading source to work out how to trigger it.

Share pages SHALL be served with a cache lifetime short enough that a removed
page is not still being served from an intermediary cache after the origin has
dropped it. A long-lived cache header would extend the exposure past the removal
that was supposed to end it. These documents are small, so requiring
revalidation on each view costs little and is the correct trade against serving
retracted content.

A share page's URL SHALL be stable for the life of its item and SHALL NOT
incorporate a content hash or version token. Fingerprinting works for assets
because the document referencing them is rewritten and the new name propagates
for free; a share URL is itself the thing that was shared, so changing it
invalidates every saved link while doing nothing about the previews already
cached against the old one. Cache correctness for these pages SHALL be achieved
through cache lifetime, not through changing the address.

The on-request path SHALL NOT resurrect a retracted item. An id that no longer
resolves to a public item returns not-found and writes nothing, so a request
arriving after removal cannot recreate the page.

This requirement bounds what the site itself serves. It SHALL NOT be described as
bounding what third parties retain: a platform that already scraped a preview
keeps its own copy, and no change here reaches it. That is a property of having
published, not of this design, and the honest mitigation is that the exposure
window is short — not that it can be undone.

#### Scenario: A retracted event stops being served

- **WHEN** an event that had a generated page is changed from public to
  members-only and reconciliation runs
- **THEN** the page SHALL no longer be served

#### Scenario: An operator can force removal immediately

- **WHEN** an operator needs a mistakenly published item withdrawn without waiting
  for the schedule
- **THEN** a documented action SHALL perform the reconcile immediately

#### Scenario: A request after removal does not recreate the page

- **WHEN** a share page has been removed because its item is no longer public, and
  the page is then requested
- **THEN** the response SHALL be not-found and no page SHALL be written

#### Scenario: A share URL does not change when its item changes

- **WHEN** an item's content is edited and its page is regenerated
- **THEN** the share page's URL SHALL be unchanged

#### Scenario: A removed page is not served from cache afterwards

- **WHEN** a share page has been removed
- **THEN** its cache lifetime SHALL have been short enough that it is not still
  served from an intermediary cache

### Requirement: A scheduled refresher reconciles the generated share pages

A scheduled refresher SHALL read the public Coterie API and reconcile the set of
generated share pages against it, so a page exists for every currently public
item and for no other. It SHALL follow the shape of the existing cached-feed
refresher on this host: a script, a oneshot service, and a timer, installed
outside the site build.

The refresher SHALL create a page for an item that has none, update a page whose
source item has changed, and **remove a page whose item is no longer public or no
longer present**. An event flipped from public to members-only, or an
announcement deleted, SHALL lose its generated page — a page left behind keeps
serving content the operator has retracted.

Removal SHALL be decided only for items the refresher actually asked about.
Absence from a bounded query is not evidence of retraction: an event outside the
queried window is absent because it was not requested, and deleting on that basis
would destroy every page older than the window on the first run. The refresher
SHALL therefore distinguish an item that was in scope and came back missing —
which is a removal — from an item that was never in scope, which is not.

An item that has aged out of the refresh window SHALL stop being refreshed while
its page continues to be served **indefinitely**. Re-fetching years of events
that will never change again is work that grows without bound; serving a
long-since-generated page costs nothing. A shared link SHALL NOT stop working
because the event it names got old.

Age SHALL therefore govern polling only, never removal. The only cause for
removing a generated page SHALL be retraction — the item ceasing to be public, or
ceasing to exist — observed while that item was in scope. A page SHALL NOT be
deleted for being old.

Reconciliation SHALL be all-or-nothing with respect to failure: when the API
fetch fails or returns something that is not a usable payload, the refresher
SHALL leave every existing page untouched rather than deleting or rewriting any.
A transient API outage SHALL NOT empty the web root.

The refresher SHALL select events over a bounded window that includes recently
past events, so a link shared before an event does not break the moment the event
ends. It SHALL NOT retain pages indefinitely.

The refresher SHALL fill a template produced by the site build rather than
containing its own copy of the site's markup, so page styling has one home and a
theme change reaches share pages without editing the refresher.

Generated pages SHALL survive a site deploy. The deploy synchronizes the web root
with deletion enabled, so every generated path SHALL be excluded from that
deletion. This SHALL be stated where the deploy is defined, not left implied.

Values interpolated into a generated page SHALL be escaped for the context they
land in — attribute or element — and this SHALL hold for both metadata and body
content.

#### Scenario: A newly public item gains a page

- **WHEN** the refresher runs after a public event is created
- **THEN** a share page for that event SHALL exist

#### Scenario: An item that stops being public loses its page

- **WHEN** an event's visibility changes from public to members-only and the
  refresher runs
- **THEN** that event's share page SHALL no longer be served

#### Scenario: A failed refresh changes nothing

- **WHEN** the API is unreachable or returns an unusable payload
- **THEN** every existing share page SHALL remain exactly as it was, and none
  SHALL be deleted

#### Scenario: A recently past event keeps its page

- **WHEN** an event's end time has passed but it falls within the retained window
- **THEN** its share page SHALL still be served

#### Scenario: A page outside the refresh window is not deleted as missing

- **GIVEN** a share page for an event older than the refresh window
- **WHEN** the refresher runs and that event is absent from the payload because it
  was outside the queried range
- **THEN** the page SHALL be retained, and SHALL NOT be treated as a removal

#### Scenario: An old page keeps being served and stops being polled

- **WHEN** a share page's item is older than the refresh window
- **THEN** the page SHALL continue to be served, SHALL NOT be re-fetched, and
  SHALL NOT be removed for age

#### Scenario: Generated pages survive a deploy

- **WHEN** the site is deployed with the deletion-enabled synchronization
- **THEN** the generated share pages SHALL still be present afterwards

#### Scenario: A hostile field value cannot break the page

- **WHEN** an item's title or description contains characters significant in HTML
- **THEN** the generated page SHALL escape them such that neither the attribute
  nor the element context can be broken out of

