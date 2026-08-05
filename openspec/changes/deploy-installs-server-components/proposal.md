# Change: One command deploys the site and everything it needs on the host

## Why

This site is no longer just static files. It has two server-side components —
`deploy/yt-feed-cache/` and `deploy/share-pages/` — and each arrived with a README
of manual steps: copy a script to `/usr/local/bin`, copy units to
`/etc/systemd/system`, `daemon-reload`, `enable --now`, paste a block into
`/etc/caddy/Caddyfile`, validate, reload. Neither is installed by deploying.

That has already failed twice, in the same way both times. `share-pages` was
implemented, merged, and deployed — the template was live, the OG tags were
live, `deploy.sh` had its excludes — and `/e/<id>/` returned a 404 for every
event, because nothing on the host had been installed. The code was correct and
absent at the same time, and nothing reported the gap. The identical thing
happened to Coterie's backup timer, which shipped in a release and never ran on a
host provisioned before it existed.

The host carries the evidence: `/etc/caddy/` holds four `Caddyfile.bak-*` files,
one per past manual edit. Each was a hand-applied change that lives only on that
machine and in a README nobody re-reads.

Two costs follow. Standing up a fresh host now means replaying an
ever-growing checklist correctly and in order, and every component added later
adds another step to it. And an installed host silently drifts: a script updated
in the repo stays stale on the machine until someone remembers to re-copy it,
with nothing anywhere reporting the mismatch.

## What Changes

- **`deploy.sh` becomes the single command.** It builds, syncs the site, and
  brings every server-side component on the host into line with the repo —
  scripts, units, enablement, and the site's Caddy configuration. Running it on
  a fresh host installs; running it on a current host changes nothing. Deploying
  and installing stop being different operations.

- **Components are uniform, so adding one requires no installer change.** Each
  lives in `deploy/<name>/` and declares what it needs — files to place, units
  to enable, prerequisites to check — in a way the installer reads. The failure
  this prevents is the one that already happened: a component added without the
  step that installs it.

- **The site's Caddy configuration is owned by the repo**, shipped as a file the
  deploy places and Caddy imports, rather than a block pasted into a hand-edited
  `Caddyfile`. Configuration is validated before any reload, and a validation
  failure leaves the running configuration untouched. The one-time bootstrap is
  adding the import line — after which Caddy changes ride the deploy like
  everything else.

- **Prerequisites that cannot be installed automatically are reported, not
  skipped.** `share-pages` needs Node; a host without it must be told exactly
  what to run, and the deploy must not report success as though the component
  were working. This is the "you have to do this one thing too" case, and it is
  the only case that survives.

- **A check mode reports drift without changing anything**, so the state of a
  host is answerable without a deploy and without reading four READMEs.

## What this does not do

- **It does not manage Coterie.** Coterie has its own release and update path.
  This is the marketing site and its own server-side pieces.
- **It does not take over the whole Caddyfile.** Only this site's configuration
  is repo-owned; other blocks on the host are left alone.
- **It does not install language runtimes or system packages.** Those are
  reported. A deploy script that installs packages behind the operator's back is
  a worse failure mode than one that tells them what is missing.
- **It does not replace the components' READMEs**, which explain what each thing
  is and why. What it removes is the need to follow their install steps by hand.
