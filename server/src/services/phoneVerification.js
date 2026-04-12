import crypto from 'crypto';

function createPhoneVerificationError(status, message, code = '') {
  const error = new Error(message);
  error.status = status;
  if (code) {
    error.code = code;
  }
  return error;
}

export function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp || '')).digest('hex');
}

export function createOtpCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

export function createVerificationToken() {
  return crypto.randomBytes(20).toString('hex');
}

export async function requestPhoneOtp(
  db,
  {
    normalizedPhone,
    purpose,
    expiresMinutes = 5,
    resendCooldownSeconds = 15,
  }
) {
  const recentRows = await db.query(
    `
      SELECT created_at
      FROM phone_verification_otps
      WHERE phone = $1
        AND purpose = $2
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [normalizedPhone, purpose]
  );

  if (recentRows.rowCount > 0) {
    const lastCreatedAt = new Date(recentRows.rows[0].created_at);
    const waitMs = resendCooldownSeconds * 1000 - (Date.now() - lastCreatedAt.getTime());
    if (waitMs > 0) {
      throw createPhoneVerificationError(
        429,
        `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another OTP.`,
        'phone_otp_rate_limited'
      );
    }
  }

  const otp = createOtpCode();
  const verificationToken = createVerificationToken();

  await db.query(
    `
      INSERT INTO phone_verification_otps (
        phone,
        verification_token,
        otp_hash,
        purpose,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        NOW() + ($5::text || ' minutes')::interval
      )
    `,
    [normalizedPhone, verificationToken, hashOtp(otp), purpose, expiresMinutes]
  );

  return {
    verificationToken,
    otp,
    expiresInMinutes: expiresMinutes,
  };
}

export async function verifyPhoneOtp(
  db,
  {
    normalizedPhone,
    verificationToken,
    otp,
    maxAttempts = 5,
  }
) {
  const otpRows = await db.query(
    `
      SELECT id, otp_hash, attempts, expires_at, verified_at, verification_id, consumed_at
      FROM phone_verification_otps
      WHERE phone = $1
        AND verification_token = $2
      LIMIT 1
    `,
    [normalizedPhone, verificationToken]
  );

  if (otpRows.rowCount === 0) {
    throw createPhoneVerificationError(
      404,
      'OTP request not found. Request OTP again.',
      'phone_otp_not_found'
    );
  }

  const otpRow = otpRows.rows[0];
  if (otpRow.consumed_at) {
    throw createPhoneVerificationError(
      409,
      'This OTP session is already used. Request a new OTP.',
      'phone_otp_consumed'
    );
  }

  if (new Date(otpRow.expires_at).getTime() <= Date.now()) {
    throw createPhoneVerificationError(410, 'OTP expired. Request a new OTP.', 'phone_otp_expired');
  }

  if (otpRow.verified_at && otpRow.verification_id) {
    return {
      verificationId: otpRow.verification_id,
      alreadyVerified: true,
    };
  }

  if (Number(otpRow.attempts) >= maxAttempts) {
    throw createPhoneVerificationError(
      429,
      'Too many invalid OTP attempts. Request a new OTP.',
      'phone_otp_attempts_exceeded'
    );
  }

  const providedHash = hashOtp(otp);
  const storedBuffer = Buffer.from(otpRow.otp_hash, 'hex');
  const providedBuffer = Buffer.from(providedHash, 'hex');
  const otpValid =
    storedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(storedBuffer, providedBuffer);

  if (!otpValid) {
    await db.query(
      `
        UPDATE phone_verification_otps
        SET attempts = attempts + 1
        WHERE id = $1
      `,
      [otpRow.id]
    );
    throw createPhoneVerificationError(400, 'Invalid OTP code.', 'phone_otp_invalid');
  }

  const verificationId = createVerificationToken();
  await db.query(
    `
      UPDATE phone_verification_otps
      SET verified_at = NOW(),
          verification_id = $1
      WHERE id = $2
    `,
    [verificationId, otpRow.id]
  );

  return {
    verificationId,
    alreadyVerified: false,
  };
}

export async function consumeVerifiedPhoneOtp(
  db,
  {
    normalizedPhone,
    phoneVerificationId,
  }
) {
  const otpRows = await db.query(
    `
      SELECT id, expires_at
      FROM phone_verification_otps
      WHERE phone = $1
        AND verification_id = $2
        AND verified_at IS NOT NULL
        AND consumed_at IS NULL
      LIMIT 1
    `,
    [normalizedPhone, phoneVerificationId]
  );

  if (otpRows.rowCount === 0) {
    return { ok: false, reason: 'Phone verification not found or already used' };
  }

  if (new Date(otpRows.rows[0].expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: 'Phone verification expired. Request OTP again.' };
  }

  const consumeRows = await db.query(
    `
      UPDATE phone_verification_otps
      SET consumed_at = NOW()
      WHERE id = $1
        AND consumed_at IS NULL
        AND verified_at IS NOT NULL
        AND expires_at > NOW()
      RETURNING id
    `,
    [otpRows.rows[0].id]
  );

  if (consumeRows.rowCount === 0) {
    return { ok: false, reason: 'Phone verification already consumed or expired' };
  }

  return { ok: true };
}
