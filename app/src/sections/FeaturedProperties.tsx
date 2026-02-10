import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Bed, Bath, Square, MapPin, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const properties = [
  {
    id: 1,
    image: '/images/property-1.jpg',
    title: 'Modern Villa',
    price: '$850,000',
    location: 'Beverly Hills, CA',
    beds: 4,
    baths: 3,
    sqft: '3,200',
    type: 'For Sale',
  },
  {
    id: 2,
    image: '/images/property-2.jpg',
    title: 'Luxury Apartment',
    price: '$450,000',
    location: 'Downtown, NY',
    beds: 3,
    baths: 2,
    sqft: '1,800',
    type: 'For Sale',
  },
  {
    id: 3,
    image: '/images/property-3.jpg',
    title: 'Commercial Space',
    price: '$1,200,000',
    location: 'Business District, Chicago',
    beds: 0,
    baths: 2,
    sqft: '5,000',
    type: 'For Sale',
  },
  {
    id: 4,
    image: '/images/property-4.jpg',
    title: 'Penthouse Suite',
    price: '$2,100,000',
    location: 'Manhattan, NY',
    beds: 5,
    baths: 4,
    sqft: '4,500',
    type: 'For Sale',
  },
  {
    id: 5,
    image: '/images/property-5.jpg',
    title: 'Family Home',
    price: '$620,000',
    location: 'Suburban, TX',
    beds: 4,
    baths: 2,
    sqft: '2,400',
    type: 'For Sale',
  },
];

export default function FeaturedProperties() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [favorites, setFavorites] = useState<number[]>([]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Title animation
      gsap.fromTo(
        titleRef.current,
        { opacity: 0, x: -50 },
        {
          opacity: 1,
          x: 0,
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
        { opacity: 0, y: 40 },
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
    setCurrentIndex((prev) => (prev + 1) % properties.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + properties.length) % properties.length);
  };

  const toggleFavorite = (id: number) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((fav) => fav !== id) : [...prev, id]
    );
  };

  const getVisibleProperties = () => {
    const visible = [];
    for (let i = 0; i < 3; i++) {
      const index = (currentIndex + i) % properties.length;
      visible.push({ ...properties[index], position: i });
    }
    return visible;
  };

  return (
    <section
      id="properties"
      ref={sectionRef}
      className="relative w-full bg-brand-gray1 section-glow section-pad"
    >
      <div className="page-container">
        {/* Section Header */}
        <div ref={titleRef} className="flex flex-col lg:flex-row lg:items-end lg:justify-between mb-12">
          <div>
            <h2 className="text-[22px] sm:text-[28px] lg:text-[36px] font-semibold text-brand-black mb-4 accent-title">
              Featured Properties
            </h2>
            <p className="text-base text-brand-gray3 max-w-xl">
              Handpicked properties for you
            </p>
          </div>

          {/* Navigation Arrows */}
          <div className="flex gap-3 mt-6 lg:mt-0">
            <Button
              variant="outline"
              size="icon"
              onClick={prevSlide}
              className="w-12 h-12 rounded-lg border-2 border-brand-gray2 hover:border-brand-primary hover:bg-brand-primary hover:text-white transition-all duration-300"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
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

        {/* Carousel */}
        <div ref={carouselRef} className="relative">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {getVisibleProperties().map((property, index) => (
              <div
                key={`${property.id}-${index}`}
                className="group bg-white rounded-xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-500 hover:-translate-y-2"
              >
                {/* Image */}
                <div className="relative h-[220px] overflow-hidden">
                  <img
                    src={property.image}
                    alt={property.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  {/* Type Badge */}
                  <div className="absolute top-4 left-4 bg-brand-primary text-white text-sm font-medium px-3 py-1 rounded-lg">
                    {property.type}
                  </div>
                  {/* Favorite Button */}
                  <button
                    onClick={() => toggleFavorite(property.id)}
                    className="absolute top-4 right-4 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all duration-300 hover:bg-white hover:scale-110"
                  >
                    <Heart
                      className={`w-5 h-5 transition-colors ${
                        favorites.includes(property.id)
                          ? 'fill-red-500 text-red-500'
                          : 'text-brand-gray3'
                      }`}
                    />
                  </button>
                  {/* Price Overlay */}
                  <div className="absolute bottom-4 left-4 bg-brand-black/80 backdrop-blur-sm text-white px-4 py-2 rounded-lg">
                    <span className="text-xl font-bold">{property.price}</span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className="text-xl font-semibold text-brand-black mb-2 group-hover:text-brand-primary transition-colors">
                    {property.title}
                  </h3>
                  <div className="flex items-center gap-1 text-brand-gray3 mb-4">
                    <MapPin className="w-4 h-4" />
                    <span className="text-sm">{property.location}</span>
                  </div>

                  {/* Features */}
                  <div className="flex items-center gap-4 pt-4 border-t border-brand-gray2">
                    {property.beds > 0 && (
                      <div className="flex items-center gap-1 text-brand-gray3">
                        <Bed className="w-4 h-4" />
                        <span className="text-sm">{property.beds}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-brand-gray3">
                      <Bath className="w-4 h-4" />
                      <span className="text-sm">{property.baths}</span>
                    </div>
                    <div className="flex items-center gap-1 text-brand-gray3">
                      <Square className="w-4 h-4" />
                      <span className="text-sm">{property.sqft} sqft</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Dots Indicator */}
          <div className="flex justify-center gap-2 mt-8">
            {properties.map((_, index) => (
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
        </div>
      </div>
    </section>
  );
}
