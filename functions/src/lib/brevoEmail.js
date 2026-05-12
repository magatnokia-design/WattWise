const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { defineSecret } = require('firebase-functions/params');

const BREVO_API_KEY = defineSecret('BREVO_API_KEY');

const DEFAULT_SENDER_EMAIL = 'support@wattwise.site';
const DEFAULT_SENDER_NAME = 'WattWise';

const TEMPLATE_ID_ENV = {
  budget: 'BREVO_TEMPLATE_BUDGET',
  safety: 'BREVO_TEMPLATE_SAFETY',
  device: 'BREVO_TEMPLATE_DEVICE',
  receipt: 'BREVO_TEMPLATE_RECEIPT',
};

const normalizeTemplateId = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
};

const getTemplateId = (type) => {
  const envKey = TEMPLATE_ID_ENV[type];
  if (!envKey) return null;
  return normalizeTemplateId(process.env[envKey]);
};

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

const sendBrevoTemplateEmail = async ({
  toEmail,
  toName,
  templateId,
  params,
  tags,
}) => {
  const apiKey = BREVO_API_KEY.value();
  if (!apiKey) {
    logger.warn('Brevo API key missing; skipping email send');
    return { skipped: true, reason: 'missing_api_key' };
  }

  const normalizedTemplateId = normalizeTemplateId(templateId);
  if (!normalizedTemplateId) {
    logger.info('Brevo template id missing; skipping email send', { templateId });
    return { skipped: true, reason: 'missing_template_id' };
  }

  const recipientEmail = String(toEmail || '').trim();
  if (!recipientEmail) {
    logger.info('Brevo recipient missing; skipping email send');
    return { skipped: true, reason: 'missing_recipient' };
  }

  const senderEmail = String(process.env.BREVO_SENDER_EMAIL || DEFAULT_SENDER_EMAIL).trim() || DEFAULT_SENDER_EMAIL;
  const senderName = String(process.env.BREVO_SENDER_NAME || DEFAULT_SENDER_NAME).trim() || DEFAULT_SENDER_NAME;

  const recipient = { email: recipientEmail };
  const recipientName = String(toName || '').trim();
  if (recipientName) {
    recipient.name = recipientName;
  }

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [recipient],
    templateId: normalizedTemplateId,
    params: params || {},
  };

  if (Array.isArray(tags) && tags.length > 0) {
    payload.tags = tags;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const responseText = await response.text();
      logger.error('Brevo email send failed', {
        status: response.status,
        body: responseText,
      });
      return { success: false, status: response.status };
    }

    const data = await response.json().catch(() => ({}));
    return {
      success: true,
      messageId: data?.messageId || null,
    };
  } catch (error) {
    logger.error('Brevo email send error', {
      message: error?.message,
    });
    return { success: false };
  }
};

module.exports = {
  BREVO_API_KEY,
  getTemplateId,
  resolveUserContact,
  sendBrevoTemplateEmail,
};
