import { useEffect, useRef } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function CTA() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        contentRef.current,
        { opacity: 0, x: -50 },
        {
          opacity: 1,
          x: 0,
          duration: 0.8,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: contentRef.current,
            start: 'top 75%',
            toggleActions: 'play none none none',
          },
        }
      );

      const cards = cardsRef.current?.querySelectorAll('.floating-card');
      if (cards) {
        gsap.fromTo(
          cards,
          { opacity: 0, x: 100 },
          {
            opacity: 1,
            x: 0,
            duration: 0.7,
            stagger: 0.2,
            ease: 'expo.out',
            scrollTrigger: {
              trigger: cardsRef.current,
              start: 'top 75%',
              toggleActions: 'play none none none',
            },
          }
        );
      }
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden bg-gradient-to-br from-[#1A1E26] via-[#141821] to-[#0D1118] section-pad"
    >
      <div className="absolute inset-0">
        <svg
          className="absolute inset-0 h-full w-full opacity-10"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="diagonal-lines"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="40"
                stroke="white"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#diagonal-lines)" />
        </svg>

        <div className="absolute left-0 top-0 h-96 w-96 rounded-full bg-brand-secondary/12 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-brand-primary/25 blur-3xl" />
      </div>

      <div className="relative page-container">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div ref={contentRef} className="text-center lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2.5 rounded-lg border border-brand-secondary/30 bg-white/5 px-4 py-2">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden">
                <img src="/images/logo-mark.svg" alt="ZDT Realty" className="h-14 w-14 object-contain" />
              </div>
              <span className="text-sm font-semibold leading-none text-white">ZDT Realty</span>
              <span className="text-white/40">|</span>
              <span className="text-sm font-medium leading-none text-white/80">Start Your Journey Today</span>
            </div>

            <h2 className="mb-6 text-[22px] font-semibold leading-tight text-white sm:text-[28px] lg:text-[36px]">
              Ready to Find Your{' '}
              <span className="text-brand-secondary">Perfect Property?</span>
            </h2>

            <p className="mx-auto mb-8 max-w-xl text-base text-white/80 lg:mx-0">
              Join thousands of satisfied customers who found their dream homes with ZDT Realty&apos;s AI-powered platform.
            </p>

            <div className="flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
              <Button
                className="group rounded-lg bg-white px-7 py-3.5 text-[15px] font-semibold text-brand-primary transition-all duration-300 hover:scale-105 hover:bg-white/90 hover:shadow-glow-lg"
              >
                Get Started Now
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button
                variant="outline"
                className="rounded-lg border-2 border-white/30 px-7 py-3.5 text-[15px] font-semibold text-white transition-all duration-300 hover:bg-white/10"
              >
                Learn More
              </Button>
            </div>

            <p className="mt-6 text-sm text-white/60">
              Free to browse | No registration required
            </p>
          </div>

          <div ref={cardsRef} className="relative hidden h-[500px] lg:block">
            <div
              className="floating-card absolute right-0 top-0 w-72 rounded-xl bg-white p-6 shadow-2xl animate-float"
              style={{ animationDelay: '0s' }}
            >
              <div className="mb-4 flex items-center gap-4">
                <div className="flex items-center justify-center overflow-hidden">
                  <img src="/images/logo-mark.svg" alt="ZDT" className="h-14 w-14 object-contain" />
                </div>
                <div>
                  <p className="font-semibold text-brand-black">Property Found!</p>
                  <p className="text-sm text-brand-gray3">Just now</p>
                </div>
              </div>
              <p className="text-sm text-brand-gray3">
                ZDT Realty AI matched you with 5 perfect properties based on your preferences.
              </p>
            </div>

            <div
              className="floating-card absolute left-0 top-1/3 w-64 rounded-xl bg-white p-6 shadow-2xl animate-float-slow"
              style={{ animationDelay: '1s' }}
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary/10">
                  <Sparkles className="h-5 w-5 text-brand-primary" />
                </div>
                <p className="font-semibold text-brand-black">AI Analysis</p>
              </div>
              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-brand-gray1">
                  <div className="h-full w-3/4 rounded-full bg-brand-primary" />
                </div>
                <p className="text-sm text-brand-gray3">75% match with your preferences</p>
              </div>
            </div>

            <div
              className="floating-card absolute bottom-0 right-10 w-80 rounded-xl bg-white p-6 shadow-2xl animate-float"
              style={{ animationDelay: '2s' }}
            >
              <div className="flex items-center gap-4">
                <img
                  src="/images/avatar-1.jpg"
                  alt="User"
                  className="h-14 w-14 rounded-full object-cover"
                />
                <div>
                  <p className="font-semibold text-brand-black">Sarah just found her home!</p>
                  <p className="text-sm text-brand-gray3">Using ZDT Realty AI Smart Search</p>
                </div>
              </div>
            </div>

            <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/5 blur-2xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
