import nodemailer from 'nodemailer';

const APP_NAME = process.env.APP_NAME || 'ZDT Realty';
const SMTP_REQUIRED_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
const SMS_REQUIRED_KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];

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

function createSmtpTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure:
      String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' ||
      Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function getTwilioEndpoint() {
  return `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
}

function getTwilioAuthHeader() {
  const authToken = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
  ).toString('base64');
  return `Basic ${authToken}`;
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

  const configured = requireEnv(SMTP_REQUIRED_KEYS, deliveryLabel);
  if (!configured) {
    return false;
  }

  const transporter = createSmtpTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: String(to).trim(),
    subject: String(subject).trim(),
    text,
    html,
    replyTo,
    cc,
    bcc,
  });

  return true;
}

async function sendOtpEmail({ email, otp, expiresInMinutes }) {
  const message = buildOtpMessage(otp, expiresInMinutes);
  return sendEmailMessage({
    to: email,
    subject: `${APP_NAME} password reset OTP`,
    text: message.text,
    html: message.html,
    deliveryLabel: 'Email OTP',
  });
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
