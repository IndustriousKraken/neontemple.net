/**
 * Build-time verification for the opt-in Turnstile widget on the join page.
 *
 * The join template gates the Turnstile <script> and the `cf-turnstile` widget
 * on a non-empty `turnstileSiteKey` param, so the page renders the widget IFF a
 * key is configured. Two things prove that without a network round-trip:
 *
 *   - Negative case (unconfigured): the committed default build
 *     `public/join/index.html` — produced with the default empty key — must
 *     contain no Turnstile script or widget. That is a real build artifact.
 *   - Positive case (configured): when `hugo` is on PATH we build the site with
 *     a test site key and assert the script + `cf-turnstile` element carry it.
 *     Where hugo is absent (e.g. the CI executor sandbox) that case is skipped;
 *     the template guard is still asserted structurally below.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const TEMPLATE = path.join(__dirname, '..', '..', 'layouts', '_default', 'join.html');
const DEFAULT_BUILD = path.join(REPO_ROOT, 'public', 'join', 'index.html');
const HEAD_PARTIAL = path.join(__dirname, '..', '..', 'layouts', '_partials', 'head.html');
const SITE_DESCRIPTION = 'A cybersecurity guild in Tampa Bay. Not a cult!';

/**
 * The `content` of a meta tag, by `property` or `name`. The minifier drops
 * attribute quotes where it can — `name=twitter:card` sits next to
 * `property="og:title"` in the same document — so both forms are matched.
 */
function metaContent(html, key) {
  const tag = html.match(new RegExp(`<meta[^>]*(?:property|name)=["']?${key}["']?[\\s>][^>]*>`, 'i'));
  if (!tag) return null;
  const value = tag[0].match(/content=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return value ? (value[1] ?? value[2] ?? value[3]) : null;
}
const SCRIPT_HOST = 'challenges.cloudflare.com';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const TEST_KEY = '1x00000000000000000000AA'; // Cloudflare always-passes test key

const hasHugo = spawnSync('hugo', ['version'], { stdio: 'ignore' }).status === 0;

test('join template gates the Turnstile script and widget on turnstileSiteKey', () => {
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  assert.ok(tpl.includes('{{ with .Site.Params.turnstileSiteKey }}'), 'script/widget are guarded by turnstileSiteKey');
  assert.ok(tpl.includes(SCRIPT_SRC), 'template references the Turnstile script');
  assert.ok(tpl.includes('class="cf-turnstile" data-sitekey="{{ . }}"'), 'widget carries the configured site key');
});

// hugo.toml now carries a real site key, so the committed build legitimately
// contains the widget — the negative case builds with the key blanked instead
// of reading that artifact.
test('build with an empty turnstileSiteKey renders no widget or script', {
  skip: hasHugo ? false : 'hugo not installed in this environment',
}, () => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-no-turnstile-'));
  const res = spawnSync('hugo', ['--destination', dest], {
    cwd: REPO_ROOT,
    env: { ...process.env, HUGO_PARAMS_TURNSTILESITEKEY: '' },
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, `hugo build failed: ${res.stderr || res.stdout}`);
  const html = fs.readFileSync(path.join(dest, 'join', 'index.html'), 'utf8');
  assert.ok(!html.includes('cf-turnstile'), 'no cf-turnstile element when no key is configured');
  assert.ok(!html.includes(SCRIPT_HOST), 'no Turnstile script when no key is configured');
});

// The password field must announce both bounds and must never carry a
// maxlength: the browser clips pasted input to it silently, and on a masked
// field the visitor cannot see what was lost. This is the regression guard —
// it fails the moment someone "fixes" the missing attribute.
test('password field states both bounds and carries no maxlength', () => {
  // The minifier drops attribute quotes, so match both `id="password"` and
  // `id=password` — the template and the built page are checked with one regex.
  for (const [label, file] of [['template', TEMPLATE], ['default build', DEFAULT_BUILD]]) {
    const html = fs.readFileSync(file, 'utf8');
    const field = html.match(/<input[^>]*\bid="?password"?[\s>][^>]*>/);
    assert.ok(field, `${label}: password field is present`);
    assert.ok(!/maxlength/i.test(field[0]), `${label}: no maxlength truncates a pasted password`);
    assert.match(field[0], /minlength="?10"?/, `${label}: minlength still matches the backend minimum`);
    assert.match(html, /id="?password-hint"?[\s>]/, `${label}: the hint element is rendered`);
    assert.match(html, /10 characters minimum, 128 bytes maximum/, `${label}: the hint states both bounds`);
  }
});

test('build with turnstileSiteKey set renders the widget, script, and key', {
  skip: hasHugo ? false : 'hugo not installed in this environment',
}, () => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'hugo-turnstile-'));
  // Hugo params are case-insensitive, so HUGO_PARAMS_TURNSTILESITEKEY overrides
  // .Site.Params.turnstileSiteKey without editing hugo.toml.
  const res = spawnSync('hugo', ['--destination', dest], {
    cwd: REPO_ROOT,
    env: { ...process.env, HUGO_PARAMS_TURNSTILESITEKEY: TEST_KEY },
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, `hugo build failed: ${res.stderr || res.stdout}`);
  const html = fs.readFileSync(path.join(dest, 'join', 'index.html'), 'utf8');
  assert.ok(html.includes(SCRIPT_SRC), 'built page loads the Turnstile script');
  assert.ok(html.includes('cf-turnstile'), 'built page renders the cf-turnstile widget');
  assert.ok(html.includes(TEST_KEY), 'widget carries the configured site key');
});

/**
 * Open Graph / Twitter card metadata.
 *
 * The site emitted none of this, so every link ever shared from it previewed
 * from whatever a platform could infer — the page title and the site-wide
 * description. These assertions read the committed build artifacts, which is
 * what a crawler would actually receive.
 */

test('every built page carries Open Graph and Twitter tags with its own values', () => {
  const calendar = fs.readFileSync(path.join(REPO_ROOT, 'public', 'calendar', 'index.html'), 'utf8');
  const about = fs.readFileSync(path.join(REPO_ROOT, 'public', 'about', 'index.html'), 'utf8');

  for (const key of ['og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'og:image',
    'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    assert.ok(metaContent(calendar, key), `${key} is emitted`);
  }

  assert.equal(metaContent(calendar, 'og:title'), 'Calendar | Neon Temple');
  assert.equal(metaContent(calendar, 'og:site_name'), 'Neon Temple');
  assert.equal(metaContent(calendar, 'og:type'), 'website');
  assert.equal(metaContent(calendar, 'twitter:card'), 'summary_large_image');
  assert.equal(metaContent(calendar, 'twitter:title'), metaContent(calendar, 'og:title'));

  // Per-page, not per-site: a cached block would give every page the first
  // page's preview, which is the defect being fixed rather than a smaller one.
  assert.notEqual(metaContent(about, 'og:title'), metaContent(calendar, 'og:title'));
  assert.notEqual(metaContent(about, 'og:url'), metaContent(calendar, 'og:url'));
});

test('a page with no front-matter description falls back to the site description', () => {
  // No content file defines its own description, so the committed build is the
  // fallback case; the share template is the override case (its front matter
  // carries the token the refresher substitutes).
  const calendar = fs.readFileSync(path.join(REPO_ROOT, 'public', 'calendar', 'index.html'), 'utf8');
  assert.equal(metaContent(calendar, 'og:description'), SITE_DESCRIPTION);
  assert.equal(metaContent(calendar, 'twitter:description'), SITE_DESCRIPTION);

  const share = fs.readFileSync(path.join(REPO_ROOT, 'public', '_share', 'template', 'index.html'), 'utf8');
  assert.equal(metaContent(share, 'og:description'), '%%DESCRIPTION%%',
    'a page that describes itself overrides the site description');
});

test('og:url and og:image are absolute', () => {
  // relativeURLs = true rewrites in-page hrefs, and a crawler resolves neither
  // of these against the page it fetched — so this is checked, not assumed.
  for (const page of ['calendar', 'about', 'join']) {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'public', page, 'index.html'), 'utf8');
    assert.match(metaContent(html, 'og:url'), /^https:\/\/theneontemple\.com\//, `${page}: og:url`);
    assert.match(metaContent(html, 'og:image'), /^https:\/\/theneontemple\.com\//, `${page}: og:image`);
    assert.equal(metaContent(html, 'twitter:image'), metaContent(html, 'og:image'));
  }

  // And the default card is a real file, not a 404 — a card with no image is a
  // thin grey strip on most platforms.
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'public', 'img', 'share-card.png')));
});

test('the metadata partial is not cached and marks nothing safe', () => {
  const partial = fs.readFileSync(HEAD_PARTIAL, 'utf8');
  assert.match(partial, /og:title/, 'the OG block lives in the head partial');
  // The call, not the word — the partial's own comment explains why it is absent.
  assert.ok(!/\{\{-?\s*partialCached/.test(partial), 'per-page values must not be cached');
  assert.ok(!/\|\s*safe/.test(partial), 'titles and descriptions are free text, never marked safe');
});

test('the share template is built where the refresher looks for it, with depth-independent URLs', () => {
  const built = path.join(REPO_ROOT, 'public', '_share', 'template', 'index.html');
  assert.ok(fs.existsSync(built), 'the Hugo build emits the fill template');
  const html = fs.readFileSync(built, 'utf8');

  for (const token of ['%%TITLE%%', '%%DESCRIPTION%%', '%%CANONICAL_URL%%', '%%IMAGE_URL%%',
    '%%EVENT_DATE%%', '%%EVENT_TIME%%', '%%EVENT_LOCATION%%', '%%EVENT_DESCRIPTION%%',
    '%%PUBLISHED%%', '%%ANNOUNCEMENT_HTML%%']) {
    assert.ok(html.includes(token), `${token} survives the build`);
  }
  for (const region of ['image', 'event', 'location', 'announcement']) {
    assert.match(html, new RegExp(`<share-${region}>[\\s\\S]*</share-${region}>`), `${region} region survives minification`);
  }

  // The chrome's URLs are root-relative, so a filled copy resolves them the
  // same wherever it is written. They used to be page-relative (`../../css/…`),
  // which worked only because /_share/template/ happened to sit at the same
  // depth as /e/<id>/ — a coincidence nothing enforced.
  assert.match(html, /href=\/css\/style\./, 'stylesheet does not depend on the page depth');
  assert.match(html, /href=\/calendar\//, 'and neither does the link onward');
  assert.ok(!/(?:href|src)=["']?\.\.?\//.test(html), 'no page-relative URL survives in the template');

  // It is a template, not a page: nothing should index it.
  const sitemap = fs.readFileSync(path.join(REPO_ROOT, 'public', 'sitemap.xml'), 'utf8');
  assert.ok(!sitemap.includes('_share'), 'the template is not in the site sitemap');
  const robots = fs.readFileSync(path.join(REPO_ROOT, 'public', 'robots.txt'), 'utf8');
  assert.match(robots, /Disallow: \/_share\//);
  assert.match(robots, /Sitemap: https:\/\/theneontemple\.com\/share-sitemap\.xml/,
    'the generated pages are advertised, or a crawler never reaches one');
});

/**
 * The 404 page is served for EVERY missing path, at every depth — Caddy's
 * `handle_errors` block rewrites any not-found request to /404.html. Assets
 * linked relative to the requested URL therefore 404 too, and the themed page
 * arrives unstyled. This serves the committed build under that same rule and
 * fetches what the page asks for, from the URL a visitor would have requested.
 */

const PUBLIC = path.join(REPO_ROOT, 'public');

/** The site's own assets a page loads — stylesheets and local scripts. */
function assetUrls(html) {
  return [...html.matchAll(/(?:href|src)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
    .map((m) => m[1] ?? m[2] ?? m[3])
    .filter((url) => /\.(css|js)$/.test(url) && !/^https?:\/\//i.test(url));
}

/** public/ served the way the deploy serves it: any miss returns 404.html. */
function serveLikeCaddy() {
  return http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.join(PUBLIC, pathname);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const found = file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile();
    res.writeHead(found ? 200 : 404);
    res.end(fs.readFileSync(found ? file : path.join(PUBLIC, '404.html')));
  });
}

test('a 404 served at any depth loads the assets it links', async (t) => {
  const server = serveLikeCaddy();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  for (const missing of ['/definitely-not-a-page/', '/a/deep/missing/path/']) {
    const res = await fetch(origin + missing);
    assert.equal(res.status, 404, `${missing} is a 404`);
    const assets = assetUrls(await res.text());
    assert.ok(assets.length >= 2, `${missing}: the themed page links its stylesheet and scripts`);
    for (const asset of assets) {
      // Resolved against the URL the browser asked for, not against /404.html.
      const resolved = new URL(asset, origin + missing);
      assert.equal((await fetch(resolved)).status, 200, `${missing}: ${asset} loads`);
    }
  }
});
