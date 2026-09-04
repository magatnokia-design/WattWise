# Sessions, cookies and privacy on the web client

Why `wattwise.site` has no cookie banner, no "remember me" checkbox, and no
tracking — and why that is a design position rather than an omission.

Written 4 Sep 2026, verified against the deployed site rather than from memory.

---

## The short version

**WattWise sets no cookies at all.** Not one, first-party or third-party. There
is no analytics, no advertising, no embedded third-party script. The session is
held by the Firebase Auth SDK in browser storage, not in a cookie, and it is
scoped to the one origin that serves the app.

Most of the questions in this area therefore have the same answer: the feature
is absent because the thing it manages does not exist here.

---

## Verified, not assumed

```
$ curl -sI https://www.wattwise.site
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=63072000
```

No `Set-Cookie`, on any route. In the source: no `document.cookie`, no cookie
library, and the only `<script>` in `index.html` is the application's own
module. Nothing else runs on the page.

---

## Why there is no cookie consent banner

Consent rules — the EU's ePrivacy directive, and the Philippines' Data Privacy
Act of 2012 — attach to storing or reading information on a user's device for
purposes **beyond what the user actually asked for**. Analytics, advertising,
cross-site profiling.

WattWise stores exactly one thing: the session that keeps you signed in, which
is the strictly necessary case every one of those regimes exempts. There is no
second purpose to disclose, and no third party receiving anything.

**A consent banner here would be theatre.** It would ask permission for
tracking that does not happen, and train users to dismiss a dialog that means
nothing — which is worse than not asking.

---

## Why the session is not in a cookie

Firebase Auth's web SDK is configured with `browserLocalPersistence`
(`src/services/firebase/config.js`), which keeps the session in **IndexedDB**.
The phone app uses `getReactNativePersistence(AsyncStorage)` — the same idea in
the platform's own storage. This is the one deliberate difference between the
two `config.js` files.

That is not a workaround; it is the better position for this application:

| | Cookie | IndexedDB, as built |
|---|---|---|
| Sent on every request | yes, automatically | **never sent automatically** |
| Reachable by another origin | possible if misconfigured | no — same-origin only |
| Vulnerable to CSRF | yes, that is the mechanism | **not applicable** |
| Needs `SameSite`, `Secure`, `HttpOnly` tuning | yes | nothing to tune |

**Cross-site request forgery works by the browser attaching a cookie to a
request the user did not intend.** No cookie is attached to anything here, so
the class of attack has nothing to act on. On a site whose buttons switch mains
electricity, that is worth more than the convenience a cookie would add.

What the client sends instead is a short-lived Firebase **ID token**, attached
deliberately by the SDK to calls it makes. It expires in an hour and is
refreshed in the background.

---

## Why there is no "remember me" checkbox

Because the behaviour it toggles is already the behaviour, and the alternative
is worse for this application.

The session persists across refreshes and browser restarts until the user signs
out. A "remember me" box would offer to make it *less* persistent — and a user
who unticks it, closes the tab and loses their session has not gained security,
they have lost their outlet controls while the hardware keeps running.

The honest version of that control is **Sign out**, which is present, explicit,
and does exactly what it says.

### The real risk this leaves, stated plainly

**A signed-in session on a shared or stolen computer stays signed in.** That is
true, and it is the trade accepted here. Two things bound it:

- Sign out is one click from every page.
- Firestore rules scope every document to its owner (`isOwner(userId)`), so a
  session reaches exactly one account's data and nothing else.

For a capstone deployment with a handful of known users on personal devices,
that is the right balance. A product with shared kiosks would choose
differently, and should.

---

## What protects the account instead

Session length is not the security boundary here. These are:

1. **Firestore rules, per document.** Every path is gated on
   `isOwner(userId)`. Billing records go further — `allow write: if false` —
   so no client can alter what it was charged, only Cloud Functions can.
2. **The hardware endpoints do not trust the client at all.** The ESP32 posts
   through `updateOutletMetrics`, which checks a per-device token and the
   freshness of the timestamp before writing.
3. **Email verification** before an account is usable.
4. **HTTPS enforced.** HTTP is 308-redirected and HSTS is set for two years, so
   a browser that has seen the site once will not try plaintext again.
5. **Response headers** (`vercel.json`): `X-Frame-Options: DENY` and
   `frame-ancestors 'none'` so the app cannot be embedded and overlaid;
   `nosniff`; a referrer policy that sends the origin and never the path; and a
   `Permissions-Policy` denying camera, microphone and location, none of which
   the app requests.

### The one thing deliberately not done yet

**A full Content-Security-Policy.** `frame-ancestors` is set, which is the half
carrying real risk. A complete CSP has to enumerate every Firebase endpoint the
SDK talks to, and getting it wrong breaks authentication *silently* rather than
loudly. That is not a thing to discover during a defence week.

It is the correct next hardening step, and it wants a test deploy and a full
sign-in pass behind it rather than a confident guess.

---

## Questions a panel may ask

**"Why no cookie consent banner?"**
Because nothing is stored that requires consent. No cookies, no analytics, no
third parties. The session is strictly necessary storage, which every consent
regime exempts.

**"Isn't localStorage/IndexedDB less secure than an HttpOnly cookie?"**
Against cross-site scripting, an `HttpOnly` cookie is genuinely stronger — script
cannot read it. Against CSRF, browser storage is stronger, because nothing is
attached automatically. The exposure was weighed both ways: the app loads no
third-party script at all, which is the main way XSS arrives, while a cookie
would have to be correctly configured for `SameSite`, `Secure` and `HttpOnly`
on every path forever. Fewer moving parts, and the framing header closes the
overlay route.

**"What happens if someone leaves themselves signed in?"**
They stay signed in, and they reach one account's data — Firestore rules see to
that. Sign out is one click. For shared machines a session timeout would be the
answer, and that is a change of deployment context, not a bug.

**"Do you collect any personal data?"**
Email address, for sign-in and to send the monthly statement. Energy readings
from the user's own two outlets. Nothing is shared with a third party, and
nothing leaves the project except the statement the user is emailed.

**"How does the user delete their data?"**
Settings → Delete Account, marked permanent. It runs server-side through the
`deleteAccount` callable rather than as a client write.
