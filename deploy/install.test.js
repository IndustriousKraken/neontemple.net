/**
 * Tests for the component installer.
 *
 * Each test gets a simulated host: a temporary directory used as `/` via
 * `--root`, and a PATH whose `systemctl` and `caddy` are stubs that record
 * every call and keep enabled/active state in files. That state is what makes
 * "run it twice and the second run does nothing" a real assertion rather than a
 * re-read of the same disk — the point of the whole change is that a deploy
 * reports the truth about the host, so the tests check what it did to the host,
 * not only what it printed.
 *
 * The component declarations under test are the REAL ones, copied per test so a
 * test can add or break a component without a fixture that can drift from what
 * ships.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEPLOY = __dirname;

/** systemctl, recording every call and remembering what it enabled/started. */
const SYSTEMCTL_STUB = `#!/bin/sh
printf '%s\\n' "$*" >> "$STUB_LOG"
cmd=$1; shift
unit=
for a in "$@"; do case "$a" in -*) ;; *) unit=$a ;; esac; done
mkdir -p "$STUB_STATE/enabled" "$STUB_STATE/active"
case "$cmd" in
  is-enabled) [ -e "$STUB_STATE/enabled/$unit" ] ;;
  is-active) [ -e "$STUB_STATE/active/$unit" ] ;;
  enable)
    : > "$STUB_STATE/enabled/$unit"
    case " $* " in *" --now "*) : > "$STUB_STATE/active/$unit" ;; esac ;;
  start|restart) : > "$STUB_STATE/active/$unit" ;;
  *) : ;;
esac
`;

/** caddy, failing validation on demand so an invalid config can be tested. */
const CADDY_STUB = `#!/bin/sh
printf 'caddy %s\\n' "$*" >> "$STUB_LOG"
if [ -n "\${STUB_CADDY_FAIL:-}" ]; then
  echo "adapting config: Caddyfile:12 - unrecognized directive" >&2
  exit 1
fi
`;

const NODE_STUB = `#!/bin/sh
echo v20.11.0
`;

const IMPORT_LINE = 'import sites/*.caddy\n';

function write(file, contents, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, mode ? { mode } : undefined);
}

/**
 * A simulated host. `node` is on its PATH unless `node: false`, and its
 * Caddyfile carries the import line unless `bootstrapped: false`.
 */
function makeHost(t, { node = true, bootstrapped = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const host = {
    root: path.join(tmp, 'root'),
    src: path.join(tmp, 'src'),
    bin: path.join(tmp, 'bin'),
    state: path.join(tmp, 'state'),
    log: path.join(tmp, 'systemctl.log'),
    caddyFail: false,
  };
  fs.mkdirSync(host.root, { recursive: true });
  fs.mkdirSync(host.state, { recursive: true });
  fs.cpSync(DEPLOY, host.src, { recursive: true });
  fs.writeFileSync(host.log, '');

  write(path.join(host.bin, 'systemctl'), SYSTEMCTL_STUB, 0o755);
  write(path.join(host.bin, 'caddy'), CADDY_STUB, 0o755);
  if (node) write(path.join(host.bin, 'node'), NODE_STUB, 0o755);

  if (bootstrapped) {
    write(path.join(host.root, 'etc/caddy/Caddyfile'), `# other sites live here\n${IMPORT_LINE}`);
  } else {
    write(path.join(host.root, 'etc/caddy/Caddyfile'), '# other sites live here\n');
  }
  return host;
}

/** Run the installer against `host`. Clears the call log first. */
function install(host, args = []) {
  fs.writeFileSync(host.log, '');
  const result = spawnSync('sh', [path.join(host.src, 'install.sh'), '--root', host.root, ...args], {
    encoding: 'utf8',
    env: {
      PATH: `${host.bin}:/usr/bin:/bin`,
      HOME: host.root,
      STUB_LOG: host.log,
      STUB_STATE: host.state,
      ...(host.caddyFail ? { STUB_CADDY_FAIL: '1' } : {}),
    },
  });
  result.calls = fs.readFileSync(host.log, 'utf8').split('\n').filter(Boolean);
  return result;
}

const at = (host, p) => path.join(host.root, p);
const exists = (host, p) => fs.existsSync(at(host, p));

/** Every file under `dir`, relative and sorted — for "changed nothing" checks. */
function tree(dir) {
  const out = [];
  const walk = (d, prefix) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else out.push(`${rel}\t${fs.readFileSync(full, 'utf8')}`);
    }
  };
  walk(dir, '');
  return out.join('\n');
}

// -------------------------------------------------------------- fresh host --

test('a fresh host gets every component installed, enabled, and reported', (t) => {
  const host = makeHost(t);
  const run = install(host);

  assert.equal(run.status, 0, run.stderr);
  for (const name of ['caddy', 'share-pages', 'yt-feed-cache']) {
    assert.match(run.stdout, new RegExp(`^\\[installed\\] ${name}\\b`, 'm'), run.stdout);
  }

  // The files each README used to tell an operator to place by hand.
  assert.ok(exists(host, 'usr/local/bin/yt-feed-refresh.sh'));
  assert.ok(exists(host, 'usr/local/bin/share-pages.js'));
  assert.ok(exists(host, 'etc/systemd/system/yt-feed-cache.timer'));
  assert.ok(exists(host, 'etc/systemd/system/share-pages-responder.service'));
  assert.ok(exists(host, 'etc/caddy/sites/theneontemple.com.caddy'));
  assert.equal(fs.statSync(at(host, 'usr/local/bin/share-pages.js')).mode & 0o777, 0o755);
  assert.equal(fs.statSync(at(host, 'etc/systemd/system/share-pages.timer')).mode & 0o777, 0o644);

  assert.ok(run.calls.includes('daemon-reload'));
  assert.ok(run.calls.includes('enable --now yt-feed-cache.timer'));
  assert.ok(run.calls.includes('enable --now share-pages.timer'));
  assert.ok(run.calls.includes('enable --now share-pages-responder.service'));
  assert.ok(run.calls.includes('reload caddy'));
});

// ------------------------------------------------------------ current host --

test('a current host is left alone: nothing changed, nothing restarted', (t) => {
  const host = makeHost(t);
  assert.equal(install(host).status, 0);
  const after = tree(host.root);

  const run = install(host);
  assert.equal(run.status, 0, run.stderr);
  for (const name of ['caddy', 'share-pages', 'yt-feed-cache']) {
    assert.match(run.stdout, new RegExp(`^\\[unchanged\\] ${name}$`, 'm'), run.stdout);
  }
  assert.equal(tree(host.root), after, 'no file on the host changed');

  // A deploy that churns units on every run trains an operator to ignore it.
  assert.deepEqual(run.calls.filter((c) => !c.startsWith('is-enabled ') && !c.startsWith('is-active ')), [],
    'nothing was reloaded, enabled, started, or restarted');
});

test('a changed script is replaced and its unit restarted; an unchanged one is not', (t) => {
  const host = makeHost(t);
  assert.equal(install(host).status, 0);

  fs.appendFileSync(path.join(host.src, 'share-pages/share-pages.js'), '\n// edited\n');
  const run = install(host);

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^\[updated\] share-pages\b/m, run.stdout);
  assert.match(run.stdout, /^\[unchanged\] yt-feed-cache$/m, run.stdout);
  assert.match(fs.readFileSync(at(host, 'usr/local/bin/share-pages.js'), 'utf8'), /\/\/ edited/);

  assert.ok(run.calls.includes('restart share-pages-responder.service'));
  assert.ok(run.calls.includes('start share-pages.service'));
  assert.ok(!run.calls.includes('start yt-feed-cache.service'), 'the untouched component is not started');
  // Only a changed UNIT file justifies a daemon-reload; this was a script.
  assert.ok(!run.calls.includes('daemon-reload'));
});

test('a changed unit file triggers a daemon-reload', (t) => {
  const host = makeHost(t);
  assert.equal(install(host).status, 0);

  fs.appendFileSync(path.join(host.src, 'yt-feed-cache/yt-feed-cache.timer'), '\n# edited\n');
  const run = install(host);

  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.calls.includes('daemon-reload'));
});

// --------------------------------------------------- declarations are king --

test('a component directory with no declaration fails the deploy and is named', (t) => {
  const host = makeHost(t);
  fs.mkdirSync(path.join(host.src, 'orphan'));
  fs.writeFileSync(path.join(host.src, 'orphan/thing.sh'), '#!/bin/sh\n');

  const run = install(host);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /\[failed\] orphan\b/);
  assert.match(run.stderr, /component\.conf/);
});

test('a new component installs with no edit to the installer', (t) => {
  const host = makeHost(t);
  const dir = path.join(host.src, 'new-thing');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'new-thing.sh'), '#!/bin/sh\necho hello\n');
  fs.writeFileSync(path.join(dir, 'new-thing.service'), '[Service]\nExecStart=/usr/local/bin/new-thing.sh\n');
  fs.writeFileSync(path.join(dir, 'component.conf'), [
    'file new-thing.sh /usr/local/bin/new-thing.sh 0755',
    'unit new-thing.service',
    'enable new-thing.service',
    '',
  ].join('\n'));

  const run = install(host);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^\[installed\] new-thing\b/m, run.stdout);
  assert.ok(exists(host, 'usr/local/bin/new-thing.sh'));
  assert.ok(run.calls.includes('enable --now new-thing.service'));

  // The regression guard for the whole change. The component above installed
  // against the installer exactly as it ships, and the installer knows the name
  // of no component at all — which is what makes that true of the next one too.
  const installer = fs.readFileSync(path.join(DEPLOY, 'install.sh'), 'utf8');
  assert.equal(installer, fs.readFileSync(path.join(host.src, 'install.sh'), 'utf8'));
  for (const entry of fs.readdirSync(DEPLOY, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    assert.ok(!installer.includes(entry.name), `install.sh names the component ${entry.name}`);
  }
});

test('a declaration verb the installer does not implement fails the component', (t) => {
  const host = makeHost(t);
  fs.appendFileSync(path.join(host.src, 'yt-feed-cache/component.conf'), '\nsymlink a b\n');

  const run = install(host);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /\[failed\] yt-feed-cache: unknown declaration verb\(s\): symlink/);
});

test('a trailing token on a declaration line fails the component and is named', (t) => {
  const host = makeHost(t);
  const conf = path.join(host.src, 'yt-feed-cache/component.conf');
  const declaration = 'file yt-feed-refresh.sh /usr/local/bin/yt-feed-refresh.sh 0755';
  fs.writeFileSync(conf, fs.readFileSync(conf, 'utf8')
    .replace(declaration, `${declaration} # prime the cache`));

  const run = install(host);
  assert.notEqual(run.status, 0);
  // The failure names the declaration that is wrong. Absorbed into the mode it
  // would instead surface as `install -m "0755 # prime the cache"`, an error
  // about the wrong thing entirely.
  assert.match(run.stderr, /\[failed\] yt-feed-cache: malformed declaration: `file yt-feed-refresh\.sh`/);
  assert.doesNotMatch(run.stderr, /install -m/);
  assert.ok(!exists(host, 'usr/local/bin/yt-feed-refresh.sh'), 'and nothing was placed');
});

test('a unit line with a trailing token is named too', (t) => {
  const host = makeHost(t);
  const conf = path.join(host.src, 'yt-feed-cache/component.conf');
  fs.writeFileSync(conf, fs.readFileSync(conf, 'utf8')
    .replace('unit yt-feed-cache.timer', 'unit yt-feed-cache.timer # every 30 minutes'));

  const run = install(host);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /malformed declaration: `unit yt-feed-cache\.timer` expects exactly one argument/);
});

// ------------------------------------------------------------ prerequisites --

test('an unmet prerequisite names the component, the missing thing, and the fix', (t) => {
  const host = makeHost(t, { node: false });

  const run = install(host);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /\[failed\] share-pages: requires node, which is not installed\. Run: apt install nodejs/);
  assert.doesNotMatch(run.stdout, /share-pages/, 'never reported as installed');
  assert.ok(!exists(host, 'usr/local/bin/share-pages.js'), 'and never half-installed');
  assert.ok(!exists(host, 'etc/systemd/system/share-pages.timer'));

  // Resolving it and re-running completes the job.
  write(path.join(host.bin, 'node'), NODE_STUB, 0o755);
  const second = install(host);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /^\[installed\] share-pages\b/m, second.stdout);
  assert.ok(exists(host, 'usr/local/bin/share-pages.js'));
});

test('a prerequisite that is present but too old is reported as too old', (t) => {
  const host = makeHost(t);
  write(path.join(host.bin, 'node'), '#!/bin/sh\necho v16.20.2\n', 0o755);

  const run = install(host);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /share-pages: requires node >= 18, found v16\.20\.2\. Run: apt install nodejs/);
  assert.ok(!exists(host, 'usr/local/bin/share-pages.js'));
});

// ------------------------------------------------------------------- caddy --

test('an invalid configuration fails the deploy and leaves the running one untouched', (t) => {
  const host = makeHost(t);
  assert.equal(install(host).status, 0);
  const live = at(host, 'etc/caddy/sites/theneontemple.com.caddy');
  const running = fs.readFileSync(live, 'utf8');

  fs.appendFileSync(path.join(host.src, 'caddy/theneontemple.com.caddy'), '\nnonsense_directive\n');
  host.caddyFail = true;
  const run = install(host);

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /\[failed\] caddy: configuration is invalid, nothing was changed/);
  assert.equal(fs.readFileSync(live, 'utf8'), running, 'the running configuration is byte-identical');
  assert.ok(!run.calls.includes('reload caddy'), 'and was never reloaded');
});

test('a host that has not been bootstrapped is told so, not reported as successful', (t) => {
  const host = makeHost(t, { bootstrapped: false });

  const run = install(host);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /\[failed\] caddy: .*Caddyfile is not bootstrapped .* import sites\/\*\.caddy/);
  assert.ok(!exists(host, 'etc/caddy/sites/theneontemple.com.caddy'),
    'no file is placed where nothing would read it');
  assert.doesNotMatch(run.stdout, /^\[installed\] caddy/m);
});

test('the deploy never writes the shared Caddyfile other sites live in', (t) => {
  const host = makeHost(t);
  const shared = at(host, 'etc/caddy/Caddyfile');
  const before = fs.readFileSync(shared, 'utf8');

  assert.equal(install(host).status, 0);
  assert.equal(fs.readFileSync(shared, 'utf8'), before);
});

test('the Caddy configuration this repository ships is valid', () => {
  const probe = spawnSync('caddy', ['version'], { encoding: 'utf8' });
  if (probe.error) return; // caddy is not installed here; the deploy validates on the host

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caddy-adapt-'));
  try {
    fs.mkdirSync(path.join(tmp, 'sites'));
    fs.copyFileSync(path.join(DEPLOY, 'caddy/theneontemple.com.caddy'), path.join(tmp, 'sites/site.caddy'));
    fs.writeFileSync(path.join(tmp, 'Caddyfile'), IMPORT_LINE);
    // `adapt`, not `validate`: this checks the syntax and the directives, without
    // needing the host's log directory to exist.
    const run = spawnSync('caddy', ['adapt', '--config', path.join(tmp, 'Caddyfile')], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    for (const handler of ['/yt-feed.xml', '127.0.0.1:8787', '/404.html', '/srv/theneontemple.com']) {
      assert.ok(run.stdout.includes(handler), `${handler} survived adaptation`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------- check mode --

test('check mode reports missing, stale, and current, and changes nothing', (t) => {
  const host = makeHost(t);

  const before = tree(host.root);
  const missing = install(host, ['--check']);
  assert.equal(missing.status, 0, missing.stderr);
  for (const name of ['caddy', 'share-pages', 'yt-feed-cache']) {
    assert.match(missing.stdout, new RegExp(`^\\[missing\\] ${name}$`, 'm'), missing.stdout);
  }
  assert.equal(tree(host.root), before, 'no file was placed');
  assert.deepEqual(missing.calls, [], 'no unit was enabled and no server reloaded');

  assert.equal(install(host).status, 0);
  const current = install(host, ['--check']);
  assert.equal(current.status, 0, current.stderr);
  for (const name of ['caddy', 'share-pages', 'yt-feed-cache']) {
    assert.match(current.stdout, new RegExp(`^\\[current\\] ${name}$`, 'm'), current.stdout);
  }

  fs.appendFileSync(path.join(host.src, 'share-pages/share-pages.js'), '\n// edited\n');
  const installed = tree(host.root);
  const stale = install(host, ['--check']);
  assert.equal(stale.status, 0, stale.stderr);
  assert.match(stale.stdout, /^\[stale\] share-pages \(1 of 4 file\(s\) differ\)$/m, stale.stdout);
  assert.match(stale.stdout, /^\[current\] yt-feed-cache$/m);
  assert.equal(tree(host.root), installed, 'a stale host is reported, not fixed');
  assert.deepEqual(stale.calls, []);
});

test('check mode reports an unmet prerequisite without touching the host', (t) => {
  const host = makeHost(t, { node: false });

  const before = tree(host.root);
  const run = install(host, ['--check']);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /share-pages: requires node, which is not installed/);
  assert.equal(tree(host.root), before);
  assert.deepEqual(run.calls, []);
});
