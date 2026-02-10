import { useEffect, useRef, useState } from 'react';
import { Star, ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const testimonials = [
  {
    id: 1,
    name: 'Sarah Johnson',
    role: 'Homeowner',
    avatar: '/images/avatar-1.jpg',
    rating: 5,
    text: 'ZDT Realty made finding our dream home incredibly easy. The AI recommendations were spot on! We found the perfect property within just two weeks of using the platform.',
  },
  {
    id: 2,
    name: 'Michael Chen',
    role: 'Property Seller',
    avatar: '/images/avatar-2.jpg',
    rating: 5,
    text: 'Sold my property in just 2 weeks! The platform\'s reach is amazing. The analytics helped me price it right, and the 3D tours attracted serious buyers only.',
  },
  {
    id: 3,
    name: 'Priya Sharma',
    role: 'Renter',
    avatar: '/images/avatar-3.jpg',
    rating: 5,
    text: 'The 3D tours saved us so much time. We found our perfect apartment without endless visits. The virtual walkthrough felt like being there in person!',
  },
  {
    id: 4,
    name: 'Robert Williams',
    role: 'Real Estate Investor',
    avatar: '/images/avatar-4.jpg',
    rating: 5,
    text: 'Best investment decisions I\'ve made, thanks to their analytics and market insights. The AI-powered recommendations have consistently outperformed my expectations.',
  },
];

export default function Testimonials() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

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

      // Carousel animation
      gsap.fromTo(
        carouselRef.current,
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: carouselRef.current,
            start: 'top 75%',
            toggleActions: 'play none none none',
          },
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <section
      id="testimonials"
      ref={sectionRef}
      className="relative w-full bg-white overflow-hidden section-glow section-pad"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-brand-secondary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative page-container">
        {/* Section Header */}
        <div ref={titleRef} className="text-center mb-12">
          <h2 className="text-[22px] sm:text-[28px] lg:text-[36px] font-semibold text-brand-black mb-4 accent-title">
            What Our Clients Say
          </h2>
          <p className="text-base text-brand-gray3 max-w-2xl mx-auto">
            Trusted by thousands of happy customers
          </p>
        </div>

        {/* Testimonials Carousel */}
        <div ref={carouselRef} className="relative max-w-4xl mx-auto">
          {/* Main Card */}
          <div className="relative bg-white rounded-xl shadow-card-hover p-6">
            {/* Quote Icon */}
            <div className="absolute -top-6 left-8 w-12 h-12 bg-brand-primary rounded-xl flex items-center justify-center">
              <Quote className="w-6 h-6 text-white" />
            </div>

            {/* Content */}
            <div className="pt-4">
              {/* Stars */}
              <div className="flex gap-1 mb-6">
                {[...Array(testimonials[currentIndex].rating)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-5 h-5 fill-yellow-400 text-yellow-400"
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="text-[20px] text-brand-black leading-relaxed mb-8">
                "{testimonials[currentIndex].text}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-4">
                <img
                  src={testimonials[currentIndex].avatar}
                  alt={testimonials[currentIndex].name}
                  className="w-14 h-14 rounded-full object-cover"
                />
                <div>
                  <h4 className="text-base font-semibold text-brand-black">
                    {testimonials[currentIndex].name}
                  </h4>
                  <p className="text-brand-gray3">{testimonials[currentIndex].role}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <Button
              variant="outline"
              size="icon"
              onClick={prevSlide}
              className="w-12 h-12 rounded-lg border-2 border-brand-gray2 hover:border-brand-primary hover:bg-brand-primary hover:text-white transition-all duration-300"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>

            {/* Dots */}
            <div className="flex gap-2">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    index === currentIndex
                      ? 'bg-brand-primary w-8'
                      : 'bg-brand-gray2 hover:bg-brand-gray3'
                  }`}
                />
              ))}
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={nextSlide}
              className="w-12 h-12 rounded-lg border-2 border-brand-gray2 hover:border-brand-primary hover:bg-brand-primary hover:text-white transition-all duration-300"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
