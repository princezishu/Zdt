import { useEffect, useRef } from 'react';
import { MapPin, Package, BarChart3, Newspaper, Building, Crown, ArrowRight } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const services = [
  {
    icon: MapPin,
    title: 'Location Services',
    description: 'Get comprehensive area insights including nearby amenities, schools, hospitals, and transportation options.',
    image: '/images/service-location.jpg',
    size: 'large',
  },
  {
    icon: Package,
    title: 'Building Materials',
    description: 'Explore and purchase quality construction materials from verified suppliers.',
    image: '/images/service-materials.jpg',
    size: 'small',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    description: 'Track price trends, demand analysis, and market insights for informed decisions.',
    image: '/images/service-analytics.jpg',
    size: 'small',
  },
  {
    icon: Newspaper,
    title: 'News & Updates',
    description: 'Stay updated with the latest property market news and price updates.',
    image: '/images/service-news.jpg',
    size: 'small',
  },
  {
    icon: Building,
    title: 'Apartments & Complex',
    description: 'AI-based full society and building visualization for better understanding.',
    image: '/images/service-apartments.jpg',
    size: 'large',
  },
  {
    icon: Crown,
    title: 'Subscription Plans',
    description: 'Unlock premium features with our flexible subscription plans.',
    image: '/images/service-subscription.jpg',
    size: 'small',
  },
];

export default function Services() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

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
      const cards = gridRef.current?.querySelectorAll('.service-card');
      if (cards) {
        gsap.fromTo(
          cards,
          { opacity: 0, y: 50 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.1,
            ease: 'expo.out',
            scrollTrigger: {
              trigger: gridRef.current,
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
      id="services"
      ref={sectionRef}
      className="relative w-full bg-brand-gray1 section-glow section-pad"
    >
      <div className="page-container">
        {/* Section Header */}
        <div ref={titleRef} className="text-center mb-12">
          <h2 className="text-[22px] sm:text-[28px] lg:text-[36px] font-semibold text-brand-black mb-4 accent-title">
            Comprehensive Property Services
          </h2>
          <p className="text-base text-brand-gray3 max-w-2xl mx-auto">
            Everything you need in one platform
          </p>
        </div>

        {/* Services Grid */}
        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <div
              key={service.title}
              className={`service-card group relative bg-white rounded-xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-500 hover:-translate-y-2 cursor-pointer ${
                service.size === 'large' ? 'md:col-span-2 lg:col-span-1' : ''
              }`}
            >
              {/* Image */}
              <div className="relative h-[220px] overflow-hidden">
                <img
                  src={service.image}
                  alt={service.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                
                {/* Icon overlay */}
                <div className="absolute top-4 left-4 w-12 h-12 bg-white/90 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <service.icon className="w-6 h-6 text-brand-primary" />
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <h3 className="text-xl font-semibold text-brand-black mb-2 group-hover:text-brand-primary transition-colors">
                  {service.title}
                </h3>
                <p className="text-brand-gray3 text-sm mb-4 line-clamp-2">
                  {service.description}
                </p>

                {/* CTA */}
                <div className="flex items-center gap-2 text-brand-primary font-medium text-sm group-hover:gap-3 transition-all">
                  <span>Learn More</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-brand-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
