import { useEffect, useState } from 'react';
import {
  Mail,
  Lock,
  User,
  Phone,
  Eye,
  EyeOff,
  ArrowRight,
  Building2,
  Sparkles,
  ShieldCheck,
  Gift,
} from 'lucide-react';
import ManagedOAuthButtons from '@/components/auth/ManagedOAuthButtons';
import { apiRequest } from '@/lib/http';
import { readOrCreateDeviceId, type AuthUser } from '@/lib/session';
import {
  clearManagedLinkHint,
  clearManagedSignupHint,
  getManagedOAuthProviderLabel,
  isSupabaseConfigured,
  type ManagedOAuthProvider,
  readManagedSignupHint,
  signInWithManagedOAuth,
  setManagedLinkHint,
} from '@/lib/supabase';
import { toast } from 'sonner';
import { addNotification } from '@/lib/notificationsStore';

interface RegisterProps {
  onSwitchToLogin: () => void;
  onOpenCompanyLogin: () => void;
  onOpenCompanyRegister: () => void;
  onRegisterSuccess: (payload?: { token: string; user: AuthUser }) => void;
}

function normalizeRegistrationPhone(value: string) {
  const trimmed = String(value || '').trim();
  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '').slice(0, 15);
  if (!digits) {
    return '';
  }
  return hasLeadingPlus ? `+${digits}` : digits;
}

const steps = [
  {
    icon: Sparkles,
    title: 'Create your profile',
    description: 'Tell us your goals, budgets, and timelines.',
  },
  {
    icon: Building2,
    title: 'Set preferences',
    description: 'Pick localities, property types, and amenities.',
  },
  {
    icon: ShieldCheck,
    title: 'Get verified access',
    description: 'Unlock curated listings and trusted data.',
  },
];

export default function Register({
  onSwitchToLogin,
  onOpenCompanyLogin,
  onOpenCompanyRegister,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onRegisterSuccess: _onRegisterSuccess,
}: RegisterProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailVerificationToken, setEmailVerificationToken] = useState('');
  const [emailVerificationId, setEmailVerificationId] = useState('');
  const [emailVerifiedFor, setEmailVerifiedFor] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailOtpStatus, setEmailOtpStatus] = useState('');
  const [emailOtpError, setEmailOtpError] = useState('');
  const [emailOtpDevCode, setEmailOtpDevCode] = useState('');
  const [isRequestingEmailOtp, setIsRequestingEmailOtp] = useState(false);
  const [isVerifyingEmailOtp, setIsVerifyingEmailOtp] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isManagedRegister = isSupabaseConfigured();
  const normalizedEmail = email.trim().toLowerCase();
  const isEmailVerified =
    Boolean(emailVerificationId) && normalizedEmail === emailVerifiedFor;

  useEffect(() => {
    const hintedEmail = readManagedSignupHint();
    if (hintedEmail) {
      setEmail((currentValue) => currentValue || hintedEmail);
      setSuccess(
        'Use this same email to create your managed sign-in. After that, we will send you back to link the existing account.'
      );
    }

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const incomingReferralCode =
        params.get('ref') || params.get('referral') || params.get('referralCode') || '';
      if (incomingReferralCode) {
        const normalizedReferralCode = incomingReferralCode.trim().toUpperCase();
        setReferralCode((currentValue) => currentValue || normalizedReferralCode);
      }
    }
  }, []);

  useEffect(() => {
    if (!emailVerifiedFor || normalizedEmail === emailVerifiedFor) {
      return;
    }

    setEmailVerificationToken('');
    setEmailVerificationId('');
    setEmailOtp('');
    setEmailOtpDevCode('');
    setEmailOtpStatus('Email changed. Please verify the new address.');
  }, [normalizedEmail, emailVerifiedFor]);

  // redirectToManagedLinkFlow removed — registration now always goes
  // directly through the backend /auth/register endpoint.

  const handleManagedSocialRegister = async (provider: ManagedOAuthProvider) => {
    const providerLabel = getManagedOAuthProviderLabel(provider);
    if (!isManagedRegister) {
      setError(`${providerLabel} sign-up is not configured here.`);
      return;
    }

    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      setManagedLinkHint({ provider });
      await signInWithManagedOAuth(provider);
    } catch (err) {
      clearManagedLinkHint();
      const message = err instanceof Error ? err.message : `Unable to start ${providerLabel} sign-up`;
      toast.error(message);
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestEmailOtp = async () => {
    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setEmailOtpError('Enter a valid email address before requesting OTP.');
      return;
    }

    setIsRequestingEmailOtp(true);
    setEmailOtpError('');
    setEmailOtpStatus('');
    setEmailOtpDevCode('');
    setEmailVerificationId('');
    try {
      // We use the same phone-otp endpoint but pass email so server delivers via Gmail
      const normalizedPhone = normalizeRegistrationPhone(phone) || '';
      const response = await apiRequest<{
        verificationToken: string;
        expiresInMinutes: number;
        devOtp?: string;
      }>('/workflow/public/phone-otp/request', {
        method: 'POST',
        body: JSON.stringify({
          phone: normalizedPhone,
          email: targetEmail,
          purpose: 'workflow',
        }),
      });

      setEmailVerificationToken(response.verificationToken);
      setEmailOtp('');
      setEmailOtpStatus(`OTP sent to ${targetEmail}. It expires in ${response.expiresInMinutes} minutes.`);
      setEmailOtpDevCode(response.devOtp || '');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send OTP';
      toast.error(message);
      setEmailOtpError(message);
    } finally {
      setIsRequestingEmailOtp(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!emailVerificationToken) {
      setEmailOtpError('Request OTP first.');
      return;
    }
    if (!/^\d{6}$/.test(emailOtp)) {
      setEmailOtpError('Enter the 6-digit OTP.');
      return;
    }

    setIsVerifyingEmailOtp(true);
    setEmailOtpError('');
    setEmailOtpStatus('');
    try {
      const normalizedPhone = normalizeRegistrationPhone(phone) || '+0000000000';
      const response = await apiRequest<{ verificationId: string }>(
        '/workflow/public/phone-otp/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            phone: normalizedPhone,
            verificationToken: emailVerificationToken,
            otp: emailOtp,
          }),
        }
      );

      setEmailVerificationId(response.verificationId);
      setEmailVerifiedFor(email.trim().toLowerCase());
      setEmailOtpDevCode('');
      setEmailOtpStatus('Email verified successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to verify OTP';
      toast.error(message);
      setEmailOtpError(message);
    } finally {
      setIsVerifyingEmailOtp(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-white text-brand-black overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 section-glow opacity-90" />
      <div className="absolute inset-0 futuristic-grid opacity-20" />
      <div className="absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full bg-brand-secondary/15 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 h-[460px] w-[460px] rounded-full bg-brand-primary/10 blur-3xl" />

      <div className="relative z-10 page-container min-h-screen flex items-center py-16">
        <div className="grid w-full items-center gap-10 lg:grid-cols-2">
          {/* Left Panel */}
          <div className="hidden lg:flex flex-col gap-8 animate-in fade-in slide-in-from-left-8 duration-700">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-brand-primary">
                Join ZDT Realty
              </span>
              <h1 className="text-5xl font-semibold leading-tight">
                Build your
                <span className="block accent-title">property command center</span>
              </h1>
              <p className="max-w-lg text-base text-brand-gray3">
                Create a profile to receive AI-curated listings and instant price
                updates.
              </p>
            </div>

            <div className="grid gap-4">
              {steps.map((step) => (
                <div
                  key={step.title}
                  className="flex items-start gap-3 rounded-xl border border-brand-gray2/60 bg-white/80 p-4 shadow-card"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-secondary/10 text-brand-primary">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-brand-black">{step.title}</p>
                    <p className="text-xs text-brand-gray3">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="relative overflow-hidden rounded-2xl shadow-card-hover">
              <img
                src="/images/service-apartments.jpg"
                alt="Apartments preview"
                className="h-56 w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-black/60 to-transparent" />
              <div className="absolute bottom-4 left-4 rounded-lg bg-white/90 px-4 py-2 text-sm font-semibold text-brand-black">
                Personalized alerts for every new listing
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="flex w-full justify-center lg:justify-end">
            <div className="w-full max-w-[420px] rounded-2xl border border-brand-gray2 bg-white/90 p-8 shadow-card-hover backdrop-blur-lg neon-card animate-in fade-in slide-in-from-bottom-8 duration-500">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-primary text-white font-bold">
                  ZDT
                </div>
                <span className="text-xs uppercase tracking-[0.2em] text-brand-gray3">
                  Create Profile
                </span>
              </div>

              <div className="mt-6 space-y-2">
                <h2 className="text-3xl font-semibold text-brand-black">Create account</h2>
                <p className="text-sm text-brand-gray3">
                  Set your preferences and start exploring listings.
                </p>
              </div>

              <form
                className="mt-8 space-y-5"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setError('');
                  setSuccess('');
                  setIsSubmitting(true);

                  try {
                    const normalizedName = name.trim();
                    const normalizedEmail = email.trim().toLowerCase();
                    const normalizedPhone = normalizeRegistrationPhone(phone);
                    const normalizedReferralCode = referralCode.trim().toUpperCase();

                    if (!termsAccepted) {
                      throw new Error('Please accept the Terms of Service and Privacy Policy to continue.');
                    }

                    if (!isEmailVerified) {
                      throw new Error('Please verify your email with OTP before creating the account.');
                    }

                    if (isManagedRegister) {
                      // ── Always register via the backend directly ──
                      // Supabase managed signup causes 504 timeouts and
                      // confusing "link account" flows. The backend
                      // /auth/register endpoint handles everything.
                    }

                    await apiRequest('/auth/register', {
                      method: 'POST',
                      body: JSON.stringify({
                        name: normalizedName,
                        email: normalizedEmail,
                        phone: normalizedPhone || undefined,
                        phoneVerificationId: emailVerificationId || undefined,
                        password,
                        deviceId: readOrCreateDeviceId(),
                        referralCode: normalizedReferralCode,
                      }),
                    });

                    clearManagedSignupHint();
                    setSuccess('Account created successfully! Please log in.');
                    toast.success('Account created successfully! Please log in.');
                    addNotification({
                      title: 'Account created',
                      message: normalizedEmail,
                      kind: 'success',
                      source: 'auth',
                    });
                    setTimeout(() => onSwitchToLogin(), 800);
                  } catch (err) {
                    const message = err instanceof Error ? err.message : 'Unable to create account';
                    toast.error(message);
                    setError(message);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              >
                <div className="space-y-2">
                  <label htmlFor="register-name" className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">
                    Full Name
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-gray3 group-focus-within:text-brand-primary">
                      <User className="h-5 w-5" />
                    </div>
                    <input
                      id="register-name"
                      type="text"
                      required
                      placeholder="Your name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="h-12 w-full rounded-xl border border-brand-gray2 bg-white pl-11 pr-4 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="register-email" className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">
                    Email Address
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-gray3 group-focus-within:text-brand-primary">
                      <Mail className="h-5 w-5" />
                    </div>
                    <input
                      id="register-email"
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setEmailOtpError('');
                      }}
                      className="h-12 w-full rounded-xl border border-brand-gray2 bg-white pl-11 pr-4 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                    />
                  </div>
                  <div className="rounded-xl border border-brand-gray2 bg-slate-50/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gray3">
                        Email OTP Verification
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          isEmailVerified
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {isEmailVerified ? 'Verified' : 'Not verified'}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="Enter 6-digit OTP"
                        value={emailOtp}
                        onChange={(event) =>
                          setEmailOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        className="h-11 w-full rounded-xl border border-brand-gray2 bg-white px-4 text-sm text-brand-black placeholder:text-brand-gray3/70 transition focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30"
                      />
                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        <button
                          type="button"
                          onClick={() => void handleRequestEmailOtp()}
                          disabled={isRequestingEmailOtp || !email.trim()}
                          className="h-11 rounded-xl border border-brand-primary/25 bg-white px-3 text-xs font-semibold text-brand-primary transition hover:border-brand-primary hover:text-brand-secondary disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isRequestingEmailOtp ? 'Sending...' : emailVerificationToken ? 'Resend' : 'Send OTP'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleVerifyEmailOtp()}
                          disabled={isVerifyingEmailOtp || isEmailVerified || !emailVerificationToken}
                          className="h-11 rounded-xl bg-brand-primary px-3 text-xs font-semibold text-white transition hover:bg-brand-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isEmailVerified ? 'Verified' : isVerifyingEmailOtp ? 'Checking...' : 'Verify'}
                        </button>
                      </div>
                    </div>

                    {import.meta.env.DEV && emailOtpDevCode ? (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                        Dev OTP: <span className="font-semibold">{emailOtpDevCode}</span>
                      </p>
                    ) : null}
                    {emailOtpStatus ? (
                      <p className="mt-2 text-[11px] font-medium text-emerald-700">{emailOtpStatus}</p>
                    ) : null}
                    {emailOtpError ? (
                      <p className="mt-2 text-[11px] font-medium text-red-600">{emailOtpError}</p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="register-phone" className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">
                    Phone (optional)
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-gray3 group-focus-within:text-brand-primary">
                      <Phone className="h-5 w-5" />
                    </div>
                    <input
                      id="register-phone"
                      type="tel"
                      placeholder="Your mobile number"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="h-12 w-full rounded-xl border border-brand-gray2 bg-white pl-11 pr-4 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">
                    Referral Code
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-gray3 group-focus-within:text-brand-primary">
                      <Gift className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      placeholder="Optional referral code"
                      value={referralCode}
                      onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                      className="h-12 w-full rounded-xl border border-brand-gray2 bg-white pl-11 pr-4 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                    />
                  </div>
                  <p className="text-[11px] text-brand-gray3">
                    Have a Dalal Coin invite? Add the code now to unlock referral rewards after your first qualifying order.
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="register-password" className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">
                    Password
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-gray3 group-focus-within:text-brand-primary">
                      <Lock className="h-5 w-5" />
                    </div>
                    <input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      placeholder="********"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-12 w-full rounded-xl border border-brand-gray2 bg-white pl-11 pr-12 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-brand-gray3 hover:text-brand-primary transition"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-brand-gray3">
                    Must be at least 8 characters. Use a mix of letters, numbers, and symbols for better security.
                  </p>
                </div>

                <label className="flex items-start gap-2 text-xs text-brand-gray3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                    className="accent-brand-primary mt-0.5 h-4 w-4 shrink-0"
                    required
                  />
                  <span>
                    I agree to the{' '}
                    <span className="font-semibold text-brand-primary">Terms of Service</span>
                    {' '}and{' '}
                    <span className="font-semibold text-brand-primary">Privacy Policy</span>
                  </span>
                </label>
                {!termsAccepted && error?.includes('Terms') ? (
                  <p className="text-[11px] text-red-500">You must accept the terms to create an account.</p>
                ) : null}

                <button
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-brand-primary py-3.5 text-sm font-semibold text-white shadow-glow transition-transform duration-200 hover:scale-[1.01] hover:bg-brand-primary-dark disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Creating Account...' : 'Create Account'}{' '}
                  <ArrowRight className="inline h-4 w-4 ml-1" />
                </button>
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
              </form>

              <ManagedOAuthButtons
                title="Or sign up with Google or GitHub"
                disabled={isSubmitting || !isManagedRegister}
                onSelect={(provider) => void handleManagedSocialRegister(provider)}
              />

              <p className="mt-6 text-center text-sm text-brand-gray3">
                Already have an account?{' '}
                <button
                  onClick={() => {
                    clearManagedSignupHint();
                    onSwitchToLogin();
                  }}
                  className="text-brand-primary font-semibold hover:text-brand-secondary transition"
                >
                  Log in
                </button>
              </p>
              <p className="mt-2 text-center text-xs text-brand-gray3">
                Dealer/Builder?{' '}
                <button
                  onClick={onOpenCompanyRegister}
                  className="font-semibold text-brand-primary transition hover:text-brand-secondary"
                >
                  Company register
                </button>
                {' '}or{' '}
                <button
                  onClick={onOpenCompanyLogin}
                  className="font-semibold text-brand-primary transition hover:text-brand-secondary"
                >
                  company login
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
