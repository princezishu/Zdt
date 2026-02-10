import { useEffect, useRef, useState } from 'react';
import { Send, Facebook, Twitter, Instagram, Linkedin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const footerLinks = {
  company: [
    { label: 'About', href: '#' },
    { label: 'Careers', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Press', href: '#' },
  ],
  support: [
    { label: 'Help Center', href: '#' },
    { label: 'Contact', href: '#' },
    { label: 'FAQ', href: '#' },
    { label: 'Feedback', href: '#' },
  ],
  legal: [
    { label: 'Privacy', href: '#' },
    { label: 'Terms', href: '#' },
    { label: 'Cookies', href: '#' },
    { label: 'Security', href: '#' },
  ],
  services: [
    { label: 'Buy', href: '#categories' },
    { label: 'Sell', href: '#categories' },
    { label: 'Rent', href: '#categories' },
    { label: 'Invest', href: '#categories' },
  ],
};

const socialLinks = [
  { icon: Facebook, href: '#', label: 'Facebook' },
  { icon: Twitter, href: 'https://x.com/RealtyZdt', label: 'Twitter' },
  { icon: Instagram, href: 'https://www.instagram.com/zdt_realty?igsh=MThhN3lsbWg4eTBzcA==', label: 'Instagram' },
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
];

export default function Footer() {
  const footerRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Footer content animation
      const elements = footerRef.current?.querySelectorAll('.footer-animate');
      if (elements) {
        gsap.fromTo(
          elements,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            stagger: 0.08,
            ease: 'expo.out',
            scrollTrigger: {
              trigger: footerRef.current,
              start: 'top 90%',
              toggleActions: 'play none none none',
            },
          }
        );
      }
    }, footerRef);

    return () => ctx.revert();
  }, []);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setIsSubscribed(true);
      setEmail('');
      setTimeout(() => setIsSubscribed(false), 3000);
    }
  };

  return (
    <footer
      ref={footerRef}
      className="relative w-full bg-brand-black text-white py-12"
    >
      <div className="page-container">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-8 mb-12">
          {/* Brand Column */}
          <div className="lg:col-span-2 footer-animate">
            {/* Logo */}
           <a href="#" className="flex items-center gap-4 mb-8">
            <div className="flex items-center justify-center overflow-hidden flex-shrink-0">
              <img
                src="/images/logo-transparent.png"
                alt="ZDT Realty"
                className="w-14 h-14 object-contain"
              />
              </div>
              <div className="flex flex-col">
                <span className="text-4xl font-bold leading-tight">
                  ZDT <span className="text-brand-primary">Realty</span>
                  </span>
                  <span className="text-sm text-white/60 uppercase tracking-wider">
                  Where Trust Meets Property
                  </span>
                  </div>
                  </a>
            <p className="text-white/60 mb-6 max-w-sm text-sm">
              Your trusted property partner for buying, selling, and investing. Find your perfect property with AI-powered intelligence.
            </p>

            {/* Newsletter */}
            <div>
              <p className="font-semibold mb-3 text-[18px]">Subscribe to our newsletter</p>
              <form onSubmit={handleSubscribe} className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/40 pr-12"
                  />
                </div>
                <Button
                  type="submit"
                  className="bg-brand-primary hover:bg-brand-primary-dark px-4"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
              {isSubscribed && (
                <p className="text-green-400 text-sm mt-2">Thanks for subscribing!</p>
              )}
            </div>
          </div>

          {/* Company Links */}
          <div className="footer-animate">
            <h4 className="font-semibold mb-4 text-[18px]">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-white/60 hover:text-brand-primary transition-colors duration-300 hover:translate-x-1 inline-block text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Support Links */}
          <div className="footer-animate">
            <h4 className="font-semibold mb-4 text-[18px]">Support</h4>
            <ul className="space-y-3">
              {footerLinks.support.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-white/60 hover:text-brand-primary transition-colors duration-300 hover:translate-x-1 inline-block text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div className="footer-animate">
            <h4 className="font-semibold mb-4 text-[18px]">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-white/60 hover:text-brand-primary transition-colors duration-300 hover:translate-x-1 inline-block text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Services Links */}
          <div className="footer-animate">
            <h4 className="font-semibold mb-4 text-[18px]">Services</h4>
            <ul className="space-y-3">
              {footerLinks.services.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-white/60 hover:text-brand-primary transition-colors duration-300 hover:translate-x-1 inline-block text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="footer-animate h-px bg-white/10 mb-8" />

        {/* Bottom Footer */}
        <div className="footer-animate flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-white/40 text-sm">
            © 2024 ZDT Realty. All rights reserved. Where Trust Meets Property.
          </p>

          {/* Social Links */}
          <div className="flex items-center gap-3">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                aria-label={social.label}
                className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center hover:bg-brand-primary transition-all duration-300 hover:scale-110"
              >
                <social.icon className="w-5 h-5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
