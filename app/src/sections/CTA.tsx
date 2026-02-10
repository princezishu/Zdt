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
      // Content animation
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

      // Cards animation
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
      className="relative w-full bg-gradient-to-br from-brand-primary via-brand-primary to-brand-primary-dark overflow-hidden section-pad"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0">
        {/* Diagonal lines */}
        <svg
          className="absolute inset-0 w-full h-full opacity-10"
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

        {/* Gradient orbs */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-brand-secondary/20 rounded-full blur-3xl" />
      </div>

      <div className="relative page-container">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          {/* Left Content */}
          <div ref={contentRef} className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg mb-6">
              <div className="flex items-center justify-center overflow-hidden">
                <img src="/images/logo-transparent.png" alt="ZDT Realty" className="w-14 h-14 object-contain" />
              </div>
              <span className="text-sm font-medium text-white">ZDT Realty</span>
              <span className="text-white/40">|</span>
              <span className="text-sm font-medium text-white/80">Start Your Journey Today</span>
            </div>

            <h2 className="text-[22px] sm:text-[28px] lg:text-[36px] font-semibold text-white mb-6 leading-tight">
              Ready to Find Your{' '}
              <span className="text-brand-secondary">Perfect Property?</span>
            </h2>

            <p className="text-base text-white/80 mb-8 max-w-xl mx-auto lg:mx-0">
              Join thousands of satisfied customers who found their dream homes with ZDT Realty's AI-powered platform.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button
                className="bg-white text-brand-primary hover:bg-white/90 rounded-lg px-7 py-3.5 text-[15px] font-semibold transition-all duration-300 hover:scale-105 hover:shadow-glow-lg group"
              >
                Get Started Now
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                variant="outline"
                className="border-2 border-white/30 text-white hover:bg-white/10 rounded-lg px-7 py-3.5 text-[15px] font-semibold transition-all duration-300"
              >
                Learn More
              </Button>
            </div>

            <p className="text-white/60 text-sm mt-6">
              Free to browse • No registration required
            </p>
          </div>

          {/* Right Content - Floating Cards */}
          <div ref={cardsRef} className="relative hidden lg:block h-[500px]">
            {/* Card 1 */}
            <div
              className="floating-card absolute top-0 right-0 w-72 bg-white rounded-xl shadow-2xl p-6 animate-float"
              style={{ animationDelay: '0s' }}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center overflow-hidden">
                  <img src="/images/logo-transparent.png" alt="ZDT" className="w-14 h-14 object-contain" />
                </div>
                <div>
                  <p className="font-semibold text-brand-black">Property Found!</p>
                  <p className="text-sm text-brand-gray3">Just now</p>
                </div>
              </div>
              <p className="text-brand-gray3 text-sm">
                ZDT Realty AI matched you with 5 perfect properties based on your preferences.
              </p>
            </div>

            {/* Card 2 */}
            <div
              className="floating-card absolute top-1/3 left-0 w-64 bg-white rounded-xl shadow-2xl p-6 animate-float-slow"
              style={{ animationDelay: '1s' }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-brand-primary/10 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-brand-primary" />
                </div>
                <p className="font-semibold text-brand-black">AI Analysis</p>
              </div>
              <div className="space-y-2">
                <div className="h-2 bg-brand-gray1 rounded-full overflow-hidden">
                  <div className="h-full w-3/4 bg-brand-primary rounded-full" />
                </div>
                <p className="text-sm text-brand-gray3">75% match with your preferences</p>
              </div>
            </div>

            {/* Card 3 */}
            <div
              className="floating-card absolute bottom-0 right-10 w-80 bg-white rounded-xl shadow-2xl p-6 animate-float"
              style={{ animationDelay: '2s' }}
            >
              <div className="flex items-center gap-4">
                <img
                  src="/images/avatar-1.jpg"
                  alt="User"
                  className="w-14 h-14 rounded-full object-cover"
                />
                <div>
                  <p className="font-semibold text-brand-black">Sarah just found her home!</p>
                  <p className="text-sm text-brand-gray3">Using ZDT Realty AI Smart Search</p>
                </div>
              </div>
            </div>

            {/* Decorative elements */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/5 rounded-full blur-2xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
