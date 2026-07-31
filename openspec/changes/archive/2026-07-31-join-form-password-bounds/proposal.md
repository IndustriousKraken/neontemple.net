# join-form-password-bounds

## Why

The join form tells a visitor the minimum password length and nothing about the
maximum. Coterie rejects anything over **128 bytes** — a real anti-DoS control,
since Argon2's pre-hash cost scales with input length — but a visitor only
discovers the ceiling by tripping it after submitting.

That is not hypothetical. In July 2026 a security tester tried a 200-character
password, could not tell what had happened, and the incident took a round of
investigation to explain. The form said `minlength="10"` and stayed silent about
the other end.

The backend side is fixed: Coterie now reports the limit in bytes with the
submitted size, and logs the rejection so an operator can answer the question too.
This change closes the remaining half — telling the visitor **before** they
submit.

### Why the limit is stated in bytes, and why there is no `maxlength`

Coterie measures the ceiling in UTF-8 **bytes**, not characters, because bytes are
what Argon2 consumes. For an ASCII password the two agree; for anything else they
do not. Sixty emoji is 240 bytes.

`maxlength` is the obvious-looking way to express this and is the wrong tool —
though not for the reason it first appears. Neither `minlength` nor `maxlength`
can express the backend's rule exactly: both count UTF-16 code units while the
backend measures UTF-8 bytes at *both* ends. The imprecision is shared, so it
cannot be what rules one out and not the other.

What rules out `maxlength` is that it **fails destructively and invisibly**. A
browser clips pasted input to `maxlength` with no notification. Someone pasting a
200-character password from a password manager gets 128 characters stored,
believes they set the longer one, and cannot log in afterwards — on a masked
field, where nothing reveals the loss. That is the same silent-truncation failure
Coterie explicitly forbids on the server, reintroduced in the browser.

`minlength` fails the other way: it blocks submission with a visible browser
message and never alters what was typed. A loud, non-destructive approximation is
fine here; a silent, destructive one is not.

So the ceiling is communicated, never enforced, on the client.

## What Changes

- The password field gains a **visible hint** stating both bounds, phrased for a
  human rather than quoting the byte limit as though it were a character count.
- The existing comment tying `minlength` to the backend's minimum is extended to
  cover the maximum and to record why no `maxlength` is present — otherwise a
  future contributor "fixes" the omission and reintroduces the truncation bug.
- Optional non-destructive feedback: warn when the entered value exceeds the
  ceiling, measured in UTF-8 bytes so client and server agree. It must never
  alter, clip, or block the input.

## Impact

- **Spec:** MODIFIED `signup-form` — the requirement that currently pins
  `minlength` to the backend minimum gains the maximum, the no-`maxlength` rule,
  and the reason.
- **Code:** `themes/terminal/layouts/_default/join.html` (hint + comment), and
  optionally `themes/terminal/assets/js/main.js` for the byte-length warning.
- **No backend dependency.** Coterie already enforces and reports the bound; this
  is purely what the visitor is told beforehand.
- **Not a security control.** The server check is the enforcement and is unchanged.
  This only removes a surprise.

## Note on where this came from

This work was originally written as a trailing task inside a **Coterie** change
(`a46-password-length-feedback`), pointing at this repository. That was the wrong
home: this repo has its own specs, and a task in another repo's checklist is one
no agent will execute and no human will find. The Coterie-side entry has been
removed; this change is the correct home for it.
