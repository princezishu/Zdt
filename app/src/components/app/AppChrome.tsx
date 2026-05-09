import type { ComponentProps, ReactNode } from 'react';

import AIChatbotWidget from '@/components/realty/AIChatbotWidget';
import FloatingWhatsAppButton from '@/components/realty/FloatingWhatsAppButton';
import ScrollToTopButton from '@/components/app/ScrollToTopButton';
import PageTransitionBar from '@/components/app/PageTransitionBar';
import PopupAdOverlay from '@/components/app/PopupAdOverlay';
import { type ShellVisibility } from '@/lib/appRoutes';
import Footer from '@/sections/Footer';
import Header from '@/sections/Header';
import type { AppView } from '@/lib/views';

interface AppChromeProps {
  children: ReactNode;
  isLoaded: boolean;
  shellVisibility: ShellVisibility;
  headerProps: ComponentProps<typeof Header>;
  footerProps: ComponentProps<typeof Footer>;
  currentView: AppView;
}

export default function AppChrome({
  children,
  isLoaded,
  shellVisibility,
  headerProps,
  footerProps,
  currentView,
}: AppChromeProps) {
  return (
    <div
      className={`zdt-app-shell min-h-screen bg-slate-50 font-sans text-slate-900 transition-opacity duration-700 selection:bg-blue-200 selection:text-slate-900 ${
        isLoaded ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="relative z-10 flex min-h-screen flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-brand-primary focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
        >
          Skip to main content
        </a>

        <PageTransitionBar currentView={currentView} />

        {shellVisibility.showHeader ? <Header {...headerProps} /> : null}

        <main id="main-content" className="zdt-main-shell">
          {children}
        </main>

        {shellVisibility.showPublicFooter ? <Footer {...footerProps} /> : null}
        <ScrollToTopButton />
        <FloatingWhatsAppButton visible={shellVisibility.showFloatingWhatsApp} />
        {shellVisibility.hideAiChatbot ? null : <AIChatbotWidget />}
        <PopupAdOverlay />
      </div>
    </div>
  );
}
