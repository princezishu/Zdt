import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Instagram, Youtube, Linkedin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/http';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface FooterProps {
  onOpenHome: () => void;
  onOpenAbout: () => void;
  onOpenBlog: () => void;
  onOpenPress: () => void;
  onOpenCareer: () => void;
  onOpenHelpCenter: () => void;
  onOpenContact: () => void;
  onOpenFaq: () => void;
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
  onOpenCookies: () => void;
  onOpenSecurity: () => void;
  onOpenBuy: () => void;
  onOpenSell: () => void;
  onOpenRent: () => void;
  onOpenInvest: () => void;
}

const SUPPORT_EMAIL = 'zdtrealty@gmail.com';
const WHATSAPP_PLACEHOLDER = '+91 76768 15237';
const SUPPORT_HOURS_PLACEHOLDER = 'Mon-Sat, 9:30 AM - 7:00 PM IST';
const REPLY_TIME_PLACEHOLDER = 'Usually within 2-6 business hours';
const STARTUP_SUPPORT_NOTE = 'Friendly support. No spam. No forced follow-ups.';
const NEWSLETTER_HELPER_TEXT =
  'Get important updates on new listings, platform features, and verification improvements.';

const socialLinks = [
  {
    icon: Instagram,
    href: 'https://www.instagram.com/zdt_realty?igsh=MThhN3lsbWg4eTBzcA==',
    label: 'Instagram',
  },
  { icon: Youtube, href: '#', label: 'YouTube' },
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
];

type FooterLinkItem = {
  label: string;
  action: () => void;
};

export default function Footer({
  onOpenHome,
  onOpenAbout,
  onOpenBlog,
  onOpenPress,
  onOpenCareer,
  onOpenHelpCenter,
  onOpenContact,
  onOpenFaq,
  onOpenPrivacy,
  onOpenTerms,
  onOpenCookies,
  onOpenSecurity,
  onOpenBuy,
  onOpenSell,
  onOpenRent,
  onOpenInvest,
}: FooterProps) {
  const footerRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState<'success' | 'error'>('success');

  const companyLinks = useMemo<FooterLinkItem[]>(
    () => [
      { label: 'About', action: onOpenAbout },
      { label: 'Blog', action: onOpenBlog },
      { label: 'Press', action: onOpenPress },
      { label: 'Career', action: onOpenCareer },
    ],
    [onOpenAbout, onOpenBlog, onOpenPress, onOpenCareer]
  );

  const supportLinks = useMemo<FooterLinkItem[]>(
    () => [
      { label: 'Help Center', action: onOpenHelpCenter },
      { label: 'Contact', action: onOpenContact },
      { label: 'FAQ', action: onOpenFaq },
      { label: 'Feedback', action: onOpenContact },
    ],
    [onOpenHelpCenter, onOpenContact, onOpenFaq]
  );

  const legalLinks = useMemo<FooterLinkItem[]>(
    () => [
      { label: 'Privacy', action: onOpenPrivacy },
      { label: 'Terms', action: onOpenTerms },
      { label: 'Cookies', action: onOpenCookies },
      { label: 'Security', action: onOpenSecurity },
    ],
    [onOpenPrivacy, onOpenTerms, onOpenCookies, onOpenSecurity]
  );

  const serviceLinks = useMemo<FooterLinkItem[]>(
    () => [
      { label: 'Buy', action: onOpenBuy },
      { label: 'Sell', action: onOpenSell },
      { label: 'Rent', action: onOpenRent },
      { label: 'Invest', action: onOpenInvest },
    ],
    [onOpenBuy, onOpenSell, onOpenRent, onOpenInvest]
  );

  useEffect(() => {
    const ctx = gsap.context(() => {
      const elements = footerRef.current?.querySelectorAll('.footer-animate');
      if (!elements) return;

      gsap.fromTo(
        elements,
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          stagger: 0.08,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: footerRef.current,
            start: 'top 90%',
            toggleActions: 'play none none none',
          },
        }
      );
    }, footerRef);

    return () => ctx.revert();
  }, []);

  const handleSubscribe = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatusMessage('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setStatusTone('error');
      setStatusMessage('Enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiRequest<{ message?: string }>('/auth/newsletter/subscribe', {
        method: 'POST',
        body: JSON.stringify({ email: normalizedEmail }),
      });
      setStatusTone('success');
      setStatusMessage(response.message || 'Subscribed successfully.');
      setEmail('');
    } catch (subscribeError) {
      setStatusTone('error');
      setStatusMessage(subscribeError instanceof Error ? subscribeError.message : 'Unable to subscribe now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLinkList = (items: FooterLinkItem[]) => (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <button
            type="button"
            onClick={item.action}
            className="text-sm text-white/75 transition-colors duration-200 hover:text-brand-gold"
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <footer
      ref={footerRef}
      className="relative w-full overflow-hidden border-t border-white/10 bg-[radial-gradient(64%_90%_at_0%_0%,rgba(29,78,216,0.24),transparent_62%),radial-gradient(52%_82%_at_100%_0%,rgba(200,162,74,0.15),transparent_60%),linear-gradient(180deg,#0b1f3b_0%,#0d274a_56%,#0f172a_100%)] py-14 text-white"
    >
      <div className="pointer-events-none absolute -left-24 top-10 h-56 w-56 rounded-full bg-blue-500/25 blur-[90px]" />
      <div className="pointer-events-none absolute -right-20 top-1/4 h-56 w-56 rounded-full bg-amber-400/20 blur-[86px]" />
      <div className="page-container relative z-10">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.45fr_0.85fr_0.85fr_0.85fr_0.85fr]">
          <div className="footer-animate space-y-6">
            <button type="button" onClick={onOpenHome} className="inline-flex text-left">
              <img
                src="/images/logo-wordmark-light.svg"
                alt="ZDT Realty"
                className="h-20 w-auto object-contain sm:h-24"
              />
            </button>

            <div className="max-w-md space-y-3 text-sm text-white/65">
              <p>
                ZDT Realty is an independent real estate discovery platform built to bring transparency, verified
                listings, and local insights to property decisions across India.
              </p>
              <p>
                We help buyers, sellers, builders, and investors make informed choices through trusted data and clear
                processes.
              </p>
            </div>

            <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Startup Support</p>
              <div className="mt-3 space-y-2 text-sm text-white/70">
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="block transition-colors duration-200 hover:text-brand-gold"
                >
                  Email: {SUPPORT_EMAIL}
                </a>
                <p>WhatsApp: {WHATSAPP_PLACEHOLDER}</p>
                <p>Support Hours: {SUPPORT_HOURS_PLACEHOLDER}</p>
                <p>Response Time: {REPLY_TIME_PLACEHOLDER}</p>
              </div>
              <p className="mt-3 text-xs text-white/55">{STARTUP_SUPPORT_NOTE}</p>
            </div>

            <div>
              <p className="mb-3 text-[18px] font-semibold">Subscribe to our newsletter</p>
              <p className="mb-3 text-xs text-white/60">{NEWSLETTER_HELPER_TEXT}</p>
              <form onSubmit={handleSubscribe} className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 border-white/20 bg-white/10 text-white placeholder:text-white/45"
                />
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-12 bg-brand-gold px-4 text-brand-primary hover:bg-[#d2af5f]"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              <p className="mt-2 text-xs text-white/55">No spam. Unsubscribe anytime.</p>
              {statusMessage ? (
                <p className={`mt-2 text-sm ${statusTone === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {statusMessage}
                </p>
              ) : null}
            </div>
          </div>

          <div className="footer-animate rounded-2xl border border-white/12 bg-white/[0.04] p-4 md:border-0 md:bg-transparent md:p-0">
            <h4 className="mb-4 text-[18px] font-semibold">Company</h4>
            {renderLinkList(companyLinks)}
          </div>

          <div className="footer-animate rounded-2xl border border-white/12 bg-white/[0.04] p-4 md:border-0 md:bg-transparent md:p-0">
            <h4 className="mb-4 text-[18px] font-semibold">Support</h4>
            {renderLinkList(supportLinks)}
          </div>

          <div className="footer-animate rounded-2xl border border-white/12 bg-white/[0.04] p-4 md:border-0 md:bg-transparent md:p-0">
            <h4 className="mb-4 text-[18px] font-semibold">Legal</h4>
            {renderLinkList(legalLinks)}
          </div>

          <div className="footer-animate rounded-2xl border border-white/12 bg-white/[0.04] p-4 md:border-0 md:bg-transparent md:p-0">
            <h4 className="mb-4 text-[18px] font-semibold">Services</h4>
            {renderLinkList(serviceLinks)}
          </div>
        </div>

        <div className="footer-animate my-8 h-px bg-white/10" />

        <p className="footer-animate text-xs text-white/70">
          ZDT Realty is an early-stage Indian startup focused on transparency, verified listings, and long-term trust.
        </p>
        <p className="footer-animate mt-2 text-xs text-white/50">
          ZDT Realty is a property discovery platform. Always verify documents and complete site visits before making
          any payments.
        </p>
        <p className="footer-animate mt-2 text-xs text-white/45">
          Currently focused on select local cities, with plans to expand across India.
        </p>

        <div className="footer-animate mt-5 flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="text-center md:text-left">
            <p className="text-sm text-white/45">© 2026 ZDT Realty. All rights reserved.</p>
            <p className="text-xs text-white/50">Built in India · Where Trust Meets Property</p>
          </div>

          <div className="flex items-center gap-3">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target={social.href.startsWith('http') ? '_blank' : undefined}
                rel={social.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                aria-label={social.label}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-white/80 transition-colors duration-200 hover:border-brand-gold/60 hover:bg-white/[0.14] hover:text-brand-gold"
              >
                <social.icon className="h-5 w-5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
