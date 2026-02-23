import { useEffect, useRef } from 'react';
import { Home, Tag, Key, TrendingUp, Gavel, HardHat, Paintbrush } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const categories = [
  {
    icon: Home,
    title: 'Buy',
    description: 'Find your dream home',
    color: 'bg-brand-primary',
  },
  {
    icon: Tag,
    title: 'Sell',
    description: 'List your property',
    color: 'bg-[#A98B4D]',
  },
  {
    icon: Key,
    title: 'Rent',
    description: 'Discover rentals',
    color: 'bg-[#7A6531]',
  },
  {
    icon: TrendingUp,
    title: 'Invest',
    description: 'Smart investments',
    color: 'bg-[#C1A55F]',
  },
  {
    icon: Gavel,
    title: 'e-Auction',
    description: 'Bank & Govt properties',
    color: 'bg-[#5E4B27]',
  },
  {
    icon: HardHat,
    title: 'Construct',
    description: 'Build with experts',
    color: 'bg-[#8E773A]',
  },
  {
    icon: Paintbrush,
    title: 'Interior',
    description: 'AI design solutions',
    color: 'bg-[#B79A58]',
  },
];

export default function Categories() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Title animation
      gsap.fromTo(
        titleRef.current,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: titleRef.current,
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
        }
      );

      // Cards animation
      const cards = cardsRef.current?.querySelectorAll('.category-card');
      if (cards) {
        gsap.fromTo(
          cards,
          { opacity: 0, rotateY: -90 },
          {
            opacity: 1,
            rotateY: 0,
            duration: 0.7,
            stagger: 0.12,
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
      id="categories"
      ref={sectionRef}
      className="relative w-full bg-white section-glow section-pad"
    >
      <div className="page-container">
        {/* Section Header */}
        <div ref={titleRef} className="text-center mb-12">
          <h2 className="text-[22px] sm:text-[28px] lg:text-[36px] font-semibold text-brand-black mb-4 accent-title">
            Explore Property Services
          </h2>
          <p className="text-base text-brand-gray3 max-w-2xl mx-auto">
            Everything you need for your property journey
          </p>
        </div>

        {/* Categories Grid */}
        <div
          ref={cardsRef}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-6 perspective-1500"
        >
          {categories.map((category) => (
            <div
              key={category.title}
              className="category-card group relative bg-white rounded-xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-2 cursor-pointer preserve-3d"
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Icon */}
              <div
                className={`w-14 h-14 ${category.color} rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6`}
              >
                <category.icon className="w-7 h-7 text-white" />
              </div>

              {/* Content */}
              <h3 className="text-[20px] font-semibold text-brand-black mb-1">
                {category.title}
              </h3>
              <p className="text-sm text-brand-gray3">
                {category.description}
              </p>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-brand-primary/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
