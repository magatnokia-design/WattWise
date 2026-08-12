const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

// Collection watched by the Firebase "Trigger Email from Firestore" extension.
// Writing a document here is the whole send: the extension picks it up, sends
// it over the configured SMTP transport, and writes delivery state back onto
// the same document.
const MAIL_COLLECTION = 'mail';

// Must be an address the configured SMTP account is allowed to send as. Gmail
// rewrites or rejects anything else, so a domain address here silently broke
// delivery. Override with the MAIL_SENDER env var if the sending domain changes.
const DEFAULT_FROM = 'WattWise <magatnokia@gmail.com>';

// Two senders, both opt-in through the environment.
//
// The domain addresses only work once they exist as verified "Send mail as"
// aliases on the Gmail account behind SMTP_CONNECTION_URI - Gmail silently
// rewrites or drops anything else, which is how delivery broke last time. So
// both fall back to the address that is known to work, and setting the env vars
// is the switch that turns the domain senders on. Until then this changes
// nothing about what goes out.
const NOTIFICATION_FROM = process.env.MAIL_SENDER || DEFAULT_FROM;
const SUPPORT_FROM = process.env.MAIL_SENDER_SUPPORT || NOTIFICATION_FROM;
const REPLY_TO = process.env.MAIL_REPLY_TO || null;

// Mail about something going wrong is mail someone may want to reply to, so it
// comes from support. Routine billing and usage mail comes from the main
// address. Keyed on the tag each caller already passes, so no call site changes.
const SUPPORT_TAGS = new Set(['device', 'safety']);

const resolveSender = (tag) => (SUPPORT_TAGS.has(tag) ? SUPPORT_FROM : NOTIFICATION_FROM);

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const resolveUserContact = async (userId) => {
  if (!userId) return null;

  try {
    const userRecord = await admin.auth().getUser(userId);
    const email = String(userRecord.email || '').trim();
    if (!email) return null;

    const name = String(userRecord.displayName || '').trim();
    return {
      email,
      name: name || null,
    };
  } catch (error) {
    logger.warn('Unable to resolve user contact', {
      userId,
      message: error?.message,
    });
    return null;
  }
};

// Theme tokens, mirroring src/constants/colors.js. Repeated as literals because
// email clients strip <style> blocks and class attributes - every rule has to be
// inline on the element that uses it.
const THEME = {
  primary: '#10B981',
  primaryDark: '#059669',
  text: '#111827',
  textBody: '#374151',
  textLight: '#6B7280',
  textFaint: '#9CA3AF',
  border: '#E5E7EB',
  rowTint: '#F9FAFB',
  page: '#F3F4F6',
  white: '#FFFFFF',
  warning: '#F59E0B',
  error: '#EF4444',
};

// Mail that reports a problem gets a different accent so it reads as urgent at a
// glance. Keyed on the same tag that decides the sender, so the two always agree.
const ACCENTS = {
  safety: THEME.error,
  device: THEME.warning,
};

const accentFor = (tag) => ACCENTS[tag] || THEME.primary;

// Where the footer points people. The web client shows the same data with room
// to read it, which is the thing most worth saying in a footer.
const APP_WEB_URL = (process.env.APP_WEB_URL || 'https://www.wattwise.site').trim();

// The brand mark in the email header, opt-in through the environment the same
// way the domain senders above are.
//
// It cannot be inlined: Gmail strips `data:` URI images, so the only thing that
// renders is a hosted URL - and the only host this project has is the web
// client. Defaulting it on would put a broken image in every email until that
// file is deployed, so an unset variable keeps the lightning emoji that has
// been shipping. Set MAIL_LOGO_URL once /email-logo.png is live.
//
// Deliberately the white-on-transparent bolt rather than the green disc: this
// header turns red for safety mail and amber for device mail, and a green disc
// would sit on both.
const EMAIL_LOGO_URL = (process.env.MAIL_LOGO_URL || '').trim();

// Password reset and address confirmation get none of the footer link, the
// advisory note, or anything else optional. A security email that also markets
// is the exact shape of a phishing message, and every extra link in one is
// another thing the reader has to decide whether to trust.
const isAuthMail = (tag) => tag === 'auth';

// Several rows carry multi-line values - the receipt's bill sections and line
// items are newline-joined. HTML collapses those to a single run-on line, so
// they have to become <br> after escaping.
const escapeMultiline = (value) => escapeHtml(value).replace(/\r?\n/g, '<br>');

const visibleRows = (rows) => (Array.isArray(rows) ? rows : [])
  .filter(([, value]) => value !== null && value !== undefined && value !== '');

/**
 * Renders the shared WattWise email shell. `rows` is a list of
 * [label, value] pairs rendered as a detail table.
 *
 * Built as nested tables with inline styles rather than divs and CSS: Outlook
 * renders through Word's HTML engine, which ignores most modern layout.
 */
const buildEmailHtml = ({ heading, intro, rows, tag, action, note }) => {
  const accent = accentFor(tag);
  const authMail = isAuthMail(tag);

  // One line of advice under the figures - what to do about what was just read.
  // Tinted rather than bordered so it reads as guidance, not another alert.
  const noteText = authMail ? '' : String(note || '').trim();
  const noteBlock = noteText
    ? `
        <tr>
          <td style="padding:0 24px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;width:100%;background:${THEME.rowTint};border-left:3px solid ${accent};border-radius:6px;">
              <tr>
                <td style="padding:12px 14px;color:${THEME.textBody};font-size:12.5px;line-height:1.6;">${escapeMultiline(noteText)}</td>
              </tr>
            </table>
          </td>
        </tr>`
    : '';

  const footerLink = authMail
    ? ''
    : `
            <p style="margin:0 0 8px;font-size:12px;line-height:1.5;">
              <a href="${escapeHtml(APP_WEB_URL)}" style="color:${THEME.primaryDark};font-weight:600;text-decoration:none;">Open WattWise on the web &rarr;</a>
              <span style="color:${THEME.textFaint};"> &nbsp;Every screen the phone app has, with room to read it.</span>
            </p>`;

  // Auth mail leads with a button rather than a detail table. Rendered as a
  // bordered table cell, not a styled <a>: Outlook drops padding and background
  // on anchors, which would leave the button as bare underlined text.
  const actionUrl = String(action?.url || '').trim();
  const actionLabel = String(action?.label || '').trim();
  const actionBlock = actionUrl && actionLabel
    ? `
        <tr>
          <td style="padding:2px 24px 22px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:${accent};border-radius:8px;">
                  <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 26px;color:${THEME.white};font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(actionLabel)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:14px 0 0;color:${THEME.textFaint};font-size:11px;line-height:1.5;word-break:break-all;">
              Or paste this into your browser:<br>${escapeHtml(actionUrl)}
            </p>
          </td>
        </tr>`
    : '';

  const detailRows = visibleRows(rows)
    .map(([label, value], index) => {
      const tint = index % 2 ? THEME.white : THEME.rowTint;
      return `
              <tr>
                <td style="padding:11px 16px;background:${tint};color:${THEME.textLight};font-size:13px;line-height:1.45;border-bottom:1px solid ${THEME.border};vertical-align:top;width:42%;">${escapeHtml(label)}</td>
                <td style="padding:11px 16px;background:${tint};color:${THEME.text};font-size:13px;line-height:1.45;font-weight:600;border-bottom:1px solid ${THEME.border};vertical-align:top;">${escapeMultiline(value)}</td>
              </tr>`;
    })
    .join('');

  const detailTable = detailRows
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;width:100%;border:1px solid ${THEME.border};border-radius:8px;overflow:hidden;">${detailRows}</table>`
    : '';

  // Shown in the inbox list next to the subject. Without it clients pull the
  // first text they find, which would be the wordmark.
  const preheader = String(intro || '').slice(0, 140);

  // Two cells rather than an <img> beside a <span>: Outlook's Word engine
  // ignores vertical-align on inline images, which drops the mark below the
  // baseline of the wordmark next to it.
  //
  // The wordmark stays either way. Most clients block remote images until the
  // reader allows them, so a header that is only an image is a header that is
  // sometimes nothing at all.
  const brandMark = EMAIL_LOGO_URL
    ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:0 9px 0 0;" valign="middle">
                  <img src="${escapeHtml(EMAIL_LOGO_URL)}" width="22" height="22" alt=""
                    style="display:block;width:22px;height:22px;border:0;outline:none;text-decoration:none;">
                </td>
                <td valign="middle">
                  <span style="color:${THEME.white};font-size:17px;font-weight:700;letter-spacing:-0.2px;">WattWise</span>
                </td>
              </tr>
            </table>`
    : `<span style="color:${THEME.white};font-size:17px;font-weight:700;letter-spacing:-0.2px;">&#9889; WattWise</span>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${THEME.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${THEME.page};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:${THEME.white};border:1px solid ${THEME.border};border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;">
        <tr>
          <td style="background:${accent};padding:18px 24px;">
${brandMark}
          </td>
        </tr>
        <tr>
          <td style="padding:26px 24px 0;">
            <h1 style="margin:0 0 10px;color:${THEME.text};font-size:20px;line-height:1.3;font-weight:700;">${escapeHtml(heading)}</h1>
            <p style="margin:0 0 20px;color:${THEME.textBody};font-size:14px;line-height:1.6;">${escapeMultiline(intro)}</p>
          </td>
        </tr>
${actionBlock}
        <tr>
          <td style="padding:0 24px 24px;">${detailTable}</td>
        </tr>
${noteBlock}
        <tr>
          <td style="padding:16px 24px 22px;border-top:1px solid ${THEME.border};">
${footerLink}
            <p style="margin:0 0 4px;color:${THEME.textLight};font-size:12px;line-height:1.5;">
              Sent automatically by WattWise. Energy figures are measured at your outlets; peso amounts follow the PELCO III residential tariff.
            </p>
            <p style="margin:0;color:${THEME.textFaint};font-size:11px;line-height:1.5;">
              Reply to this email if something looks wrong.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
};

/**
 * Plain-text twin of the HTML body.
 *
 * Sent alongside rather than instead: a multipart message scores better with
 * spam filters than HTML alone, and it is what watches, screen readers, and
 * text-only clients actually render.
 */
const buildEmailText = ({ heading, intro, rows, action, tag, note }) => {
  const lines = [
    heading,
    '='.repeat(String(heading || '').length),
    '',
    intro,
    '',
  ];

  // The URL has to appear in full here - a text part cannot carry a link.
  if (action?.url) {
    lines.push(String(action.url), '');
  }

  visibleRows(rows).forEach(([label, value]) => {
    lines.push(`${label}: ${String(value).replace(/\r?\n/g, '\n  ')}`);
  });

  const noteText = isAuthMail(tag) ? '' : String(note || '').trim();
  if (noteText) {
    lines.push('', noteText);
  }

  lines.push('', '--', 'Sent automatically by WattWise.');
  lines.push('Peso amounts follow the PELCO III residential tariff.');

  if (!isAuthMail(tag)) {
    lines.push(`Open WattWise on the web: ${APP_WEB_URL}`);
  }

  return lines.join('\n');
};

/**
 * Queues one email by writing to the `mail` collection. Returns a skip result
 * rather than throwing when there is no recipient, so callers can stay
 * best-effort the way the previous provider-backed helper was.
 */
const enqueueEmail = async ({ toEmail, subject, heading, intro, rows, tag, action, note, attachments }) => {
  const recipientEmail = String(toEmail || '').trim();
  if (!recipientEmail) {
    logger.info('Email skipped: missing recipient', { tag });
    return { skipped: true, reason: 'missing_recipient' };
  }

  const normalizedSubject = String(subject || '').trim();
  if (!normalizedSubject) {
    logger.info('Email skipped: missing subject', { tag });
    return { skipped: true, reason: 'missing_subject' };
  }

  // The extension passes `message.attachments` straight to nodemailer, so each
  // entry is { filename, content (base64), encoding, contentType }. Firestore
  // caps a document at 1 MiB; an invoice PDF is a few KB, but guard anyway.
  const normalizedAttachments = (Array.isArray(attachments) ? attachments : [])
    .filter((attachment) => attachment?.filename && attachment?.content)
    .filter((attachment) => {
      const withinLimit = attachment.content.length < 700000;
      if (!withinLimit) {
        logger.warn('Attachment dropped: too large for a Firestore document', {
          tag,
          filename: attachment.filename,
        });
      }
      return withinLimit;
    });

  try {
    const doc = await admin.firestore().collection(MAIL_COLLECTION).add({
      to: [recipientEmail],
      from: resolveSender(tag),
      // Replies to an automated address go nowhere. When a support address is
      // configured, point them at it instead.
      ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
      message: {
        subject: normalizedSubject,
        // Both parts, always. Nodemailer sends multipart/alternative when text
        // and html are both present, which filters treat more kindly than a
        // bare HTML body.
        text: buildEmailText({ heading: heading || normalizedSubject, intro, rows, action, tag, note }),
        html: buildEmailHtml({ heading: heading || normalizedSubject, intro, rows, tag, action, note }),
        ...(normalizedAttachments.length ? { attachments: normalizedAttachments } : {}),
      },
      // Not read by the extension; kept for our own log/debug queries.
      metadata: {
        tag: tag || null,
        queuedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    return { success: true, id: doc.id };
  } catch (error) {
    logger.error('Failed to queue email', {
      tag,
      message: error?.message,
    });
    return { success: false };
  }
};

module.exports = {
  MAIL_COLLECTION,
  resolveUserContact,
  resolveSender,
  buildEmailHtml,
  buildEmailText,
  enqueueEmail,
};
