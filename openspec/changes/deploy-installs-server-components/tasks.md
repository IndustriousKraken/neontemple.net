# Tasks

## 1. Component declarations

- [ ] 1.1 Give each `deploy/<name>/` directory a declaration the installer reads:
  files to place (source → destination → mode), units to enable, and
  prerequisites to check. Keep it a plain data file, not a script — a per-component
  script is how per-component logic creeps back into the installer.
- [ ] 1.2 Write declarations for the two existing components, `yt-feed-cache` and
  `share-pages`, transcribed from their READMEs. `share-pages` declares three
  units (timer, oneshot, responder), one script at `/usr/local/bin`, and a Node
  prerequisite; `yt-feed-cache` declares one script and two units.
- [ ] 1.3 The installer iterates directories and acts on declarations. It must
  contain no name of any specific component — that is what makes task 1.4 true.
- [ ] 1.4 A component directory without a readable declaration fails the deploy
  and is named. Skipping it silently would recreate the exact defect this change
  exists to remove.

## 2. Deploy

- [ ] 2.1 Extend `deploy.sh` to sync and reconcile components after the site
  rsync. Keep the existing `--delete` excludes exactly as they are; generated
  paths are still generated.
- [ ] 2.2 Idempotent by comparison, not by blind copy: compare content before
  replacing, so an unchanged host reports "nothing changed" rather than churning
  files and restarting units on every deploy.
- [ ] 2.3 Restart or reload a unit only when its file actually changed, and
  `daemon-reload` only when some unit file changed.
- [ ] 2.4 Report per component: installed, updated, enabled, or unchanged. A
  silent success tells an operator nothing about whether what they merged is now
  running.
- [ ] 2.5 Exit non-zero if any component could not be brought into its declared
  state. Do not continue past a failure and print a success line at the end.
- [ ] 2.6 Do not leave a component half-installed on failure — a later run must be
  able to complete it.

## 3. Caddy configuration

- [ ] 3.1 Move this site's Caddy block into a repo file under `deploy/caddy/`,
  covering what the live block now contains: the `/yt-feed` handler, the
  `@share` handler with its loopback fall-through, the static handler,
  `handle_errors`, HSTS, and logging.
- [ ] 3.2 The deploy places it at an included path and reloads. Do NOT edit the
  main `Caddyfile` from the deploy — other sites live in it, and a script that
  rewrites a shared file is how the four `Caddyfile.bak-*` files on the host came
  to exist.
- [ ] 3.3 One-time bootstrap: an import line in the main `Caddyfile`. Document it
  in exactly one place, and have the deploy detect its absence and say so —
  otherwise the deploy places a file nothing reads and reports success.
- [ ] 3.4 `caddy validate` before any reload. On failure, leave the running
  configuration untouched and fail the deploy. Reloading an invalid config takes
  the site down, which is worse than not deploying.
- [ ] 3.5 Never touch configuration belonging to other sites on the host.

## 4. Prerequisites

- [ ] 4.1 Check declared prerequisites before installing a component. Node ≥ 18
  for `share-pages` is the current case.
- [ ] 4.2 On an unmet prerequisite: name the component, name what is missing,
  print the command that installs it, exit non-zero. Do not install packages or
  runtimes automatically — changing a host's installed software unasked is worse
  than stopping.
- [ ] 4.3 A component with an unmet prerequisite is never reported as installed.

## 5. Check mode

- [ ] 5.1 A flag that reports installed / stale / missing per component and any
  unmet prerequisites, and changes nothing.
- [ ] 5.2 Assert it is read-only — no file placed, no unit enabled, no reload.
  This is the mode someone runs when they are unsure, so it has to be safe to run
  when unsure.

## 6. Documentation

- [ ] 6.1 Rewrite the install sections of `deploy/yt-feed-cache/README.md` and
  `deploy/share-pages/README.md` to describe what the deploy does, not steps to
  follow by hand. Keep everything explaining what each component is and why —
  that is the part worth reading. Two sets of install instructions that can
  disagree is the failure mode being removed.
- [ ] 6.2 Document the one-time Caddy import bootstrap in exactly one place.
- [ ] 6.3 Record in the top-level docs that `deploy.sh` is the whole procedure for
  a fresh host, and that check mode answers "is the host current".

## 7. Tests

- [ ] 7.1 Against a simulated fresh host: every component installed and enabled,
  each reported.
- [ ] 7.2 Against a current host: nothing changed, reported as unchanged, no unit
  restarted. Assert the absence of restarts — a deploy that churns units every
  run trains operators to ignore its output.
- [ ] 7.3 A changed script is replaced and its unit restarted; an unchanged one is
  not.
- [ ] 7.4 A component directory with no declaration fails the deploy and is named.
- [ ] 7.5 A new component directory installs with no installer edit. This is the
  regression guard for the whole change.
- [ ] 7.6 An unmet prerequisite fails with the component name, the missing thing,
  and the resolving command; the component is not reported installed; a re-run
  after resolving it completes.
- [ ] 7.7 An invalid Caddy configuration fails the deploy and leaves the running
  configuration untouched.
- [ ] 7.8 A host without the import line is reported as not bootstrapped rather
  than succeeding.
- [ ] 7.9 Check mode reports missing, stale, and current states correctly and
  modifies nothing.
