import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Instagram, MessageCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/http';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface FooterProps {
  isHomeScreen?: boolean;
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
  onOpenConstructWithUs?: () => void;
  onOpenBuildingMaterials?: () => void;
  onOpenGroupDeals?: () => void;
  onOpenEAuction?: () => void;
  onOpenInsights?: () => void;
  onOpenPricing?: () => void;
  onOpenCollaborations?: () => void;
}

const SUPPORT_EMAIL = 'zdtrealty@gmail.com';
const WHATSAPP_PLACEHOLDER = '+91 76768 15237';
const SUPPORT_HOURS_PLACEHOLDER = 'Mon-Sat, 9:30 AM - 7:00 PM IST';
const REPLY_TIME_PLACEHOLDER = 'Usually within 2-6 business hours';
const STARTUP_SUPPORT_NOTE = 'Friendly support. No spam. No forced follow-ups.';
const NEWSLETTER_HELPER_TEXT =
  'Get important updates on new listings, platform features, and verification improvements.';
const BRAND_TAGLINE = 'Where Trust Meets Realty';

const socialLinks = [
  {
    icon: Instagram,
    href: 'https://www.instagram.com/zdt_realty?igsh=MThhN3lsbWg4eTBzcA==',
    label: 'Instagram',
  },
];
const trustBadges = ['Verified-first listings', 'Transparent support', 'Builder and buyer ready'];

type FooterLinkItem = {
  label: string;
  action: () => void;
};

export default function Footer({
  isHomeScreen = false,
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
  onOpenConstructWithUs,
  onOpenBuildingMaterials,
  onOpenGroupDeals,
  onOpenEAuction,
  onOpenInsights,
  onOpenPricing,
  onOpenCollaborations,
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

  const exploreLinks = useMemo<FooterLinkItem[]>(
    () => {
      const links: FooterLinkItem[] = [];
      if (onOpenConstructWithUs) links.push({ label: 'Construct With Us', action: onOpenConstructWithUs });
      if (onOpenBuildingMaterials) links.push({ label: 'Building Materials', action: onOpenBuildingMaterials });
      if (onOpenGroupDeals) links.push({ label: 'Group Deals', action: onOpenGroupDeals });
      if (onOpenEAuction) links.push({ label: 'E-Auction', action: onOpenEAuction });
      if (onOpenInsights) links.push({ label: 'Insights', action: onOpenInsights });
      if (onOpenPricing) links.push({ label: 'Pricing', action: onOpenPricing });
      if (onOpenCollaborations) links.push({ label: 'Collaborations', action: onOpenCollaborations });
      return links;
    },
    [onOpenConstructWithUs, onOpenBuildingMaterials, onOpenGroupDeals, onOpenEAuction, onOpenInsights, onOpenPricing, onOpenCollaborations]
  );

  const footerSections = useMemo(
    () => {
      const sections = [
        { title: 'Company', links: companyLinks },
        { title: 'Support', links: supportLinks },
        { title: 'Legal', links: legalLinks },
        { title: 'Services', links: serviceLinks },
      ];
      if (exploreLinks.length > 0) {
        sections.push({ title: 'Explore', links: exploreLinks });
      }
      return sections;
    },
    [companyLinks, supportLinks, legalLinks, serviceLinks, exploreLinks]
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
        <div className={isHomeScreen ? 'zdt-footer-shell rounded-[32px] px-5 py-6 sm:px-6 md:px-8 md:py-8' : ''}>
          {isHomeScreen ? (
            <div className="footer-animate mb-6 flex flex-wrap gap-2">
              {trustBadges.map((badge) => (
                <span key={badge} className="zdt-footer-badge inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">
                  {badge}
                </span>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.45fr_0.85fr_0.85fr_0.85fr_0.85fr]">
            <div className="footer-animate space-y-6">
              <div className="space-y-2">
                <button type="button" onClick={onOpenHome} className="inline-flex text-left">
                  <img
                    src="/images/logo-wordmark-light.svg"
                    alt="ZDT Realty"
                    loading="lazy"
                    className="block h-24 w-auto max-w-[200px] object-contain sm:h-28 sm:max-w-none xl:h-32"
                  />
                </button>
                <p className="text-xs font-semibold uppercase tracking-[0.34em] text-brand-gold/85 sm:text-sm">
                  {BRAND_TAGLINE}
                </p>
              </div>

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
                  <a
                    href="tel:+917676815237"
                    className="block transition-colors duration-200 hover:text-brand-gold"
                  >
                    WhatsApp: {WHATSAPP_PLACEHOLDER}
                  </a>
                  <p>Support Hours: {SUPPORT_HOURS_PLACEHOLDER}</p>
                  <p>Response Time: {REPLY_TIME_PLACEHOLDER}</p>
                </div>
                <p className="mt-3 text-xs text-white/55">{STARTUP_SUPPORT_NOTE}</p>
                <a
                  href={`https://wa.me/917676815237?text=${encodeURIComponent('Hi ZDT Realty! I have a query.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-xs font-semibold text-green-400 transition hover:bg-green-500/20 hover:text-green-300"
                >
                  <MessageCircle className="h-4 w-4" />
                  Chat on WhatsApp
                </a>
              </div>

              <div>
                <p className="mb-3 text-[18px] font-semibold">Subscribe to our newsletter</p>
                <p className="mb-3 text-xs text-white/60">{NEWSLETTER_HELPER_TEXT}</p>
                <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-12 flex-1 min-w-0 border-white/20 bg-white/10 text-white placeholder:text-white/45"
                  />
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-12 bg-brand-gold px-5 text-brand-primary hover:bg-[#d2af5f] shrink-0"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Subscribe
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

            <div className="md:contents">
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:contents">
                {footerSections.map((section) => (
                  <div
                    key={section.title}
                    className="footer-animate min-w-0"
                  >
                    <h4 className="mb-3 text-base font-semibold md:mb-4 md:text-[18px]">{section.title}</h4>
                    {renderLinkList(section.links)}
                  </div>
                ))}
              </div>
            </div>
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
            <p className="text-xs text-white/50">Built in India · {BRAND_TAGLINE}</p>
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
