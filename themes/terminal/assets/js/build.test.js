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
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const TEMPLATE = path.join(__dirname, '..', '..', 'layouts', '_default', 'join.html');
const DEFAULT_BUILD = path.join(REPO_ROOT, 'public', 'join', 'index.html');
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
