import { useEffect, useState } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Building2,
  MapPin,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import ManagedOAuthButtons from '../components/auth/ManagedOAuthButtons';
import { ApiError, apiRequest } from '../lib/http';
import { parseApiUser, saveSession, setSessionToken, type AuthUser } from '../lib/session';
import {
  clearManagedLinkHint,
  clearManagedSignupHint,
  getManagedAccessToken,
  getManagedOAuthProviderLabel,
  isSupabaseConfigured,
  ManagedAuthError,
  type ManagedOAuthProvider,
  readManagedLinkHint,
  requestManagedSignInLink,
  setManagedSignupHint,
  setManagedLinkHint,
  signOutManagedAuth,
  signInWithManagedOAuth,
  signInWithManagedPassword,
} from '../lib/supabase';

interface LoginProps {
  onBack: () => void;
  onSwitchToRegister: () => void;
  onOpenCompanyLogin: () => void;
  onOpenCompanyRegister: () => void;
  onForgotPassword: () => void;
  onLoginSuccess: (payload?: { token: string; user: AuthUser }) => void;
  mode?: 'user' | 'admin' | 'team';
}

interface LoginResponse {
  twoFactorRequired?: boolean;
  challengeToken?: string;
  message?: string;
  devOtp?: string;
  token?: string;
  user?: unknown;
}

interface TwoFactorResponse {
  message?: string;
  devOtp?: string;
}

interface ManagedLinkResponse {
  message?: string;
  provider?: string | null;
  user?: unknown;
}

function buildManagedAuthLabel(provider?: string | null) {
  const normalized = String(provider || '').trim().toLowerCase();
  if (normalized === 'google') {
    return 'Google';
  }
  if (normalized === 'github') {
    return 'GitHub';
  }
  if (normalized === 'supabase') {
    return 'Supabase';
  }
  return 'managed sign-in';
}

const perks = [
  {
    icon: MapPin,
    title: 'Locality Intelligence',
    description: 'Explore verified listings with smart location context.',
  },
  {
    icon: ShieldCheck,
    title: 'Trusted Inventory',
    description: 'Clean ownership trails and verified property data.',
  },
  {
    icon: Sparkles,
    title: 'AI Match Score',
    description: 'Listings tuned to your budget and lifestyle.',
  },
];

export default function Login({
  onBack,
  onSwitchToRegister,
  onOpenCompanyLogin,
  onOpenCompanyRegister,
  onForgotPassword,
  onLoginSuccess,
  mode = 'user',
}: LoginProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [requiresCompanyCode, setRequiresCompanyCode] = useState(false);
  const [requiresPromotionProof, setRequiresPromotionProof] = useState(mode !== 'user');
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState('');
  const [twoFactorOtp, setTwoFactorOtp] = useState('');
  const [twoFactorMessage, setTwoFactorMessage] = useState('');
  const [twoFactorDevOtp, setTwoFactorDevOtp] = useState('');
  const [isResendingTwoFactorOtp, setIsResendingTwoFactorOtp] = useState(false);
  const [useLegacyLinkFlow, setUseLegacyLinkFlow] = useState(false);
  const [managedLinkProvider, setManagedLinkProvider] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [showCreateManagedAccountAction, setShowCreateManagedAccountAction] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isTwoFactorStep = twoFactorChallengeToken.trim().length > 0;
  const isManagedPublicLogin = mode === 'user' && isSupabaseConfigured();
  const isLegacyLoginMode =
    mode !== 'user' || requiresCompanyCode || requiresPromotionProof || useLegacyLinkFlow;
  const accessLabel =
    mode === 'admin'
      ? 'Admin Login'
      : mode === 'team'
        ? 'Team Login'
        : useLegacyLinkFlow
          ? 'Account Linking'
          : 'Member Login';
  const headline =
    mode === 'admin'
      ? 'Admin access'
      : mode === 'team'
        ? 'Team access'
        : useLegacyLinkFlow
          ? 'Link your existing account'
          : 'Welcome back';
  const subheadline =
    mode === 'user'
      ? useLegacyLinkFlow
        ? `Sign in once with your old password to connect this account to ${buildManagedAuthLabel(
            managedLinkProvider
          )}.`
        : 'Log in to access your saved searches and alerts.'
      : 'Log in with your approved internal credentials.';

  useEffect(() => {
    if (mode !== 'user' || !isManagedPublicLogin) {
      return;
    }

    const hint = readManagedLinkHint();
    if (!hint) {
      return;
    }

    setUseLegacyLinkFlow(true);
    setManagedLinkProvider(hint.provider || 'supabase');
    if (hint.email) {
      setEmail((currentValue) => currentValue || hint.email);
    }
    setLinkNotice(
      `We found an existing account for this email. Sign in once with your old password, or use the recovery action below, to link it to ${buildManagedAuthLabel(
        hint.provider
      )}.`
    );
  }, [isManagedPublicLogin, mode]);

  const activateManagedLinkFlow = ({
    email: nextEmail,
    provider,
    message,
  }: {
    email?: string;
    provider?: string | null;
    message?: string;
  }) => {
    const normalizedEmail = String(nextEmail || '').trim().toLowerCase();
    const normalizedProvider = String(provider || 'supabase').trim().toLowerCase();
    const providerLabel = buildManagedAuthLabel(normalizedProvider);
    const nextMessage =
      message ||
      `We found an existing account for this email. Sign in once with your old password, or use the recovery action below, to link it to ${providerLabel}.`;

    setUseLegacyLinkFlow(true);
    setManagedLinkProvider(normalizedProvider);
    setRequiresCompanyCode(false);
    setRequiresPromotionProof(false);
    clearTwoFactorState();
    setShowCreateManagedAccountAction(false);
    setError('');
    setStatusMessage('');
    setLinkNotice(nextMessage);
    setSessionToken('');
    if (normalizedEmail) {
      setEmail(normalizedEmail);
    }
    setManagedLinkHint({
      email: normalizedEmail,
      provider: normalizedProvider,
    });
  };

  const clearManagedLinkState = () => {
    setUseLegacyLinkFlow(false);
    setManagedLinkProvider(null);
    setLinkNotice('');
    setStatusMessage('');
    setShowCreateManagedAccountAction(false);
    clearManagedLinkHint();
  };

  const finalizeManagedLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    clearManagedLinkHint();
    clearManagedSignupHint();
    const managedResult = await signInWithManagedPassword({
      email: normalizedEmail,
      password,
    });
    const authToken = String(managedResult.session?.access_token || '').trim();
    if (!authToken) {
      throw new Error('Managed sign-in succeeded but no access token was returned.');
    }

    setSessionToken(authToken);
    const response = await apiRequest<{ user: unknown }>('/auth/me', {}, authToken);
    const authUser = parseApiUser(response.user);
    if (!authUser) {
      throw new Error('Managed sign-in succeeded but user sync failed.');
    }

    saveSession(authToken, authUser);
    return { token: authToken, user: authUser };
  };

  const attemptLegacyPasswordLogin = async ({
    shouldSendCompanyCode,
    shouldSendPromotionProof,
  }: {
    shouldSendCompanyCode: boolean;
    shouldSendPromotionProof: boolean;
  }) => {
    const payload: Record<string, string> = {
      email: email.trim().toLowerCase(),
      password,
    };
    if (mode === 'admin') {
      payload.role = 'admin';
    }
    if (mode === 'team') {
      payload.role = 'team_member';
    }
    if (shouldSendCompanyCode) {
      payload.companyCode = companyCode.trim().toUpperCase();
    }
    if (shouldSendPromotionProof) {
      payload.referenceId = referenceId.trim();
      payload.registrationNumber = registrationNumber.trim().toUpperCase();
    }

    const response = await apiRequest<LoginResponse>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'session'
    );

    if (response.twoFactorRequired) {
      if (!response.challengeToken) {
        throw new Error('Two-step challenge could not be started. Try again.');
      }
      setTwoFactorChallengeToken(response.challengeToken);
      setTwoFactorOtp('');
      setTwoFactorMessage(
        response.message || 'Enter the 6-digit verification code sent to your email.'
      );
      setTwoFactorDevOtp(typeof response.devOtp === 'string' ? response.devOtp : '');
      return null;
    }

    const authToken = String(response.token || '').trim();
    const authUser = parseApiUser(response.user);
    if (!authToken || !authUser) {
      throw new Error('Login succeeded but session data is missing. Please try again.');
    }

    return { token: authToken, user: authUser };
  };

  const finalizeLegacyLogin = async (authToken: string, authUser: AuthUser) => {
    if (mode !== 'user' || !useLegacyLinkFlow) {
      clearManagedSignupHint();
      saveSession(authToken, authUser);
      setCompanyCode('');
      setRequiresCompanyCode(false);
      setRequiresPromotionProof(false);
      setReferenceId('');
      setRegistrationNumber('');
      onLoginSuccess({ token: authToken, user: authUser });
      return;
    }

    const managedToken = String(await getManagedAccessToken()).trim();
    if (!managedToken) {
      throw new Error(
        `Your ${buildManagedAuthLabel(
          managedLinkProvider
        )} session expired. Sign in with ${buildManagedAuthLabel(
          managedLinkProvider
        )} again to finish linking.`
      );
    }

    const linkResponse = await apiRequest<ManagedLinkResponse>(
      '/auth/managed/link',
      {
        method: 'POST',
        headers: {
          'X-Managed-Auth-Token': managedToken,
        },
      },
      authToken
    );

    let linkedUser: AuthUser | null = null;
    try {
      const response = await apiRequest<{ user: unknown }>('/auth/me', {}, managedToken);
      linkedUser = parseApiUser(response.user);
    } catch {
      const fallbackUser = parseApiUser(linkResponse.user);
      linkedUser = fallbackUser
        ? {
            ...fallbackUser,
            authStrategy: 'managed',
            managedAuthProvider:
              linkResponse.provider || fallbackUser.managedAuthProvider || managedLinkProvider || 'supabase',
          }
        : null;
    }

    if (!linkedUser) {
      throw new Error('Account linked, but the new managed session could not be started. Sign in again.');
    }

    clearManagedLinkState();
    clearManagedSignupHint();
    saveSession(managedToken, linkedUser);
    setCompanyCode('');
    setRequiresCompanyCode(false);
    setRequiresPromotionProof(false);
    setReferenceId('');
    setRegistrationNumber('');
    onLoginSuccess({ token: managedToken, user: linkedUser });
  };

  const finalizeManagedRecoveryLink = async () => {
    const managedToken = String(await getManagedAccessToken()).trim();
    if (!managedToken) {
      throw new Error(
        `Your ${buildManagedAuthLabel(
          managedLinkProvider
        )} session expired. Sign in with ${buildManagedAuthLabel(
          managedLinkProvider
        )} again to continue.`
      );
    }

    const linkResponse = await apiRequest<ManagedLinkResponse>(
      '/auth/managed/link/recover',
      {
        method: 'POST',
        headers: {
          'X-Managed-Auth-Token': managedToken,
        },
        body: JSON.stringify({
          confirmation: 'link_existing_account',
        }),
      },
      'session'
    );

    let linkedUser: AuthUser | null = null;
    try {
      const response = await apiRequest<{ user: unknown }>('/auth/me', {}, managedToken);
      linkedUser = parseApiUser(response.user);
    } catch {
      const fallbackUser = parseApiUser(linkResponse.user);
      linkedUser = fallbackUser
        ? {
            ...fallbackUser,
            authStrategy: 'managed',
            managedAuthProvider:
              linkResponse.provider || fallbackUser.managedAuthProvider || managedLinkProvider || 'supabase',
          }
        : null;
    }

    if (!linkedUser) {
      throw new Error('Account linked, but the new managed session could not be started. Sign in again.');
    }

    clearManagedLinkState();
    saveSession(managedToken, linkedUser);
    setCompanyCode('');
    setRequiresCompanyCode(false);
    setRequiresPromotionProof(false);
    setReferenceId('');
    setRegistrationNumber('');
    onLoginSuccess({ token: managedToken, user: linkedUser });
  };

  const handleManagedSocialLogin = async (provider: ManagedOAuthProvider) => {
    const providerLabel = getManagedOAuthProviderLabel(provider);
    if (mode !== 'user' || !isManagedPublicLogin) {
      setError(`${providerLabel} sign-in is not configured here.`);
      return;
    }

    setError('');
    setLinkNotice('');
    setStatusMessage('');
    setShowCreateManagedAccountAction(false);
    setIsSubmitting(true);
    try {
      setManagedLinkHint({ provider });
      await signInWithManagedOAuth(provider);
    } catch (err) {
      clearManagedLinkHint();
      const message = err instanceof Error ? err.message : `Unable to start ${providerLabel} sign-in`;
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendSignInLink = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address first.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setStatusMessage('');
    setShowCreateManagedAccountAction(false);
    try {
      await requestManagedSignInLink(normalizedEmail);
      setStatusMessage('Sign-in link sent. Open the email and come back here to finish logging in.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send the sign-in link';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateManagedAccount = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address first.');
      return;
    }

    setManagedSignupHint(normalizedEmail);
    setStatusMessage('');
    setError('');
    onSwitchToRegister();
  };

  const clearTwoFactorState = () => {
    setTwoFactorChallengeToken('');
    setTwoFactorOtp('');
    setTwoFactorMessage('');
    setTwoFactorDevOtp('');
    setIsResendingTwoFactorOtp(false);
  };

  const handleUseDifferentManagedAccount = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      await signOutManagedAuth();
      clearManagedLinkState();
      setSessionToken('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to reset the managed session';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecoverExistingAccount = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      await finalizeManagedRecoveryLink();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to recover and link the existing account';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendTwoFactorOtp = async () => {
    if (!isTwoFactorStep) {
      return;
    }

    setError('');
    setIsResendingTwoFactorOtp(true);
    try {
      const response = await apiRequest<TwoFactorResponse>('/auth/login/resend-2fa', {
        method: 'POST',
        body: JSON.stringify({
          challengeToken: twoFactorChallengeToken,
        }),
      }, 'session');
      setTwoFactorMessage(response.message || 'A new verification code was sent.');
      setTwoFactorDevOtp(typeof response.devOtp === 'string' ? response.devOtp : '');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to resend verification code';
      setError(message);
    } finally {
      setIsResendingTwoFactorOtp(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-white text-brand-black overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 section-glow opacity-90" />
      <div className="absolute inset-0 futuristic-grid opacity-20" />
      <div className="absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-brand-secondary/15 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-[460px] w-[460px] rounded-full bg-brand-primary/10 blur-3xl" />

      <div className="relative z-10 page-container min-h-screen flex items-center py-16">
        <div className="grid w-full items-center gap-10 lg:grid-cols-2">
          {/* Left Panel */}
          <div className="hidden lg:flex flex-col gap-8 animate-in fade-in slide-in-from-left-8 duration-700">
            <button
              onClick={onBack}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-brand-gray2 bg-white/70 px-4 py-2 text-sm font-medium text-brand-gray3 hover:text-brand-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Website
            </button>

            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-brand-primary">
                ZDT Realty Access
              </span>
              <h1 className="text-5xl font-semibold leading-tight">
                Sign in to
                <span className="block accent-title">smarter property search</span>
              </h1>
              <p className="max-w-lg text-base text-brand-gray3">
                Keep your favorites, track market movement, and let AI refine your
                next shortlist.
              </p>
            </div>

            <div className="grid gap-4">
              {perks.map((perk) => (
                <div
                  key={perk.title}
                  className="flex items-start gap-3 rounded-xl border border-brand-gray2/60 bg-white/80 p-4 shadow-card"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-secondary/10 text-brand-primary">
                    <perk.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-brand-black">{perk.title}</p>
                    <p className="text-xs text-brand-gray3">{perk.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="relative overflow-hidden rounded-2xl shadow-card-hover">
              <img
                src="/images/hero-bg.jpg"
                alt="Luxury property preview"
                className="h-56 w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-black/60 to-transparent" />
              <div className="absolute bottom-4 left-4 rounded-lg bg-white/90 px-4 py-2 text-sm font-semibold text-brand-black">
                50K+ verified listings across India
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="flex w-full justify-center lg:justify-end">
            <div className="w-full max-w-[420px] rounded-2xl border border-brand-gray2 bg-white/90 p-8 shadow-card-hover backdrop-blur-lg neon-card animate-in fade-in slide-in-from-bottom-8 duration-500">
              <button
                onClick={onBack}
                className="lg:hidden mb-6 inline-flex items-center gap-2 text-sm text-brand-gray3 hover:text-brand-primary"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>

              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-primary text-white font-bold">
                  ZDT
                </div>
                <span className="text-xs uppercase tracking-[0.2em] text-brand-gray3">
                  {accessLabel}
                </span>
              </div>

              <div className="mt-6 space-y-2">
                <h2 className="text-3xl font-semibold text-brand-black">{headline}</h2>
                <p className="text-sm text-brand-gray3">
                  {subheadline}
                </p>
              </div>

              {linkNotice ? (
                <div className="mt-6 rounded-xl border border-brand-primary/25 bg-brand-primary/5 p-4 text-sm text-brand-gray3">
                  {linkNotice}
                </div>
              ) : null}

              <form
                className="mt-8 space-y-5"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setError('');
                  setStatusMessage('');
                  setShowCreateManagedAccountAction(false);
                  if (!useLegacyLinkFlow) {
                    setLinkNotice('');
                  }
                  setIsSubmitting(true);

                  try {
                    if (isTwoFactorStep) {
                      const normalizedOtp = twoFactorOtp.trim();
                      if (!/^\d{6}$/.test(normalizedOtp)) {
                        setError('Enter the 6-digit verification code.');
                        return;
                      }

                      const verifyResponse = await apiRequest<LoginResponse>('/auth/login/verify-2fa', {
                        method: 'POST',
                        body: JSON.stringify({
                          challengeToken: twoFactorChallengeToken,
                          otp: normalizedOtp,
                        }),
                      }, 'session');

                      const verifiedToken = String(verifyResponse.token || '').trim();
                      const verifiedUser = parseApiUser(verifyResponse.user);
                      if (!verifiedToken || !verifiedUser) {
                        throw new Error('Login session could not be finalized. Please try again.');
                      }

                      clearTwoFactorState();
                      await finalizeLegacyLogin(verifiedToken, verifiedUser);
                      return;
                    }

                    const shouldSendPromotionProof =
                      requiresPromotionProof ||
                      referenceId.trim().length > 0 ||
                      registrationNumber.trim().length > 0;
                    const shouldSendCompanyCode =
                      requiresCompanyCode || companyCode.trim().length > 0;

                    if (!isLegacyLoginMode && isManagedPublicLogin) {
                      try {
                        const managedPayload = await finalizeManagedLogin();
                        clearManagedLinkState();
                        setLinkNotice('');
                        setCompanyCode('');
                        setRequiresCompanyCode(false);
                        setRequiresPromotionProof(false);
                        setReferenceId('');
                        setRegistrationNumber('');
                        onLoginSuccess(managedPayload);
                        return;
                      } catch (managedError) {
                        const managedErrorMessage =
                          managedError instanceof Error ? managedError.message : String(managedError || '');
                        const shouldTryLegacyPasswordFallback =
                          (managedError instanceof ManagedAuthError &&
                            managedError.code === 'managed_auth_network_error') ||
                          /invalid login credentials/i.test(managedErrorMessage);

                        if (shouldTryLegacyPasswordFallback) {
                          const fallbackStatusMessage =
                            managedError instanceof ManagedAuthError &&
                            managedError.code === 'managed_auth_network_error'
                              ? 'Managed sign-in is unavailable. Trying your legacy password instead.'
                              : 'That password did not match your managed sign-in. Trying your existing ZDT password instead.';

                          setStatusMessage(fallbackStatusMessage);
                          try {
                            const legacyPayload = await attemptLegacyPasswordLogin({
                              shouldSendCompanyCode,
                              shouldSendPromotionProof,
                            });
                            if (!legacyPayload) {
                              return;
                            }
                            setStatusMessage('');
                            await finalizeLegacyLogin(legacyPayload.token, legacyPayload.user);
                            return;
                          } catch (legacyError) {
                            setStatusMessage('');

                            const legacyErrorMessage =
                              legacyError instanceof Error ? legacyError.message : String(legacyError || '');
                            if (/invalid email or password/i.test(legacyErrorMessage)) {
                              setManagedSignupHint(email);
                              setShowCreateManagedAccountAction(true);
                              throw new Error(
                                'We could not sign you in with either your managed password or your old ZDT password. If you have not created a managed account for this email yet, create one first, or use the sign-in link after that account exists.'
                              );
                            }

                            throw legacyError;
                          }
                        }

                        throw managedError;
                      }
                    }

                    const legacyPayload = await attemptLegacyPasswordLogin({
                      shouldSendCompanyCode,
                      shouldSendPromotionProof,
                    });
                    if (!legacyPayload) {
                      return;
                    }

                    await finalizeLegacyLogin(legacyPayload.token, legacyPayload.user);
                  } catch (err) {
                    if (
                      err instanceof ApiError &&
                      err.code === 'managed_auth_link_required' &&
                      mode === 'user'
                    ) {
                      activateManagedLinkFlow({
                        email,
                        provider: err.provider,
                        message: `This ${buildManagedAuthLabel(
                          err.provider
                        )} account matches an existing ZDT Realty account. Sign in once with your old password to finish linking.`,
                      });
                      return;
                    }

                    if (
                      err instanceof ApiError &&
                      err.code === 'managed_auth_required' &&
                      mode === 'user'
                    ) {
                      setShowCreateManagedAccountAction(false);
                      setStatusMessage(
                        `This email now signs in through ${buildManagedAuthLabel(
                          err.provider
                        )}. Use your managed password, Google, or the sign-in link below.`
                      );
                    }

                    let message = err instanceof Error ? err.message : 'Unable to sign in';
                    if (
                      mode === 'user' &&
                      isManagedPublicLogin &&
                      !useLegacyLinkFlow &&
                      !isTwoFactorStep &&
                      /invalid login credentials/i.test(message)
                    ) {
                      message =
                        'This login now checks your managed sign-in password. If this is your old ZDT password, create a managed account with the same email first, or use the sign-in link after your managed account exists.';
                      setManagedSignupHint(email);
                      setShowCreateManagedAccountAction(true);
                    }
                    if (
                      !isTwoFactorStep &&
                      message.toLowerCase().includes('requires reference id') &&
                      message.toLowerCase().includes('registration number')
                    ) {
                      setRequiresPromotionProof(true);
                    }
                    if (
                      !isTwoFactorStep &&
                      (message.toLowerCase().includes('requires company register number') ||
                        message.toLowerCase().includes('invalid company register number'))
                    ) {
                      setRequiresCompanyCode(true);
                    }
                    setError(message);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              >
                {isTwoFactorStep ? (
                  <div className="rounded-xl border border-brand-secondary/30 bg-brand-secondary/10 p-4 space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-gray3">
                      Admin Two-Step Verification
                    </p>
                    <p className="text-xs text-brand-gray3">
                      {twoFactorMessage || 'Enter the 6-digit verification code sent to your email.'}
                    </p>
                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gray3">
                        Verification Code
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="\d{6}"
                        maxLength={6}
                        placeholder="123456"
                        value={twoFactorOtp}
                        onChange={(event) =>
                          setTwoFactorOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        className="h-11 w-full rounded-xl border border-brand-gray2 bg-white px-4 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                      />
                    </div>
                    {twoFactorDevOtp ? (
                      <p className="text-[11px] text-brand-gray3">
                        Dev OTP: <span className="font-semibold text-brand-black">{twoFactorDevOtp}</span>
                      </p>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => void handleResendTwoFactorOtp()}
                        disabled={isResendingTwoFactorOtp || isSubmitting}
                        className="text-xs font-semibold text-brand-primary hover:text-brand-secondary transition disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {isResendingTwoFactorOtp ? 'Resending...' : 'Resend code'}
                      </button>
                      <button
                        type="button"
                        onClick={clearTwoFactorState}
                        disabled={isSubmitting}
                        className="text-xs font-semibold text-brand-gray3 hover:text-brand-primary transition disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        Back to password login
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
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
                          placeholder="name@example.com"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className="h-12 w-full rounded-xl border border-brand-gray2 bg-white pl-11 pr-4 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">
                          Password
                        </label>
                        {useLegacyLinkFlow ? (
                          <span className="text-xs text-brand-gray3">
                            Legacy password required once
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={onForgotPassword}
                            className="text-xs text-brand-primary hover:text-brand-secondary transition"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-gray3 group-focus-within:text-brand-primary">
                          <Lock className="h-5 w-5" />
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
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

                    {requiresCompanyCode ? (
                      <div className="rounded-xl border border-brand-secondary/30 bg-brand-secondary/10 p-3 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-gray3">
                          Dealer/Builder Company Verification
                        </p>
                        <div className="space-y-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gray3">
                            Company Register Number
                          </label>
                          <input
                            type="text"
                            placeholder="Enter company register number"
                            value={companyCode}
                            onChange={(event) => setCompanyCode(event.target.value.toUpperCase())}
                            className="h-11 w-full rounded-xl border border-brand-gray2 bg-white px-4 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                          />
                        </div>
                      </div>
                    ) : null}

                    {requiresPromotionProof ? (
                      <div className="rounded-xl border border-brand-secondary/30 bg-brand-secondary/10 p-3 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-gray3">
                          Promoted Staff Verification
                        </p>
                        <div className="space-y-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gray3">
                            Reference ID
                          </label>
                          <input
                            type="text"
                            placeholder="Enter reference ID"
                            value={referenceId}
                            onChange={(event) => setReferenceId(event.target.value)}
                            className="h-11 w-full rounded-xl border border-brand-gray2 bg-white px-4 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gray3">
                            Registration Number
                          </label>
                          <input
                            type="text"
                            placeholder="Enter registration number"
                            value={registrationNumber}
                            onChange={(event) => setRegistrationNumber(event.target.value)}
                            className="h-11 w-full rounded-xl border border-brand-gray2 bg-white px-4 text-sm text-brand-black placeholder:text-brand-gray3/70 focus:outline-none focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/30 transition"
                          />
                        </div>
                      </div>
                    ) : null}

                    {!requiresPromotionProof && !useLegacyLinkFlow ? (
                      <div className="text-right">
                        <button
                          type="button"
                          onClick={() => setRequiresPromotionProof(true)}
                          className="text-xs font-semibold text-brand-primary hover:text-brand-secondary transition"
                        >
                          I was promoted (Admin/Team)
                        </button>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between text-xs text-brand-gray3">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="accent-brand-primary" />
                        Remember me
                      </label>
                      <span>Secure session</span>
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-brand-primary py-3.5 text-sm font-semibold text-white shadow-glow transition-transform duration-200 hover:scale-[1.01] hover:bg-brand-primary-dark disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSubmitting
                    ? isTwoFactorStep
                      ? 'Verifying...'
                      : useLegacyLinkFlow
                        ? 'Linking...'
                        : 'Signing In...'
                    : isTwoFactorStep
                      ? 'Verify & Sign In'
                      : useLegacyLinkFlow
                        ? 'Link & Sign In'
                        : 'Sign In'}{' '}
                  <ArrowRight className="inline h-4 w-4 ml-1" />
                </button>
                {mode === 'user' && isManagedPublicLogin && !useLegacyLinkFlow && !isTwoFactorStep ? (
                  <button
                    type="button"
                    onClick={() => void handleSendSignInLink()}
                    disabled={isSubmitting}
                    className="w-full rounded-xl border border-brand-primary/25 bg-white py-3 text-sm font-semibold text-brand-primary transition hover:border-brand-primary hover:text-brand-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Email Me A Sign-In Link
                  </button>
                ) : null}
                {error ? (
                  <p className="text-xs text-red-500" role="alert">
                    {error}
                  </p>
                ) : null}
                {showCreateManagedAccountAction ? (
                  <button
                    type="button"
                    onClick={handleCreateManagedAccount}
                    className="w-full rounded-xl border border-brand-primary/25 bg-brand-primary/5 py-3 text-sm font-semibold text-brand-primary transition hover:border-brand-primary hover:text-brand-secondary"
                  >
                    Create Managed Account With This Email
                  </button>
                ) : null}
                {statusMessage ? (
                  <p className="text-xs text-emerald-600" role="status">
                    {statusMessage}
                  </p>
                ) : null}
              </form>

              {useLegacyLinkFlow ? (
                <div className="mt-6 rounded-xl border border-brand-gray2 bg-brand-secondary/5 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-brand-gray3">
                    Recovery Options
                  </p>
                  <p className="mt-2 text-sm text-brand-gray3">
                    If you no longer remember the old password, you can recover the matching public
                    account directly from this verified {buildManagedAuthLabel(managedLinkProvider)} session.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRecoverExistingAccount()}
                      disabled={isSubmitting}
                      className="inline-flex items-center rounded-lg border border-brand-primary/30 bg-white px-3 py-2 text-xs font-semibold text-brand-primary transition hover:border-brand-primary hover:text-brand-secondary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      I forgot my old password
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleUseDifferentManagedAccount()}
                      disabled={isSubmitting}
                      className="inline-flex items-center rounded-lg border border-brand-primary/30 bg-white px-3 py-2 text-xs font-semibold text-brand-primary transition hover:border-brand-primary hover:text-brand-secondary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Use a different managed account
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <ManagedOAuthButtons
                    title="Continue with Google or GitHub"
                    disabled={isSubmitting || mode !== 'user' || !isManagedPublicLogin}
                    onSelect={(provider) => void handleManagedSocialLogin(provider)}
                  />
                </>
              )}

              <p className="mt-6 text-center text-sm text-brand-gray3">
                New here?{' '}
                <button
                  onClick={onSwitchToRegister}
                  className="text-brand-primary font-semibold hover:text-brand-secondary transition"
                >
                  Create an account
                </button>
              </p>

              <div className="mt-4 rounded-xl border border-brand-secondary/25 bg-brand-secondary/5 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-brand-gray3">
                  Dealer or Builder
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={onOpenCompanyLogin}
                    className="inline-flex items-center gap-2 rounded-lg border border-brand-primary/30 bg-white px-3 py-2 text-xs font-semibold text-brand-primary transition hover:border-brand-primary hover:text-brand-secondary"
                  >
                    <Building2 className="h-4 w-4" />
                    Company Login
                  </button>
                  <button
                    onClick={onOpenCompanyRegister}
                    className="inline-flex items-center gap-2 rounded-lg border border-brand-primary/30 bg-white px-3 py-2 text-xs font-semibold text-brand-primary transition hover:border-brand-primary hover:text-brand-secondary"
                  >
                    <Building2 className="h-4 w-4" />
                    Company Register
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
