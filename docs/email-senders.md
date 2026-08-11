# Email — senders, delivery, and templates

How WattWise sends mail, and how it got here. Two independent pipelines, both
now going through **Brevo SMTP** with `wattwise.site` authenticated.

## The two pipelines

| | Sends | Configured at |
|---|---|---|
| **Firebase Auth** | password reset, email verification, email change | Console → Authentication → Templates (+ SMTP settings) |
| **`firestore-send-email` extension** | invoices, receipts, budget/safety/device alerts | `extensions/firestore-send-email.env` + `functions/.env` |

They share nothing but the SMTP provider. A change to one does not affect the
other - which is why the reset email kept coming from `firebaseapp.com` long
after `DEFAULT_FROM` was set.

## Current configuration

**Brevo SMTP** (free tier: 300 emails/day)

| Field | Value |
|---|---|
| Host | `smtp-relay.brevo.com` |
| Port | `587` (STARTTLS - so `smtp://`, never `smtps://`) |
| Username | `aa20d1001@smtp-brevo.com` (Brevo's generated login, not an account email) |
| Password | SMTP key, in Secret Manager as `ext-firestore-send-email-SMTP_PASSWORD` |
| Security | TLS |

⚠️ **The SMTP key expires 10 August 2027.** Mail stops that day with no warning.

**Domain:** `wattwise.site`, authenticated in Brevo by DKIM + DMARC. Because the
domain is authenticated, *any* address on it can send - no per-address
verification. Verified sender: `support@wattwise.site`.

**DNS at Namecheap.** Root MX still points at `eforward1-5.registrar-servers.com`
for Namecheap's free forwarding, which delivers `support@wattwise.site` to Gmail.
Brevo needed no MX record, which is the reason it was chosen - see below.

### Sender routing

`functions/src/lib/mailQueue.js` picks the sender from the `tag` each caller
already passes:

| Tag | From |
|---|---|
| `invoice`, `budget`, `receipt` | `MAIL_SENDER` |
| `device`, `safety` | `MAIL_SENDER_SUPPORT` |

Both currently point at `support@wattwise.site` - the only sender verified in
Brevo. To split them, add `wattwise@wattwise.site` as a sender there (instant,
the domain is already authenticated) and update `MAIL_SENDER` in `functions/.env`.

## Why Brevo and not Gmail or Resend

**Gmail SMTP** only sends as the authenticated account or a verified "Send mail
as" alias, and Google removed "Send through Gmail" for external addresses on
personal accounts. Verifying `support@wattwise.site` therefore required outbound
SMTP for the domain, which Namecheap's free forwarding does not provide.
Circular. `mailQueue.js:10` records the earlier attempt that broke delivery.

**Resend** verified the domain on DKIM alone but refused to enable sending
without an `MX` record on `send.wattwise.site`. Namecheap hides the MX record
type while MAIL SETTINGS is *Email Forwarding*, and switching to *Custom MX* to
add it risks the forwarding that delivers `support@` to Gmail.

**Brevo** authenticates with TXT records only - no MX - so the forwarding setup
was never touched.

## The email template

`buildEmailHtml()` and `buildEmailText()` in `functions/src/lib/mailQueue.js`
render every app email. Callers pass `heading`, `intro`, and `[label, value]`
rows; the shell is shared.

- Table-based layout with **inline styles only** - Outlook renders through Word's
  HTML engine and ignores `<style>` blocks and classes.
- Header accent is keyed on the tag: green normally, **amber** for `device`,
  **red** for `safety`.
- A **plain-text part is sent alongside** the HTML. Multipart scores better with
  spam filters than HTML alone, and it is what text-only clients render.
- Multi-line row values (the receipt's bill sections and line items) become
  `<br>` - before this they collapsed into one run-on line.

Firebase Auth's templates are a separate, much more limited surface: wording and
basic HTML only, edited in the Console. Firebase owns that shell.

## The password reset failure, for the record

Observed 2026-08-10: reset mail landed in **spam**, and the link reported
*"expired or already used"* (`auth/invalid-action-code`).

The handler page rendered fine, so the API key was never the problem. Two causes
compounding:

1. Reset links last **one hour**.
2. **Requesting a new reset invalidates every earlier link.** Because the mail
   was in spam it went unseen, got re-requested, and the email eventually found
   was already dead.

Fixed by moving Auth mail onto authenticated Brevo SMTP (out of spam), and by
`ForgotPasswordScreen` now stating the expiry, the spam risk, and the
newest-link-only rule on send.

## Open items

- **Auth template wording** is written and ready to paste, but the Console
  currently shows *"Email template updates are currently unavailable for this
  project"* - a temporary Firebase-side lock, typically clearing within a day.
- **Custom action URL** (branded reset page on `wattwise.site`) is not set.
  Setting it before the handler page exists 404s every reset link.
- **Extension migration**: `firestore-send-email` is retired **31 March 2027**,
  and the Brevo SMTP key expires **10 August 2027**. Both need handling before
  then.
