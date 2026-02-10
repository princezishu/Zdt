import { useState } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  MapPin,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface LoginProps {
  onBack: () => void;
  onSwitchToRegister: () => void;
  onLoginSuccess: () => void;
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

export default function Login({ onBack, onSwitchToRegister, onLoginSuccess }: LoginProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

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
                  Member Login
                </span>
              </div>

              <div className="mt-6 space-y-2">
                <h2 className="text-3xl font-semibold text-brand-black">Welcome back</h2>
                <p className="text-sm text-brand-gray3">
                  Log in to access your saved searches and alerts.
                </p>
              </div>

              <form
                className="mt-8 space-y-5"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setError('');
                  setIsSubmitting(true);

                  try {
                    const response = await fetch(`${apiUrl}/auth/login`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email, password }),
                    });

                    const data = await response.json();

                    if (!response.ok) {
                      throw new Error(data?.error || 'Unable to sign in');
                    }

                    if (data?.token) {
                      localStorage.setItem('authToken', data.token);
                    }

                    onLoginSuccess();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Unable to sign in');
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              >
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
                    <a
                      href="#"
                      className="text-xs text-brand-primary hover:text-brand-secondary transition"
                    >
                      Forgot password?
                    </a>
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

                <div className="flex items-center justify-between text-xs text-brand-gray3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="accent-brand-primary" />
                    Remember me
                  </label>
                  <span>Secure session</span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-brand-primary py-3.5 text-sm font-semibold text-white shadow-glow transition-transform duration-200 hover:scale-[1.01] hover:bg-brand-primary-dark disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Signing In...' : 'Sign In'}{' '}
                  <ArrowRight className="inline h-4 w-4 ml-1" />
                </button>
                {error ? (
                  <p className="text-xs text-red-500" role="alert">
                    {error}
                  </p>
                ) : null}
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-brand-gray2" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-3 text-xs uppercase tracking-[0.2em] text-brand-gray3">
                    Continue with
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button className="flex items-center justify-center gap-2 rounded-xl border border-brand-gray2 bg-white py-3 text-xs font-semibold text-brand-gray3 transition hover:border-brand-primary hover:text-brand-primary">
                  <img
                    src="https://www.svgrepo.com/show/475656/google-color.svg"
                    className="h-5 w-5"
                    alt="Google"
                  />
                  Google
                </button>
                <button className="flex items-center justify-center gap-2 rounded-xl border border-brand-gray2 bg-white py-3 text-xs font-semibold text-brand-gray3 transition hover:border-brand-primary hover:text-brand-primary">
                  <img
                    src="https://www.svgrepo.com/show/448234/apple.svg"
                    className="h-5 w-5"
                    alt="Apple"
                  />
                  Apple
                </button>
              </div>

              <p className="mt-6 text-center text-sm text-brand-gray3">
                New here?{' '}
                <button
                  onClick={onSwitchToRegister}
                  className="text-brand-primary font-semibold hover:text-brand-secondary transition"
                >
                  Create an account
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
