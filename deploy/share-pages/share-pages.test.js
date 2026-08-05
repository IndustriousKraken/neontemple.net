/**
 * Tests for the share-page refresher and the on-request responder.
 *
 * These run against the REAL template — `public/_share/template/index.html`,
 * the committed Hugo build artifact — rather than a fixture, so a theme change
 * that breaks token substitution or the conditional regions fails here instead
 * of in a link preview. Each test gets its own temporary web root and manifest.
 *
 * The public API is stubbed by replacing `globalThis.fetch`; the stub answers
 * only the configured API origin so the responder tests can still speak HTTP to
 * their own loopback server.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const share = require('./share-pages.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const TEMPLATE_BUILD = path.join(REPO_ROOT, 'public', '_share', 'template', 'index.html');

const NOW = new Date('2026-08-04T12:00:00Z');
const IN_WINDOW = '2026-09-12T18:00:00Z';   // inside the polled range
const LONG_AGO = '2023-01-15T18:00:00Z';    // years before it

const PUBLIC_EVENT = {
  id: 'ev-42',
  title: 'Lockpicking 101',
  description: 'Bring your own practice locks.',
  location: 'The Vault',
  start_time: IN_WINDOW,
  timezone: 'America/New_York',
  visibility: 'Public',
  image_url: 'uploads/abc.jpg',
};

const SECOND_EVENT = { ...PUBLIC_EVENT, id: 'ev-43', title: 'CTF Night', image_url: null };

// /public/events sanitizes these before they leave Coterie: the title is a
// placeholder and the detail fields are nulled.
const MEMBERS_ONLY_EVENT = {
  id: 'ev-99',
  title: 'Members-Only Event',
  description: null,
  location: null,
  start_time: IN_WINDOW,
  visibility: 'MembersOnly',
  image_url: null,
};

const ANNOUNCEMENT = {
  id: 'an-7',
  title: 'Doors Open Late',
  content: 'We are opening at 8pm this week.',
  content_html: '<p>We are opening at <strong>8pm</strong> this week.</p>',
  published_at: '2026-08-01T15:00:00Z',
};

// --- harness -------------------------------------------------------------

function makeEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'share-pages-'));
  const root = path.join(dir, 'root');
  const template = path.join(root, '_share', 'template', 'index.html');
  fs.mkdirSync(path.dirname(template), { recursive: true });
  fs.copyFileSync(TEMPLATE_BUILD, template);
  return {
    dir,
    cfg: {
      api: 'https://api.example.test',
      site: 'https://site.example.test',
      root,
      manifest: path.join(dir, 'manifest.json'),
      port: 0,
    },
  };
}

/**
 * Stub the public API. `fail` forces one of the three failure modes reconcile
 * has to survive. Anything that is not the API origin falls through to the real
 * fetch, so a test can still make an HTTP request of its own.
 */
function stubApi(t, cfg, { events = [], announcements = [], fail = null } = {}) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const href = String(url);
    if (!href.startsWith(cfg.api)) return real(url, options);
    calls.push(href);
    if (fail === 'status') return { ok: false, status: 503, json: async () => ({}) };
    if (fail === 'unparseable') {
      return { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } };
    }
    if (fail === 'wrong-shape') {
      // Parses fine, is not a list. This is the one that slips through a
      // "did it parse?" check.
      return { ok: true, status: 200, json: async () => ({ events: [] }) };
    }
    const body = href.includes('/public/events') ? events : announcements;
    return { ok: true, status: 200, json: async () => body };
  };
  t.after(() => { globalThis.fetch = real; });
  return calls;
}

const pageFile = (cfg, kind, id) => path.join(cfg.root, kind, id, 'index.html');
const exists = (file) => fs.existsSync(file);
const read = (file) => fs.readFileSync(file, 'utf8');

/** A page already on disk, with the manifest entry the refresher would have. */
function seedPage(cfg, kind, id, date, body = '<html>seeded</html>') {
  const file = pageFile(cfg, kind, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  const manifest = share.loadManifest(cfg);
  manifest[`${kind}/${id}`] = date;
  share.saveManifest(cfg, manifest);
  return file;
}

/** The value of a `content` attribute for a given meta property/name. */
function metaContent(html, key) {
  const re = new RegExp(`<meta[^>]*(?:property|name)=["']?${key}["']?[^>]*>`, 'i');
  const tag = html.match(re);
  if (!tag) return null;
  const value = tag[0].match(/content=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return value ? (value[1] ?? value[2] ?? value[3]) : null;
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function get(port, requestPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: requestPath }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

async function withResponder(t, cfg) {
  const server = share.createResponder(cfg);
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return port;
}

// --- the refresher -------------------------------------------------------

test('a payload with two public events and one members-only event yields two pages', async (t) => {
  const { cfg } = makeEnv();
  stubApi(t, cfg, { events: [PUBLIC_EVENT, SECOND_EVENT, MEMBERS_ONLY_EVENT] });

  const { written } = await share.reconcile(cfg, NOW);

  assert.deepEqual(written.sort(), ['e/ev-42', 'e/ev-43']);
  assert.ok(exists(pageFile(cfg, 'e', 'ev-42')));
  assert.ok(exists(pageFile(cfg, 'e', 'ev-43')));
  assert.ok(!exists(pageFile(cfg, 'e', 'ev-99')), 'the members-only entry gets no page');

  // And they are advertised, or nothing links to them at all.
  const sitemap = read(share.sitemapPath(cfg));
  assert.match(sitemap, /<loc>https:\/\/site\.example\.test\/e\/ev-42\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/site\.example\.test\/e\/ev-43\/<\/loc>/);
});

test('an in-window page missing from the payload is removed; its sitemap entry with it', async (t) => {
  const { cfg } = makeEnv();
  stubApi(t, cfg, { events: [PUBLIC_EVENT] });
  seedPage(cfg, 'e', 'ev-gone', IN_WINDOW);

  const { removed } = await share.reconcile(cfg, NOW);

  assert.deepEqual(removed, ['e/ev-gone']);
  assert.ok(!exists(path.join(cfg.root, 'e', 'ev-gone')), 'the directory is gone, not just the file');
  assert.ok(!read(share.sitemapPath(cfg)).includes('ev-gone'), 'and it is dropped from the index');
  assert.equal(share.loadManifest(cfg)['e/ev-gone'], undefined);
});

test('a page whose item falls OUTSIDE the queried window is retained, not removed', async (t) => {
  // The regression that would silently delete every older page on the first
  // run: absence from a bounded query is not evidence of retraction.
  const { cfg } = makeEnv();
  stubApi(t, cfg, { events: [PUBLIC_EVENT] });
  const old = seedPage(cfg, 'e', 'ev-ancient', LONG_AGO);
  const before = read(old);

  const { removed } = await share.reconcile(cfg, NOW);

  assert.deepEqual(removed, [], 'nothing was retracted');
  assert.ok(exists(old), 'the out-of-window page survives');
  assert.equal(read(old), before, 'and is untouched');
  assert.equal(share.loadManifest(cfg)['e/ev-ancient'], LONG_AGO, 'it keeps its manifest entry');
});

test('a page older than the refresh window is kept, served, and not re-fetched', async (t) => {
  // Age governs polling only. Deleting for age is the regression this guards.
  const { cfg } = makeEnv();
  const calls = stubApi(t, cfg, { events: [] });
  const old = seedPage(cfg, 'e', 'ev-ancient', LONG_AGO);

  await share.reconcile(cfg, NOW);

  assert.ok(exists(old), 'still present after a run');
  const eventQuery = calls.find((url) => url.includes('/public/events'));
  const from = new URL(eventQuery).searchParams.get('from');
  assert.ok(Date.parse(from) > Date.parse(LONG_AGO), 'the query never asked about it');
  assert.ok(read(share.sitemapPath(cfg)).includes('ev-ancient'), 'it stays advertised');
});

test('a failed fetch changes nothing — non-2xx, unparseable, and wrong-shape alike', async (t) => {
  for (const fail of ['status', 'unparseable', 'wrong-shape']) {
    const { cfg } = makeEnv();
    stubApi(t, cfg, { events: [PUBLIC_EVENT], fail });
    const kept = seedPage(cfg, 'e', 'ev-existing', IN_WINDOW);
    const before = read(kept);
    const manifestBefore = read(cfg.manifest);

    await assert.rejects(share.reconcile(cfg, NOW), undefined, `${fail} must reject`);

    assert.equal(read(kept), before, `${fail}: existing page is byte-identical`);
    assert.ok(!exists(pageFile(cfg, 'e', 'ev-42')), `${fail}: nothing new was written`);
    assert.equal(read(cfg.manifest), manifestBefore, `${fail}: the manifest is untouched`);
  }
});

test('reconcile deletes nothing outside its own path prefixes', async (t) => {
  const { cfg } = makeEnv();
  stubApi(t, cfg, { events: [] });
  const bystander = path.join(cfg.root, 'yt-feed.xml');
  fs.writeFileSync(bystander, '<feed/>');
  fs.mkdirSync(path.join(cfg.root, 'calendar'), { recursive: true });
  fs.writeFileSync(path.join(cfg.root, 'calendar', 'index.html'), 'the calendar');

  // A manifest key that tries to climb out of the prefix removes nothing.
  const manifest = share.loadManifest(cfg);
  manifest['e/../../calendar'] = IN_WINDOW;
  manifest['e/..'] = IN_WINDOW;
  share.saveManifest(cfg, manifest);

  await share.reconcile(cfg, NOW);

  assert.ok(exists(bystander), 'an unrelated file in the web root survives');
  assert.ok(exists(path.join(cfg.root, 'calendar', 'index.html')), 'so does the built site');
});

// --- rendering -----------------------------------------------------------

test('a hostile title cannot break out of the metadata attribute or the body', async (t) => {
  const HOSTILE = 'Quote " angle <img src=x onerror=alert(1)> amp & end';
  const { cfg } = makeEnv();
  stubApi(t, cfg, { events: [{ ...PUBLIC_EVENT, title: HOSTILE, description: HOSTILE }] });

  await share.reconcile(cfg, NOW);
  const html = read(pageFile(cfg, 'e', 'ev-42'));

  // The payload's <img> must not have survived as markup. The template's own
  // hero image is the only <img> on a page for an item that has one.
  assert.equal((html.match(/<img/g) || []).length, 1, 'no injected element');
  assert.ok(!/<img[^>]*onerror/i.test(html), 'no live element carries the handler');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'it survives as inert text');

  // The attribute boundary held: reading og:title back stops at the real quote.
  assert.equal(
    metaContent(html, 'og:title'),
    'Quote &quot; angle &lt;img src=x onerror=alert(1)&gt; amp &amp; end | Neon Temple',
  );
});

test('an item with no image emits no item-specific og:image', async (t) => {
  const { cfg } = makeEnv();
  stubApi(t, cfg, { events: [PUBLIC_EVENT, SECOND_EVENT] });

  await share.reconcile(cfg, NOW);

  const withImage = read(pageFile(cfg, 'e', 'ev-42'));
  assert.equal(metaContent(withImage, 'og:image'), 'https://api.example.test/uploads/abc.jpg',
    'a relative image_url resolves against the API origin, not this site');
  assert.match(withImage, /<img[^>]*uploads\/abc\.jpg/, 'and the page shows it');

  const without = read(pageFile(cfg, 'e', 'ev-43'));
  assert.equal(metaContent(without, 'og:image'), share.defaultImage(cfg),
    'no item image means the site card, not a card-shaped hole');
  assert.ok(!without.includes('<img'), 'and no hero image on the page');
});

test('an announcement renders its sanitized content_html and a bounded plain-text description', async (t) => {
  const { cfg } = makeEnv();
  stubApi(t, cfg, { announcements: [ANNOUNCEMENT] });

  await share.reconcile(cfg, NOW);
  const html = read(pageFile(cfg, 'a', 'an-7'));

  assert.ok(html.includes('<strong>8pm</strong>'), 'content_html renders as markup in the body');
  assert.equal(
    metaContent(html, 'og:description'),
    'We are opening at 8pm this week.',
    'the description is plain text, never the HTML',
  );
  assert.equal(metaContent(html, 'og:url'), 'https://site.example.test/a/an-7/');
  assert.match(html, /All announcements/, 'and links onward to the announcements page');
  assert.ok(!/http-equiv=["']?refresh/i.test(html), 'the page is the destination, not a redirect');
});

test('the metadata description is stripped of markup and bounded on a word boundary', () => {
  assert.equal(share.plainText('<p>Hi <em>there</em> &amp; welcome</p>'), 'Hi there & welcome');
  const long = share.boundText(`${'word '.repeat(60)}tail`);
  assert.ok(long.length <= 201, 'bounded to what platforms render');
  assert.ok(long.endsWith('…'), 'and marked as truncated');
  assert.ok(!long.includes('wor…'), 'cut on a word boundary, not mid-word');
});

// --- on-request generation ----------------------------------------------

test('a public item with no page on disk is generated, returned, and then served statically', async (t) => {
  const { cfg } = makeEnv();
  const calls = stubApi(t, cfg, { events: [PUBLIC_EVENT] });
  const port = await withResponder(t, cfg);

  const first = await get(port, '/e/ev-42/');
  assert.equal(first.status, 200);
  assert.match(first.body, /Lockpicking 101/);
  assert.equal(first.headers['cache-control'], 'no-cache', 'revalidate, so a removal takes effect');
  assert.ok(first.headers.etag, 'and an ETag, so revalidation is cheap');
  assert.ok(exists(pageFile(cfg, 'e', 'ev-42')), 'the page is persisted');
  assert.ok(share.loadManifest(cfg)['e/ev-42'], 'and recorded, or reconcile could not reason about it');

  const apiCallsAfterFirst = calls.length;
  const second = await get(port, '/e/ev-42/');
  assert.equal(second.status, 200);
  assert.equal(second.body, first.body);
  assert.equal(calls.length, apiCallsAfterFirst, 'a second request does not regenerate it');
});

test('on-request and refresher output for the same item are byte-identical', async (t) => {
  const viaRequest = makeEnv().cfg;
  stubApi(t, viaRequest, { events: [PUBLIC_EVENT] });
  const port = await withResponder(t, viaRequest);
  const response = await get(port, '/e/ev-42/');

  const viaTimer = makeEnv().cfg;
  // Same origins, so only the code path differs.
  viaTimer.api = viaRequest.api;
  viaTimer.site = viaRequest.site;
  stubApi(t, viaTimer, { events: [PUBLIC_EVENT] });
  await share.reconcile(viaTimer, NOW);

  assert.equal(response.body, read(pageFile(viaTimer, 'e', 'ev-42')),
    'one template, one fill path — this is the assertion that keeps them from drifting');
});

test('an id that is not a public item returns not-found and leaves no file behind', async (t) => {
  const { cfg } = makeEnv();
  stubApi(t, cfg, { events: [PUBLIC_EVENT] });
  const port = await withResponder(t, cfg);

  const res = await get(port, '/e/ev-nope/');

  assert.equal(res.status, 404);
  // A stray placeholder is what would confuse the reconciler into treating a
  // never-generated page as one to remove.
  assert.ok(!exists(path.join(cfg.root, 'e', 'ev-nope')), 'no directory was created');
  assert.equal(share.loadManifest(cfg)['e/ev-nope'], undefined, 'and nothing was recorded');
});

test('a malformed id — traversal included — is rejected before any filesystem or API access', async (t) => {
  const { cfg } = makeEnv();
  const calls = stubApi(t, cfg, { events: [PUBLIC_EVENT] });
  const port = await withResponder(t, cfg);

  const hostile = [
    '/e/..%2f..%2fetc/',          // percent-encoded traversal
    '/e/%2e%2e/',                 // encoded dot-dot
    '/e/ev%2042/',                // whitespace, once decoded
    '/e/ev.42/',                  // a dot is not in the id alphabet
    '/e/%zz/',                    // malformed percent-encoding
    '/x/ev-42/',                  // not one of the two kinds
    '/e/ev-42/extra/',            // an extra path segment
    `/e/${'x'.repeat(65)}/`,      // longer than any real id
  ];
  for (const requestPath of hostile) {
    const res = await get(port, requestPath);
    assert.equal(res.status, 404, `${requestPath} is rejected`);
  }

  assert.deepEqual(calls, [], 'no outbound call was made for any of them');
  assert.deepEqual(fs.readdirSync(cfg.root).sort(), ['_share'], 'and nothing was created in the web root');
});

// --- retraction ----------------------------------------------------------

test('a retracted item loses its page and the on-request path will not resurrect it', async (t) => {
  const { cfg } = makeEnv();

  // Published: the page exists and is served.
  const live = stubApi(t, cfg, { events: [PUBLIC_EVENT] });
  await share.reconcile(cfg, NOW);
  assert.ok(exists(pageFile(cfg, 'e', 'ev-42')));
  assert.ok(read(share.sitemapPath(cfg)).includes('ev-42'));
  void live;

  // Retracted: the event flips to members-only, so it leaves the public feed
  // sanitized and is no longer selected.
  const calls = stubApi(t, cfg, { events: [{ ...MEMBERS_ONLY_EVENT, id: 'ev-42' }] });
  const { removed } = await share.reconcile(cfg, NOW);

  assert.deepEqual(removed, ['e/ev-42'], 'reconcile removed it');
  assert.ok(!exists(path.join(cfg.root, 'e', 'ev-42')), 'the page is gone');
  assert.ok(!read(share.sitemapPath(cfg)).includes('ev-42'), 'and so is its sitemap entry');

  // A removal the on-request path immediately undoes is not a removal.
  const port = await withResponder(t, cfg);
  calls.length = 0;
  const res = await get(port, '/e/ev-42/');
  assert.equal(res.status, 404, 'a request after removal is not-found');
  assert.ok(!exists(path.join(cfg.root, 'e', 'ev-42')), 'and writes nothing');
});

test('a share URL carries no version token, so it survives its item being edited', async (t) => {
  const { cfg } = makeEnv();
  stubApi(t, cfg, { events: [PUBLIC_EVENT] });
  await share.reconcile(cfg, NOW);
  const before = metaContent(read(pageFile(cfg, 'e', 'ev-42')), 'og:url');

  stubApi(t, cfg, { events: [{ ...PUBLIC_EVENT, title: 'Lockpicking 201', description: 'Rewritten.' }] });
  await share.reconcile(cfg, NOW);
  const after = read(pageFile(cfg, 'e', 'ev-42'));

  assert.match(after, /Lockpicking 201/, 'the content was updated');
  assert.equal(metaContent(after, 'og:url'), before, 'at the same address');
  assert.equal(before, 'https://site.example.test/e/ev-42/');
});

// --- id handling ---------------------------------------------------------

test('validId accepts real ids and rejects anything that could reach a path', () => {
  for (const ok of ['ev-42', 'a7', '9f6b2c1e-0000-4aaa-bbbb-ccccdddd0000'.replace(/-/g, ''), 'A_b-1']) {
    assert.ok(share.validId(ok), `${ok} is a well-formed id`);
  }
  for (const bad of ['', '..', '../x', 'a/b', 'a b', 'a.b', '-lead', 'x'.repeat(65), null, undefined]) {
    assert.ok(!share.validId(bad), `${String(bad)} is rejected`);
  }
});

test('an API item with an unusable id is skipped rather than written', async (t) => {
  const { cfg } = makeEnv();
  stubApi(t, cfg, { events: [{ ...PUBLIC_EVENT, id: '../../escape' }, SECOND_EVENT] });

  const { written } = await share.reconcile(cfg, NOW);

  assert.deepEqual(written, ['e/ev-43'], 'only the well-formed id produced a page');
  assert.ok(!exists(path.join(cfg.dir ?? cfg.root, 'escape')), 'nothing escaped the web root');
});
