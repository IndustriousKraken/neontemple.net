# Change: Legacy WordPress URLs redirect instead of 404

## Why

The guild's previous site ran on WordPress at `neontemple.net`. That hostname is
still served, and its Caddy block does the right thing:

```
neontemple.net, www.neontemple.net {
  redir https://theneontemple.com{uri} permanent
}
```

It preserves the path — which is correct, and is exactly why the problem exists.
Every indexed WordPress URL, every bookmark, and every saved link arrives at
`theneontemple.com` carrying a path this site has never had, and gets a 404.

Two were reported as issues (`IndustriousKraken/coterie#125`, `#124`). Both
still 404 today. But the access log shows the reported pair is a fraction of it.
Filtering the site log for 404s and discarding scanner probes leaves:

| Hits | Path |
|---|---|
| 191 | `/events/ics/` |
| 106 | `/register/remote-membership/` |
| 82 | `/login` |
| 76 / 50 / 40 | `/feed/`, `/feed/atom/`, `/rss/` |
| 63 | `/blog/` |
| 42 | `/join-the-guild-intermediary-page/` |
| 42 | `/guild/` |

**`/events/ics/` leading the list changes what this is.** A page 404 costs one
visitor one click. That path is a calendar feed, and 191 hits is not 191 people —
it is a handful of subscribed calendar clients polling on a schedule. Those are
members who added the guild calendar to their phone and have had a silently dead
subscription ever since the migration. Nothing tells them; a calendar client that
gets a 404 just shows nothing.

`/login` at 82 is a different shape again: those are not legacy URLs at all.
People are typing the marketing site's hostname and expecting the portal.

## What Changes

- Legacy paths redirect permanently to their current equivalents, in the
  repository-owned Caddy configuration where this site's routing now lives.
- The calendar feed redirects to Coterie's iCal endpoint, so existing
  subscriptions resume without the subscriber doing anything.
- `/login` redirects to the portal, since the intent is unambiguous and the
  alternative is a 404 for someone trying to sign in.
- The map is derived from observed traffic rather than from recollection of the
  old site. Paths nobody requests do not need redirects, and paths that are
  requested are known rather than guessed.

## No catch-all

An earlier instinct was to add a fallback sending anything unmatched to the home
page. The log argues against it. The overwhelming majority of 404s are hostile
scanning — `/wp-content/plugins/hellopress/wp_filemanager.php`, `/.env` in a
dozen variations, `/.git/config`, `/.aws/credentials`, `/secrets.json`. A
catch-all would answer every one of those with a 301 to a 200.

That is worse than the 404s it replaces. It manufactures soft-404s across a URL
space search engines will happily index, it tells a scanner that every path it
tries "exists", and it destroys the signal this change was built from — the next
person mining these logs for real broken links would find every probe redirected
and nothing distinguishable.

Unmatched paths SHALL keep returning 404. That is the correct answer to a request
for something that does not exist.

## What this does not do

- **It does not restore WordPress content.** These are redirects to current
  equivalents, not recreations. Where no equivalent exists, the nearest honest
  destination is used rather than inventing one.
- **It does not touch the `neontemple.net` block.** Preserving the path on that
  redirect is correct and is what makes a per-path map possible at all.
- **It does not add redirects for paths with no observed traffic**, however
  plausible they seem. The map is evidence, and it can grow when evidence does.
