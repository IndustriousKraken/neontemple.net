# Tasks

The backend already enforces and reports the bound. Everything here is what the
visitor is told beforehand — advisory only, and it must not alter their input.

## 1. Join form

- [x] 1.1 `themes/terminal/layouts/_default/join.html`: add a visible hint to the
  password field stating both bounds — minimum 10 characters, maximum 128 bytes.
  Word it for a reader; do not print "128 bytes" as though it were a character
  count, since the two differ for any non-ASCII password.
- [x] 1.2 Extend the existing comment above the field (it currently explains only
  `minlength`) to cover the maximum AND to state that `maxlength` is deliberately
  absent because it silently clips pasted input on a masked field. Without that
  note the omission looks like an oversight and gets "fixed".
- [x] 1.3 Keep `minlength="10"`. Both attributes count UTF-16 code units rather
  than the backend's bytes, so both are approximate — but `minlength` blocks
  submission visibly and leaves the value untouched, while `maxlength` mutates it
  silently. Precision is not the deciding factor; destructiveness is.
- [x] 1.4 Do NOT add `maxlength`.

## 2. Optional client feedback

- [x] 2.1 If adding a live warning in `themes/terminal/assets/js/main.js`, measure
  UTF-8 byte length (`new TextEncoder().encode(value).length`) so it agrees with
  the backend. `value.length` is the wrong unit and would disagree on exactly the
  passwords this exists to help.
- [x] 2.2 The warning SHALL NOT modify, clip, or block the field, and SHALL NOT
  prevent submission. The backend's rejection message stays authoritative.

## 3. Verify

- [x] 3.1 `hugo --gc --minify` builds clean.
- [x] 3.2 The hint renders on the join page and reads sensibly at mobile width —
  it sits next to a masked field, so it must not wrap into noise.
- [x] 3.3 Pasting a 200-character password leaves all 200 characters in the field.
  This is the regression that matters: it fails the moment someone adds
  `maxlength`.
- [x] 3.4 `openspec validate join-form-password-bounds --strict` passes.
