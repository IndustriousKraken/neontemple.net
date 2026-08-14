# legacy-urls Specification

## Purpose
TBD - created by archiving change legacy-wordpress-url-redirects. Update Purpose after archive.
## Requirements
### Requirement: Legacy WordPress paths redirect to their current equivalents

A request for a path from the site's former WordPress incarnation SHALL be
redirected permanently to the page that now serves that purpose, rather than
returning a not-found response.

These paths arrive because the former hostname's redirect preserves the request
path when forwarding to the current site. That behavior is correct and SHALL be
retained: it is what allows a specific legacy URL to be recognized and mapped at
all, where a redirect that discarded the path would deliver everyone to the home
page with no way to do better.

Redirects SHALL be permanent, so that search engines transfer the indexed URL to
its replacement rather than continuing to offer a link that fails.

Which paths are mapped SHALL be determined by whether they appear in observed
requests, rather than by recollection of the former site's structure. A path
nobody asks for needs no redirect; a path that is asked for is a fact rather than
a guess. The set MAY grow as further paths are observed.

This governs path **selection** only. It does not make request counts a measure
of anything else — in particular not of how many people a given broken path
affects, which the requirement below addresses for a case where the two come
apart.

#### Scenario: A reported legacy page redirects

- **WHEN** a visitor requests a legacy path that has a current equivalent
- **THEN** the response SHALL be a permanent redirect to that equivalent, not a
  not-found

#### Scenario: The legacy hostname still preserves the path

- **WHEN** a request arrives at the former hostname carrying a legacy path
- **THEN** it SHALL be forwarded to the current site with the path intact, so the
  mapping above can apply

### Requirement: The legacy calendar feed redirects to the current feed

The former site's calendar feed path SHALL redirect to the feed the system serves
today, so that existing calendar subscriptions resume working without the
subscriber taking any action.

This is separated from ordinary page redirects because the consequence differs in
kind. A visitor who receives a not-found for a page sees it and can search for
what they wanted. A calendar client that receives a not-found for its subscribed
feed displays nothing at all — no error, no empty calendar, no indication that
the subscription it is still faithfully polling has been dead since the site
migrated. The failure is invisible to the person affected, and it persists
indefinitely because a subscription is configured once and then forgotten.

This path qualifies for mapping on the same basis as every other — it is among
the most frequently observed of the unmatched paths. What differs is how its
count should be interpreted once selected. Request volume here SHALL NOT be read
as a measure of how many people are affected: a subscribed client polls on a
schedule, so a large count can represent a small number of subscribers, each
continuously and silently receiving nothing. Selection is by presence; impact is
not inferable from frequency.

#### Scenario: A subscribed calendar client recovers

- **WHEN** a calendar client polls the former feed path
- **THEN** it SHALL be redirected to the current feed and SHALL receive calendar
  data

### Requirement: A sign-in request to the marketing site reaches the portal

A request for a sign-in path on the marketing site SHALL redirect to the member
portal.

This is not a legacy URL. It is people typing the hostname they associate with
the organization and expecting to log in there, which is a reasonable thing to
expect and currently produces a not-found. The intent is unambiguous, so serving
it is better than being technically correct about which hostname hosts the portal.

#### Scenario: A sign-in path reaches the portal

- **WHEN** a visitor requests the sign-in path on the marketing site
- **THEN** they SHALL be redirected to the portal's sign-in page

### Requirement: Unmatched paths continue to return not-found

A request for a path with no mapping SHALL return a not-found response. There
SHALL NOT be a catch-all redirect sending unmatched requests to the home page or
anywhere else.

The overwhelming majority of not-found requests this site receives are hostile
scanning — WordPress plugin probes, environment files under many names, version
control metadata, cloud credential paths. A catch-all would answer every one of
them with a redirect to a page that exists.

That is worse than the not-found responses it replaces, in three ways. It
manufactures soft-not-founds across a URL space that search engines will index.
It tells a scanner that every path it tries resolves, which is exactly the signal
a scanner is looking for. And it destroys the evidence this mapping was built
from: the next person examining these logs for genuinely broken inbound links
would find every probe redirected and nothing left to distinguish a real one.

A not-found is the correct answer to a request for something that does not exist,
and SHALL remain the answer.

#### Scenario: A scanner probe still gets a not-found

- **WHEN** a request arrives for a path with no mapping — a plugin probe, an
  environment file, a version control path
- **THEN** the response SHALL be a not-found, and SHALL NOT be a redirect

#### Scenario: An unmapped legacy-looking path is not redirected

- **WHEN** a path resembles a legacy URL but has no mapping
- **THEN** it SHALL return a not-found rather than being guessed at

