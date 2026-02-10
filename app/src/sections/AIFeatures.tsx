import { useEffect, useRef, useState } from 'react';
import { Map, MapPin, Box, Home, Check } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const aiFeatures = [
  {
    id: 1,
    icon: Map,
    title: 'AI Plot Polygon',
    description: 'Upload blueprints, auto-draw boundaries on map with precision. Our AI analyzes your property layout and creates accurate boundary maps instantly.',
    benefits: ['Automatic boundary detection', 'Blueprint upload support', 'Precise measurements'],
  },
  {
    id: 2,
    icon: MapPin,
    title: 'Current Location',
    description: 'Pin your live position on the map to start an instant property scan. Our AI centers the view around where you are and pulls nearby parcel context.',
    benefits: ['One-tap GPS pin', 'Nearby parcel insights', 'Fast map centering'],
  },
  {
    id: 3,
    icon: Box,
    title: 'Interior Design',
    description: 'Design stunning interiors in seconds with AI. Upload your room photo or layout, and our AI generates personalized furniture placement, color palettes, and décor ideas tailored to your taste and space.',
    benefits: ['Transform – Instant room redesigns.', 'Personalize – Tailored to your style.', 'Save – Time and money efficiently.'],
  },
  {
    id: 4,
    icon: Home,
    title: 'Home Design AI',
    description: 'Generate custom house plans and interior designs. Let AI create personalized layouts based on your preferences.',
    benefits: ['Custom floor plans', 'Interior suggestions', 'Style matching'],
  },
];

export default function AIFeatures() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeFeature, setActiveFeature] = useState(0);

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

      // Content animation
      gsap.fromTo(
        contentRef.current,
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: contentRef.current,
            start: 'top 75%',
            toggleActions: 'play none none none',
          },
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="ai-features"
      ref={sectionRef}
      className="relative w-full bg-white overflow-hidden section-glow section-pad"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-brand-primary/5 to-transparent" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-brand-secondary/5 rounded-full blur-3xl" />
      </div>
      <div className="absolute inset-0 futuristic-grid pointer-events-none" />

      <div className="relative page-container">
        {/* Section Header */}
        <div ref={titleRef} className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary/10 rounded-lg mb-6">
            <span className="w-2 h-2 bg-brand-primary rounded-full animate-pulse" />
            <span className="text-sm font-medium text-brand-primary">Powered by AI</span>
          </div>
          <h2 className="text-[22px] sm:text-[28px] lg:text-[36px] font-semibold text-brand-black mb-4 accent-title">
            AI-Powered Property Intelligence
          </h2>
          <p className="text-base text-brand-gray3 max-w-2xl mx-auto">
            Cutting-edge technology for smarter property decisions
          </p>
        </div>

        {/* Content */}
        <div ref={contentRef} className="grid lg:grid-cols-2 gap-6 items-start">
          {/* Features List */}
          <div className="space-y-4">
            {aiFeatures.map((feature, index) => (
              <div
                key={feature.id}
                onClick={() => setActiveFeature(index)}
                className={`relative p-6 rounded-xl cursor-pointer transition-all duration-300 ${
                  activeFeature === index
                    ? 'bg-brand-primary text-white shadow-glow neon-card'
                    : 'bg-white text-brand-black shadow-card hover:shadow-card-hover'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center flex-shrink-0">
                    <feature.icon
                      className={`w-6 h-6 ${
                        activeFeature === index ? 'text-white' : 'text-brand-primary'
                      }`}
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[20px] font-semibold mb-1">{feature.title}</h3>
                    <p
                      className={`text-sm ${
                        activeFeature === index ? 'text-white/80' : 'text-brand-gray3'
                      }`}
                    >
                      {feature.description}
                    </p>
                  </div>
                </div>

                {/* Active indicator */}
                {activeFeature === index && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-white rounded-r-full" />
                )}
              </div>
            ))}
          </div>

          {/* Feature Visualization */}
          <div className="relative">
            <div className="bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 rounded-xl p-6 lg:p-8">
              {/* Active Feature Display */}
              <div className="bg-white/95 rounded-xl shadow-card-hover p-6 neon-card">
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex items-center justify-center">
                    {(() => {
                      const Icon = aiFeatures[activeFeature].icon;
                      return <Icon className="w-8 h-8 text-brand-primary" />;
                    })()}
                  </div>
                  <div>
                    <h3 className="text-[20px] font-semibold text-brand-black">
                      {aiFeatures[activeFeature].title}
                    </h3>
                    <p className="text-brand-gray3">AI-Powered Feature</p>
                  </div>
                </div>

                <p className="text-brand-gray3 mb-6 leading-relaxed">
                  {aiFeatures[activeFeature].description}
                </p>

                {/* Benefits */}
                <div className="space-y-3">
                  <p className="font-semibold text-brand-black">Key Benefits:</p>
                  {aiFeatures[activeFeature].benefits.map((benefit, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-green-600" />
                      </div>
                      <span className="text-brand-gray3">{benefit}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button className="mt-8 w-full py-3.5 bg-brand-primary text-white rounded-lg font-semibold text-[15px] hover:bg-brand-primary-dark transition-colors duration-300">
                  Try {aiFeatures[activeFeature].title}
                </button>
              </div>

              {/* Decorative Elements */}
              <div className="absolute -top-4 -right-4 w-20 h-20 bg-brand-secondary/20 rounded-full blur-2xl" />
              <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-brand-primary/20 rounded-full blur-2xl" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
