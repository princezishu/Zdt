import { useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Mail, Lock, Smartphone } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

interface ForgotPasswordProps {
  onBackToLogin: () => void;
}

export default function ForgotPassword({ onBackToLogin }: ForgotPasswordProps) {
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const hasIdentifier = channel === 'email' ? Boolean(email.trim()) : Boolean(phone.trim());

  function switchChannel(nextChannel: 'email' | 'sms') {
    setChannel(nextChannel);
    setOtpSent(false);
    setOtp('');
    setNewPassword('');
    setDevOtp('');
    setError('');
    setSuccess('');
  }

  async function requestOtp() {
    setError('');
    setSuccess('');
    setIsRequestingOtp(true);

    try {
      const requestBody =
        channel === 'email'
          ? { channel, email: email.trim() }
          : { channel, phone: phone.trim() };

      const response = await fetch(`${API_BASE_URL}/auth/forgot-password/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to send OTP');
      }

      setOtpSent(true);
      setSuccess(data?.message || 'OTP sent successfully.');
      setDevOtp(data?.devOtp || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send OTP');
    } finally {
      setIsRequestingOtp(false);
    }
  }

  async function resetPassword() {
    setError('');
    setSuccess('');
    setIsResetting(true);

    try {
      const requestBody =
        channel === 'email'
          ? { channel, email: email.trim(), otp, newPassword }
          : { channel, phone: phone.trim(), otp, newPassword };

      const response = await fetch(`${API_BASE_URL}/auth/forgot-password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to reset password');
      }

      setSuccess(data?.message || 'Password reset successful.');
      setOtp('');
      setNewPassword('');
      setTimeout(() => onBackToLogin(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password');
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-white text-brand-black overflow-hidden">
      <div className="absolute inset-0 section-glow opacity-90" />
      <div className="absolute inset-0 futuristic-grid opacity-20" />
      <div className="absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-brand-secondary/15 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-[460px] w-[460px] rounded-full bg-brand-primary/10 blur-3xl" />

      <div className="relative z-10 page-container min-h-screen flex items-center justify-center py-16">
        <div className="w-full max-w-[460px] rounded-2xl border border-brand-gray2 bg-white/90 p-8 shadow-card-hover backdrop-blur-lg neon-card">
          <button
            onClick={onBackToLogin}
            className="mb-6 inline-flex items-center gap-2 text-sm text-brand-gray3 hover:text-brand-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to login
          </button>

          <div className="space-y-2">
            <h2 className="text-3xl font-semibold text-brand-black">Reset password</h2>
            <p className="text-sm text-brand-gray3">
              Request OTP on your registered email or phone, then set a new password.
            </p>
          </div>

          <div className="mt-8 space-y-5">
            <div className="rounded-xl border border-brand-gray2 p-1 grid grid-cols-2 gap-1 bg-white">
              <button
                type="button"
                onClick={() => switchChannel('email')}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  channel === 'email'
                    ? 'bg-brand-primary text-white'
                    : 'text-brand-gray3 hover:text-brand-primary'
                }`}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => switchChannel('sms')}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  channel === 'sms'
                    ? 'bg-brand-primary text-white'
                    : 'text-brand-gray3 hover:text-brand-primary'
                }`}
              >
                SMS
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">
                {channel === 'email' ? 'Email Address' : 'Phone Number'}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-gray3 group-focus-within:text-brand-primary">
                  {channel === 'email' ? (
                    <Mail className="h-5 w-5" />
                  ) : (
                    <Smartphone className="h-5 w-5" />
                  )}
                </div>
                <input
                  type={channel === 'email' ? 'email' : 'tel'}
                  placeholder={channel === 'email' ? 'name@example.com' : '+15551234567'}
                  value={channel === 'email' ? email : phone}
                  onChange={(event) =>
                    channel === 'email'
                      ? setEmail(event.target.value)
                      : setPhone(event.target.value)
                  }
                  className="h-12 w-full rounded-xl border border-brand-gray2 bg-white pl-11 pr-4 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                />
              </div>
            </div>

            <button
              onClick={requestOtp}
              disabled={isRequestingOtp || !hasIdentifier}
              className="w-full rounded-xl bg-brand-primary py-3.5 text-sm font-semibold text-white shadow-glow transition-transform duration-200 hover:scale-[1.01] hover:bg-brand-primary-dark disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isRequestingOtp ? 'Sending OTP...' : 'Send OTP'} <ArrowRight className="inline h-4 w-4 ml-1" />
            </button>

            {otpSent ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">
                    OTP
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-gray3 group-focus-within:text-brand-primary">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit OTP"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                      className="h-12 w-full rounded-xl border border-brand-gray2 bg-white pl-11 pr-4 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">
                    New Password
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-gray3 group-focus-within:text-brand-primary">
                      <Lock className="h-5 w-5" />
                    </div>
                    <input
                      type="password"
                      placeholder="Minimum 8 characters"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="h-12 w-full rounded-xl border border-brand-gray2 bg-white pl-11 pr-4 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                    />
                  </div>
                </div>

                <button
                  onClick={resetPassword}
                  disabled={isResetting || otp.length !== 6 || newPassword.length < 8}
                  className="w-full rounded-xl bg-brand-primary py-3.5 text-sm font-semibold text-white shadow-glow transition-transform duration-200 hover:scale-[1.01] hover:bg-brand-primary-dark disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isResetting ? 'Resetting...' : 'Reset Password'}{' '}
                  <ArrowRight className="inline h-4 w-4 ml-1" />
                </button>
              </>
            ) : null}

            {devOtp ? (
              <p className="text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded-lg p-2">
                Dev OTP: <strong>{devOtp}</strong>
              </p>
            ) : null}

            {error ? (
              <p className="text-xs text-red-500" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="text-xs text-emerald-600" role="status">
                {success}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
