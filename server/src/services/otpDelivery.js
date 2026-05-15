import nodemailer from 'nodemailer';

/**
 * OTP & email delivery service.
 *
 * Email supports either Resend HTTP API or SMTP.
 * SMS uses Twilio HTTP API.
 *
 * Resend email env:
 *   RESEND_API_KEY, SMTP_FROM
 *
 * SMTP email env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * SMS env:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 */

const APP_NAME = process.env.APP_NAME || 'ZDT Realty';

// ─── Helpers ────────────────────────────────────────────────────────────────

function requireEnv(keys, label) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    const message = `${label} delivery is not configured. Missing: ${missing.join(', ')}`;
    if (process.env.NODE_ENV !== 'production') {
      console.warn(message);
      return false;
    }
    throw new Error(message);
  }
  return true;
}

function buildOtpMessage(otp, expiresInMinutes) {
  const text = `Your ${APP_NAME} OTP is ${otp}. It expires in ${expiresInMinutes} minutes.`;
  const html = `<p>Your <strong>${APP_NAME}</strong> OTP is:</p><p style="font-size:20px;"><strong>${otp}</strong></p><p>It expires in ${expiresInMinutes} minutes.</p>`;
  return { text, html };
}

// Email via Resend HTTP API or SMTP.

const RESEND_EMAIL_REQUIRED_KEYS = ['RESEND_API_KEY', 'SMTP_FROM'];
const SMTP_EMAIL_REQUIRED_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
let smtpTransporter = null;

function hasEnv(keys) {
  return keys.every((key) => Boolean(process.env[key]));
}

function getEmailProvider() {
  if (hasEnv(RESEND_EMAIL_REQUIRED_KEYS)) {
    return 'resend';
  }
  if (hasEnv(SMTP_EMAIL_REQUIRED_KEYS)) {
    return 'smtp';
  }
  return '';
}

function getSmtpTransporter() {
  if (smtpTransporter) {
    return smtpTransporter;
  }

  const smtpPort = Number(process.env.SMTP_PORT || 587);
  smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure:
      String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true' ||
      smtpPort === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return smtpTransporter;
}

async function sendEmailViaResend(payload) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const raw = await response.text();
    const details = raw.slice(0, 300);
    throw new Error(`Resend email API failed (${response.status}): ${details}`);
  }

  return true;
}

async function sendEmailViaSmtp(payload) {
  await getSmtpTransporter().sendMail({
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    replyTo: payload.reply_to,
    cc: payload.cc,
    bcc: payload.bcc,
  });

  return true;
}

export async function sendEmailMessage({
  to,
  subject,
  text = '',
  html = '',
  replyTo,
  cc,
  bcc,
  deliveryLabel = 'Email',
}) {
  if (!to || !String(to).trim()) {
    throw new Error('Recipient email is required.');
  }
  if (!subject || !String(subject).trim()) {
    throw new Error('Email subject is required.');
  }

  const provider = getEmailProvider();
  if (!provider) {
    const configured = requireEnv(
      ['RESEND_API_KEY or SMTP_HOST', 'SMTP_FROM'],
      deliveryLabel
    );
    if (!configured) {
      return false;
    }
    return false;
  }

  const payload = {
    from: process.env.SMTP_FROM,
    to: [String(to).trim()],
    subject: String(subject).trim(),
  };

  if (html) payload.html = html;
  if (text) payload.text = text;
  if (replyTo) payload.reply_to = String(replyTo).trim();
  if (cc) payload.cc = Array.isArray(cc) ? cc : [cc];
  if (bcc) payload.bcc = Array.isArray(bcc) ? bcc : [bcc];

  if (provider === 'resend') {
    return sendEmailViaResend(payload);
  }

  return sendEmailViaSmtp(payload);
}

// OTP via Email.

async function sendOtpEmail({ email, otp, expiresInMinutes }) {
  const message = buildOtpMessage(otp, expiresInMinutes);
  return sendEmailMessage({
    to: email,
    subject: `${APP_NAME} OTP`,
    text: message.text,
    html: message.html,
    deliveryLabel: 'Email OTP',
  });
}

// SMS via Twilio HTTP API.

const SMS_REQUIRED_KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];

function getTwilioEndpoint() {
  return `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
}

function getTwilioAuthHeader() {
  const credentials = `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`;
  const encoded =
    typeof btoa === 'function'
      ? btoa(credentials)
      : Buffer.from(credentials).toString('base64');
  return `Basic ${encoded}`;
}

async function sendOtpSms({ phone, otp, expiresInMinutes }) {
  const configured = requireEnv(SMS_REQUIRED_KEYS, 'SMS OTP');
  if (!configured) {
    return false;
  }

  const body = new URLSearchParams({
    To: phone,
    From: process.env.TWILIO_PHONE_NUMBER,
    Body: `Your ${APP_NAME} OTP is ${otp}. It expires in ${expiresInMinutes} minutes.`,
  });

  const response = await fetch(getTwilioEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: getTwilioAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const raw = await response.text();
    const details = raw.slice(0, 200);
    throw new Error(`Twilio SMS API failed (${response.status}): ${details}`);
  }

  return true;
}

export async function sendSmsMessage({
  to,
  body,
  deliveryLabel = 'SMS',
}) {
  if (!to || !String(to).trim()) {
    throw new Error('Recipient phone number is required.');
  }
  if (!body || !String(body).trim()) {
    throw new Error('SMS body is required.');
  }

  const configured = requireEnv(SMS_REQUIRED_KEYS, deliveryLabel);
  if (!configured) {
    return false;
  }

  const payload = new URLSearchParams({
    To: String(to).trim(),
    From: process.env.TWILIO_PHONE_NUMBER,
    Body: String(body).trim(),
  });

  const response = await fetch(getTwilioEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: getTwilioAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload,
  });

  if (!response.ok) {
    const raw = await response.text();
    const details = raw.slice(0, 200);
    throw new Error(`Twilio SMS API failed (${response.status}): ${details}`);
  }

  return true;
}

// Unified OTP sender.

export async function sendOtp({ channel, email, phone, otp, expiresInMinutes }) {
  if (channel === 'email') {
    if (!email) {
      throw new Error('Email address is required for email OTP delivery.');
    }
    return sendOtpEmail({ email, otp, expiresInMinutes });
  }

  if (channel === 'sms') {
    if (!phone) {
      throw new Error('Phone number is required for SMS OTP delivery.');
    }
    return sendOtpSms({ phone, otp, expiresInMinutes });
  }

  throw new Error('Unsupported OTP delivery channel.');
}
