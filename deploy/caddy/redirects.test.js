/**
 * Tests for the legacy-URL redirects in theneontemple.com.caddy.
 *
 * These run the REAL configuration file through a REAL caddy on loopback, not a
 * fixture and not a regex over the text. A redirect map is exactly the kind of
 * thing that reads correct and behaves otherwise — directive order, matcher
 * specificity and trailing slashes all decide the answer — so the assertions are
 * about response codes and Location headers off a live server.
 *
 * The file is edited only where it names the outside world:
 *
 *   - the site address becomes http://127.0.0.1:<port> (no TLS in a test),
 *   - /srv/theneontemple.com becomes a temporary web root holding a small
 *     stand-in for the Hugo build,
 *   - https://coterie.theneontemple.com becomes a stub origin serving iCal and
 *     RSS, so a redirect chain can be FOLLOWED to its end rather than merely
 *     issued (see the /events/ics/ tests — the bug being fixed is invisible to
 *     the subscriber, so "a 301 was returned" is not evidence of anything),
 *   - the access log goes to the temp dir.
 *
 * Everything under test — every matcher, every destination path, every status
 * code — is the shipped text. `API` below stands in for the Coterie origin, and
 * `real config points at the origin the site itself uses` pins the real value.
 *
 * The neontemple.net block is NOT in this repository: it lives in the host's
 * shared /etc/caddy/Caddyfile and is deliberately untouched. It is modelled here
 * (LEGACY_BLOCK) because how these requests actually arrive is via that
 * path-preserving hop, and a map that only works when you start on the new
 * hostname would fix nothing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CONFIG = path.join(__dirname, 'theneontemple.com.caddy');
const REAL_API = 'https://coterie.theneontemple.com';

const ICAL = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:ev-42\r\nSUMMARY:Weekly meeting\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const RSS = '<?xml version="1.0"?><rss version="2.0"><channel><title>Neon Temple</title></channel></rss>';

/** The stand-in Hugo build: path -> body. */
const WEBROOT_FILES = {
  'index.html': '<h1>Neon Temple</h1>',
  'calendar/index.html': '<h1>Calendar</h1>',
  'announcements/index.html': '<h1>Announcements</h1>',
  'join/index.html': '<h1>Join</h1>',
  'about/index.html': '<h1>About</h1>',
  'swag/index.html': '<h1>Swag</h1>',
  'yt-feed.xml': '<feed/>',
  'e/ev-42/index.html': '<h1>Weekly meeting</h1>',
  '404.html': '<h1>404</h1>',
};

/** A port nobody is on, released before caddy is told to take it. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Coterie, as far as these tests are concerned: the two feeds and the portal. */
function startAPI(t) {
  const server = http.createServer((req, res) => {
    const routes = {
      '/public/feed/calendar': ['text/calendar; charset=utf-8', ICAL],
      '/public/feed/rss': ['application/rss+xml; charset=utf-8', RSS],
      '/login': ['text/html; charset=utf-8', '<h1>Sign in</h1>'],
    };
    const hit = routes[req.url];
    if (!hit) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': hit[0] }).end(hit[1]);
  });
  t.after(() => server.close());
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

/**
 * The real config, pointed at loopback, running under a real caddy.
 * Returns { site, legacy, api } origins.
 */
async function startCaddy(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caddy-redirects-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const webroot = path.join(tmp, 'srv');
  for (const [file, body] of Object.entries(WEBROOT_FILES)) {
    const target = path.join(webroot, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  }

  const api = await startAPI(t);
  const sitePort = await freePort();
  const legacyPort = await freePort();

  const config = [
    // admin off keeps two runs of this file from fighting over :2019; the site
    // addresses are http:// so no certificate machinery runs at all.
    '{\n\tadmin off\n\tauto_https off\n}\n',
    fs
      .readFileSync(CONFIG, 'utf8')
      .replace('theneontemple.com, www.theneontemple.com {', `http://127.0.0.1:${sitePort} {`)
      .replaceAll('/srv/theneontemple.com', webroot)
      .replaceAll(REAL_API, api)
      .replaceAll('/var/log/caddy/site-access.log', path.join(tmp, 'access.log')),
    // The host's neontemple.net block, modelled: path-preserving, permanent.
    `\nhttp://127.0.0.1:${legacyPort} {\n\tredir http://127.0.0.1:${sitePort}{uri} permanent\n}\n`,
  ].join('');

  const file = path.join(tmp, 'Caddyfile');
  fs.writeFileSync(file, config);

  const proc = spawn('caddy', ['run', '--config', file, '--adapter', 'caddyfile'], {
    env: { ...process.env, HOME: tmp, XDG_DATA_HOME: tmp, XDG_CONFIG_HOME: tmp },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  proc.stderr.on('data', (d) => (stderr += d));
  t.after(() => proc.kill());

  const site = `http://127.0.0.1:${sitePort}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (proc.exitCode !== null) assert.fail(`caddy exited: ${stderr}`);
    try {
      await fetch(`${site}/`, { redirect: 'manual' });
      return { site, legacy: `http://127.0.0.1:${legacyPort}`, api };
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  assert.fail(`caddy never came up: ${stderr}`);
}

/** One hop. No following — the hop itself is what most of these assert. */
const hop = (url) => fetch(url, { redirect: 'manual' });

/**
 * Every mapped path, its destination, and why that destination. Chosen by what
 * the legacy page was FOR: /guild/ was the about page whatever it was called,
 * and both join routes were the join page.
 */
const MAP = [
  ['/events/', '/calendar/'],
  ['/register/remote-membership/', '/join/'],
  ['/join-the-guild-intermediary-page/', '/join/'],
  ['/guild/', '/about/'],
  ['/blog/', '/announcements/'],
  ['/events/ics/', 'API:/public/feed/calendar'],
  ['/feed/', 'API:/public/feed/rss'],
  ['/feed/atom/', 'API:/public/feed/rss'],
  ['/rss/', 'API:/public/feed/rss'],
  ['/login', 'API:/login'],
];

test('every mapped legacy path returns 301 to its intended destination', async (t) => {
  const { site, api } = await startCaddy(t);

  for (const [from, to] of MAP) {
    const expected = to.startsWith('API:') ? api + to.slice(4) : to;
    const res = await hop(site + from);
    assert.equal(res.status, 301, `${from} should be a permanent redirect`);
    assert.equal(res.headers.get('location'), expected, `${from} destination`);
  }
});

test('every destination exists — no redirect points at a second 404', async (t) => {
  const { site } = await startCaddy(t);

  // Followed, not looked up: a destination read back out of MAP would still
  // pass when the config sends the path somewhere else entirely.
  for (const [from] of MAP) {
    const res = await fetch(site + from);
    assert.equal(res.status, 200, `${from} must land somewhere that exists, got ${res.url}`);
  }
});

test('a subscribed calendar client following /events/ics/ receives calendar data', async (t) => {
  const { site } = await startCaddy(t);

  // What a calendar client does: fetch the stored URL, follow what it is given.
  const res = await fetch(`${site}/events/ics/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/calendar/);
  assert.match(await res.text(), /^BEGIN:VCALENDAR/);
});

test('the legacy feed redirect drops the query WordPress clients may still send', async (t) => {
  const { site, api } = await startCaddy(t);

  // Deliberate, and commented in the config: Coterie's feed takes no
  // parameters, so a leftover tribe-bar-date= would be ignored on arrival.
  const res = await hop(`${site}/events/ics/?tribe-bar-date=2019-01-01&ical=1`);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), `${api}/public/feed/calendar`);
});

test('a request from the legacy hostname completes the whole chain', async (t) => {
  const { legacy, site, api } = await startCaddy(t);

  // How these requests actually arrive: neontemple.net keeps the path, this
  // site maps it. Two hops, and the client is told to make both.
  const first = await hop(`${legacy}/events/`);
  assert.equal(first.status, 301);
  assert.equal(first.headers.get('location'), `${site}/events/`);

  const page = await fetch(`${legacy}/events/`);
  assert.equal(page.status, 200);
  assert.equal(page.url, `${site}/calendar/`);
  assert.match(await page.text(), /Calendar/);

  const feed = await fetch(`${legacy}/events/ics/`);
  assert.equal(feed.status, 200);
  assert.equal(feed.url, `${api}/public/feed/calendar`);
  assert.match(await feed.text(), /^BEGIN:VCALENDAR/);
});

test('an unmapped path still returns 404 — there is no catch-all', async (t) => {
  const { site } = await startCaddy(t);

  const unmapped = [
    // The bulk of this site's 404 traffic, and the reason for no catch-all.
    '/wp-content/plugins/hellopress/wp_filemanager.php',
    '/.env',
    '/config/.env',
    '/.git/config',
    '/.aws/credentials',
    '/secrets.json',
    // Legacy-LOOKING, but nobody asks for these. Not guessed at.
    '/events/2019/03/',
    '/blog/some-old-post/',
    '/wp-login.php',
  ];

  for (const url of unmapped) {
    const res = await hop(site + url);
    assert.equal(res.status, 404, `${url} must not be redirected`);
    assert.equal(res.headers.get('location'), null, `${url} must not carry a Location`);
  }
});

test('the redirects shadow no real route', async (t) => {
  const { site } = await startCaddy(t);

  const routes = ['/', '/calendar/', '/announcements/', '/join/', '/about/', '/yt-feed', '/e/ev-42/'];
  for (const url of routes) {
    const res = await hop(site + url);
    assert.equal(res.status, 200, `${url} must still be served`);
  }
});

test('/events/ics/ is not swallowed by /events/', async (t) => {
  const { site, api } = await startCaddy(t);

  // The two matchers are exact paths, so specificity ordering cannot bite —
  // this is the assertion that says so if either ever grows a wildcard.
  const res = await hop(`${site}/events/ics/`);
  assert.equal(res.headers.get('location'), `${api}/public/feed/calendar`);
});

test('the real config points at the origin the site itself uses', () => {
  const config = fs.readFileSync(CONFIG, 'utf8');
  const hugo = fs.readFileSync(path.join(__dirname, '..', '..', 'hugo.toml'), 'utf8');
  const coterieAPI = hugo.match(/coterieAPI\s*=\s*'([^']+)'/)[1];

  // The Caddy file cannot read Hugo's params, so the origin is written twice.
  // If one moves without the other, the feeds redirect into nothing.
  assert.equal(coterieAPI, REAL_API);
  for (const url of ['/public/feed/calendar', '/public/feed/rss', '/login']) {
    assert.ok(config.includes(REAL_API + url), `config should redirect to ${REAL_API}${url}`);
  }
});
