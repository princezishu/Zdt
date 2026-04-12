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
import { ApiError, apiRequest } from '@/lib/http';
import { parseApiUser, readOrCreateDeviceId, saveSession, type AuthUser } from '@/lib/session';
import {
  clearManagedLinkHint,
  clearManagedSignupHint,
  getManagedOAuthProviderLabel,
  isSupabaseConfigured,
  type ManagedOAuthProvider,
  readManagedSignupHint,
  signInWithManagedOAuth,
  signUpWithManagedPassword,
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
  onRegisterSuccess,
}: RegisterProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isManagedRegister = isSupabaseConfigured();

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

  const redirectToManagedLinkFlow = (normalizedEmail: string, provider?: string | null) => {
    clearManagedSignupHint();
    setManagedLinkHint({
      email: normalizedEmail,
      provider: provider || 'supabase',
    });
    const message =
      'Managed sign-in created. Go to login to link this email with your existing account.';
    toast.success(message);
    setSuccess(message);
    setTimeout(() => onSwitchToLogin(), 900);
  };

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
                    const normalizedPhone = phone.trim();
                    const normalizedReferralCode = referralCode.trim().toUpperCase();

                    if (isManagedRegister) {
                      const managedResult = await signUpWithManagedPassword({
                        name: normalizedName,
                        email: normalizedEmail,
                        phone: normalizedPhone,
                        password,
                      });

                      const authToken = String(managedResult.session?.access_token || '').trim();
                      if (authToken) {
                        try {
                          const response = await apiRequest<{ user: unknown }>('/auth/me', {}, authToken);
                          const authUser = parseApiUser(response.user);
                          if (!authUser) {
                            throw new Error('Managed sign-up succeeded but user sync failed.');
                          }
                          saveSession(authToken, authUser);
                          toast.success('Account created. Signed in successfully.');
                          onRegisterSuccess({ token: authToken, user: authUser });
                          return;
                        } catch (err) {
                          if (
                            err instanceof ApiError &&
                            err.code === 'managed_auth_link_required'
                          ) {
                            redirectToManagedLinkFlow(normalizedEmail, err.provider);
                            return;
                          }

                          throw err;
                        }
                      }

                      clearManagedSignupHint();
                      setSuccess('Account created. Check your email to confirm your address, then log in.');
                      toast.success('Account created. Check your email to confirm your address.');
                      addNotification({
                        title: 'Account created',
                        message: `${normalizedEmail} is waiting for email confirmation.`,
                        kind: 'success',
                        source: 'auth',
                      });
                      setTimeout(() => onSwitchToLogin(), 1000);
                      return;
                    }

                    await apiRequest('/auth/register', {
                      method: 'POST',
                      body: JSON.stringify({
                        name: normalizedName,
                        email: normalizedEmail,
                        phone: normalizedPhone,
                        password,
                        deviceId: readOrCreateDeviceId(),
                        referralCode: normalizedReferralCode,
                      }),
                    });

                    clearManagedSignupHint();
                    setSuccess('Account created. Please log in.');
                    toast.success('Account created. Please log in.');
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
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">
                    Full Name
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-gray3 group-focus-within:text-brand-primary">
                      <User className="h-5 w-5" />
                    </div>
                    <input
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
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">
                    Email Address
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-gray3 group-focus-within:text-brand-primary">
                      <Mail className="h-5 w-5" />
                    </div>
                    <input
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-12 w-full rounded-xl border border-brand-gray2 bg-white pl-11 pr-4 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">
                    Phone
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-gray3 group-focus-within:text-brand-primary">
                      <Phone className="h-5 w-5" />
                    </div>
                    <input
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
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">
                    Password
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-gray3 group-focus-within:text-brand-primary">
                      <Lock className="h-5 w-5" />
                    </div>
                    <input
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
                </div>

                <label className="flex items-center gap-2 text-xs text-brand-gray3">
                  <input type="checkbox" className="accent-brand-primary" /> I agree
                  to the Terms and Privacy Policy
                </label>

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
