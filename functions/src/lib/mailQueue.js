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

/**
 * Renders the shared WattWise email shell. `rows` is a list of
 * [label, value] pairs rendered as a simple detail table.
 */
const buildEmailHtml = ({ heading, intro, rows }) => {
  const detailRows = (Array.isArray(rows) ? rows : [])
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => `
      <tr>
        <td style="padding:6px 12px 6px 0;color:#6B7280;font-size:14px;">${escapeHtml(label)}</td>
        <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(value)}</td>
      </tr>`)
    .join('');

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
  <h2 style="color:#10B981;margin:0 0 12px;font-size:20px;">${escapeHtml(heading)}</h2>
  <p style="color:#374151;font-size:15px;line-height:1.5;margin:0 0 16px;">${escapeHtml(intro)}</p>
  <table style="border-collapse:collapse;width:100%;">${detailRows}</table>
  <p style="color:#9CA3AF;font-size:12px;margin-top:24px;">Sent automatically by WattWise.</p>
</div>`;
};

/**
 * Queues one email by writing to the `mail` collection. Returns a skip result
 * rather than throwing when there is no recipient, so callers can stay
 * best-effort the way the previous provider-backed helper was.
 */
const enqueueEmail = async ({ toEmail, subject, heading, intro, rows, tag, attachments }) => {
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
      from: process.env.MAIL_SENDER || DEFAULT_FROM,
      message: {
        subject: normalizedSubject,
        html: buildEmailHtml({ heading: heading || normalizedSubject, intro, rows }),
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
  enqueueEmail,
};
