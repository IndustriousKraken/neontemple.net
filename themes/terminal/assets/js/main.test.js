/**
 * Regression tests for the image_url attribute-escaping fix in main.js.
 *
 * main.js is a browser script: it registers DOMContentLoaded / alpine:init
 * listeners and defines its rendering helpers as top-level functions. As in
 * calendar.test.js we load it in a vm sandbox with minimal `document` / `window`
 * stubs — no browser, no Alpine, no extra dependencies — and exercise the
 * rendering functions directly.
 *
 * Node has no DOM, so rather than parse the rendered fragment we assert the
 * structural property that defines neutralization: the attacker-controlled
 * `image_url` is encoded such that it cannot terminate the `src`/`href`
 * attribute or open a new tag. Concretely, a correct render of one image card
 * contains exactly one `<img` token (the legitimate thumbnail); a vulnerable
 * render would contain a second one from the injected `<img ... onerror=...>`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMain() {
  // escapeHtml() does `div.textContent = str; return div.innerHTML`. Emulate a
  // browser element whose innerHTML reflects the HTML-escaped text content
  // (browsers escape &, <, > there — but not quotes, which is exactly why the
  // attribute-safe escapeAttr exists).
  const createElement = () => {
    let html = '';
    return {
      set textContent(value) {
        html = String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      },
      get innerHTML() {
        return html;
      },
    };
  };

  const sandbox = {
    document: {
      addEventListener() {},
      createElement,
    },
    // main.js assigns window.contentStore at load and reads window.COTERIE_API_URL
    // inside getImageUrl; an empty object is enough for both.
    window: {},
    console,
  };

  const code = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'main.js' });
  return sandbox;
}

// The value between the first `src="` and the next `"`. Because escapeAttr
// encodes `"` to `&quot;`, the closing quote of a correctly-escaped attribute
// is the real attribute boundary.
function srcAttrValue(html) {
  const m = html.match(/src="([^"]*)"/);
  return m ? m[1] : null;
}

const BREAKOUT_URL = 'https://x"><img src=y onerror=window.__xss=1>';

test('image_url_with_attribute_breakout_is_neutralized', () => {
  const sandbox = loadMain();
  const html = sandbox.renderEventCard({
    id: 42,
    title: 'CTF Night',
    start_time: '2026-06-20T19:30:00Z',
    image_url: BREAKOUT_URL,
  });

  // Exactly one <img — the legitimate thumbnail. The payload's `<img` must have
  // been encoded to `&lt;img`, so no injected element is created.
  assert.equal(
    (html.match(/<img/g) || []).length,
    1,
    'attacker <img> tag must not survive as real markup'
  );

  // The whole payload survives only as entity-encoded, inert text — the quote
  // and angle brackets that would have terminated the src and opened a new tag
  // are encoded.
  assert.ok(html.includes('&lt;img src=y onerror=window.__xss=1&gt;'), 'payload is inert text');

  // The src attribute value carries no character that could break out.
  const src = srcAttrValue(html);
  assert.ok(src !== null, 'an <img src="..."> is present');
  assert.ok(!/[<>"]/.test(src), 'src value contains no raw <, >, or " to break out');

  // Nothing derived from the image_url executed.
  assert.equal(sandbox.window.__xss, undefined, 'no injected script executed');
});

test('image_url_normal_value_still_renders', () => {
  const sandbox = loadMain();
  const html = sandbox.renderEventCard({
    id: 7,
    title: 'Photo Night',
    start_time: '2026-06-20T19:30:00Z',
    image_url: 'https://example.com/a.jpg',
  });

  assert.ok(
    html.includes('src="https://example.com/a.jpg"'),
    'a plain URL passes through escapeAttr unchanged and renders as the src'
  );
  assert.equal(srcAttrValue(html), 'https://example.com/a.jpg');
});

test('escapeAttr encodes every attribute-significant character', () => {
  const sandbox = loadMain();
  assert.equal(sandbox.escapeAttr('& < > " \''), '&amp; &lt; &gt; &quot; &#39;');
  assert.equal(sandbox.escapeAttr(''), '');
  assert.equal(sandbox.escapeAttr(null), '');
  assert.equal(sandbox.escapeAttr(undefined), '');
});
