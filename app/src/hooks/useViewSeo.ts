import { useEffect } from 'react';
import { applySeo } from '@/lib/seo';
import type { AppView } from '@/lib/views';

/**
 * Per-view SEO configuration map.
 * Each view gets a unique title + description for better Google indexing.
 */
const VIEW_SEO_MAP: Partial<Record<AppView, { title: string; description: string }>> = {
  home: {
    title: 'ZDT Realty — Buy, Sell & Rent Verified Properties in India',
    description:
      'India\'s AI-powered property platform. Browse verified homes, rentals, plots, and commercial spaces with transparent data and smart technology.',
  },
  buy: {
    title: 'Buy Verified Properties in India | ZDT Realty',
    description:
      'Explore verified properties for sale across India. Filter by city, BHK, price, and amenities. Group deals, trust scores, and AI-assisted search.',
  },
  rent: {
    title: 'Rent Verified Homes & Apartments | ZDT Realty',
    description:
      'Find owner-verified rental homes, PGs, and apartments. Filter by rent, furnishing, and availability. No broker pressure.',
  },
  'sell-property': {
    title: 'Sell Your Property | ZDT Realty',
    description:
      'List your property for sale on ZDT Realty. Reach verified buyers with transparent pricing and AI-powered market insights.',
  },
  'ai-services': {
    title: 'AI Home Design & Plot Analysis Tools | ZDT Realty',
    description:
      'Design your dream home with AI. Get interior design ideas, home exteriors, plot polygon analysis, and Vastu recommendations powered by AI.',
  },
  'group-deals': {
    title: 'Group Deals — Buy Together, Save More | ZDT Realty',
    description:
      'Join buyer pools to negotiate better prices with builders. Group deals help you save 2-15% on property purchases.',
  },
  'e-auction': {
    title: 'E-Auction Properties — Bank & Government Sales | ZDT Realty',
    description:
      'Discover bank auction and government sale properties across India. Find below-market deals on residential and commercial properties.',
  },
  infrastructure: {
    title: 'Infrastructure Tracker — Upcoming Projects | ZDT Realty',
    description:
      'Track upcoming infrastructure projects: metro lines, highways, airports, and smart cities that impact property values.',
  },
  'insights-news': {
    title: 'Real Estate News & Updates | ZDT Realty Insights',
    description:
      'Stay updated with the latest real estate news, market trends, policy changes, and property investment insights for India.',
  },
  'insights-market': {
    title: 'Market Data & Price Trends | ZDT Realty Insights',
    description:
      'Analyze real estate market trends, price movements, rental yields, and investment opportunities across Indian cities.',
  },
  'insights-projects': {
    title: 'Project Launches & Reviews | ZDT Realty Insights',
    description:
      'Explore new project launches, builder reviews, and project comparisons to make informed property investment decisions.',
  },
  'insights-compare': {
    title: 'Area & Property Comparison Tool | ZDT Realty',
    description:
      'Compare localities, projects, and property types side by side. Evaluate price trends, amenities, and connectivity data.',
  },
  'emi-calculator': {
    title: 'Home Loan EMI Calculator | ZDT Realty',
    description:
      'Calculate your monthly EMI for home loans. Compare interest rates across banks, view amortization schedules, and plan your purchase.',
  },
  pricing: {
    title: 'Plans & Pricing | ZDT Realty',
    description:
      'Explore ZDT Realty subscription plans for property owners, dealers, and builders. Premium listing features and analytics.',
  },
  'building-materials': {
    title: 'Building Materials Marketplace | ZDT Realty',
    description:
      'Browse and compare building materials — cement, steel, tiles, fixtures. Get competitive quotes from verified suppliers.',
  },
  'construct-with-us': {
    title: 'Build Your Home — Construction Services | ZDT Realty',
    description:
      'End-to-end home construction services. From architecture to interior design, build your dream home with trusted partners.',
  },
  'dealers-builders': {
    title: 'Dealers & Builders Portal | ZDT Realty',
    description:
      'Register as a dealer or builder. List projects, manage leads, and grow your real estate business with ZDT Realty.',
  },
  about: {
    title: 'About ZDT Realty — Our Mission & Team',
    description:
      'ZDT Realty is an early-stage startup focused on verified listings, transparent pricing, and trust-first real estate in India.',
  },
  blog: {
    title: 'Blog — Real Estate Tips & Guides | ZDT Realty',
    description:
      'Read expert guides on home buying, selling, renting, investing, and home improvement. Practical tips for Indian property market.',
  },
  career: {
    title: 'Careers at ZDT Realty — Join Our Team',
    description:
      'Join ZDT Realty and help build India\'s most trusted real estate platform. View open positions in engineering, design, and operations.',
  },
  collaborations: {
    title: 'Collaborations & Partnerships | ZDT Realty',
    description:
      'Partner with ZDT Realty. Explore collaboration opportunities for builders, agents, financial institutions, and technology partners.',
  },
  'help-center': {
    title: 'Help Center | ZDT Realty',
    description:
      'Get answers to common questions about buying, selling, renting, and using ZDT Realty. Contact our support team.',
  },
  faq: {
    title: 'Frequently Asked Questions | ZDT Realty',
    description:
      'Find answers to frequently asked questions about property listings, verification, group deals, and account management.',
  },
  contact: {
    title: 'Contact Us | ZDT Realty',
    description:
      'Reach ZDT Realty support via email, WhatsApp, or phone. We respond within 2-6 business hours.',
  },
  privacy: {
    title: 'Privacy Policy | ZDT Realty',
    description: 'Read ZDT Realty\'s privacy policy. Learn how we collect, use, and protect your personal data.',
  },
  terms: {
    title: 'Terms of Service | ZDT Realty',
    description: 'Read ZDT Realty\'s terms and conditions for using our property platform and services.',
  },
  security: {
    title: 'Security | ZDT Realty',
    description: 'Learn about ZDT Realty\'s security practices, data protection, and platform safety measures.',
  },
  login: {
    title: 'Sign In | ZDT Realty',
    description: 'Sign in to your ZDT Realty account to access saved properties, messages, and personalized recommendations.',
  },
  register: {
    title: 'Create Account | ZDT Realty',
    description: 'Create a free ZDT Realty account. Save properties, track deals, receive alerts, and connect with verified sellers.',
  },
  'forgot-password': {
    title: 'Reset Password | ZDT Realty',
    description: 'Reset your ZDT Realty account password. We\'ll send you a secure link to create a new password.',
  },
  developer: {
    title: 'Developer Resources | ZDT Realty',
    description: 'Access ZDT Realty developer documentation, APIs, and integration guides for building on our platform.',
  },
  compare: {
    title: 'Compare Properties Side by Side | ZDT Realty',
    description: 'Compare shortlisted properties side by side. Evaluate price, area, amenities, and trust scores.',
  },
  favorites: {
    title: 'My Favorites | ZDT Realty',
    description: 'View your saved and favorited properties. Quick access to your property shortlist.',
  },
  dashboard: {
    title: 'Dashboard | ZDT Realty',
    description: 'Your personalized ZDT Realty dashboard. Track properties, messages, alerts, and account activity.',
  },
  profile: {
    title: 'My Profile | ZDT Realty',
    description: 'Manage your ZDT Realty profile, preferences, and account settings.',
  },
  messages: {
    title: 'Messages | ZDT Realty',
    description: 'Your conversations with property owners, builders, and buyers on ZDT Realty.',
  },
  notifications: {
    title: 'Notifications | ZDT Realty',
    description: 'View your latest notifications — new messages, property alerts, and platform updates.',
  },
  press: {
    title: 'Press & Media | ZDT Realty',
    description: 'ZDT Realty press releases, media coverage, and brand assets for journalists and partners.',
  },
  'dalal-coin': {
    title: 'Dalal Coin Rewards | ZDT Realty',
    description: 'Earn and redeem Dalal Coins for platform activity. Track your rewards and exclusive benefits.',
  },
};

/**
 * Hook that automatically applies page-level SEO metadata when the view changes.
 * Falls back to the default SEO if no specific config is found.
 */
export function useViewSeo(currentView: AppView): void {
  useEffect(() => {
    const seoConfig = VIEW_SEO_MAP[currentView];
    if (seoConfig) {
      applySeo({
        title: seoConfig.title,
        description: seoConfig.description,
        canonicalPath: `/${currentView === 'home' ? '' : currentView}`,
      });
    }
  }, [currentView]);
}
