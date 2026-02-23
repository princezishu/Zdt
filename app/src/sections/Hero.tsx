import { useEffect, useRef, useState } from 'react';
import { Search, MapPin, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import gsap from 'gsap';

export default function Hero() {
  const heroRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subheadlineRef = useRef<HTMLParagraphElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationConsentOpen, setLocationConsentOpen] = useState(false);

  const normalizeAdminPart = (value: string) =>
    value
      .replace(/\s+taluk\b/i, '')
      .replace(/\s+taluka\b/i, '')
      .replace(/\s+district\b/i, '')
      .trim();

  const handleQueryChange = (value: string) => {
    setQuery(value);
  };

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('Location is not supported in this browser.');
      return;
    }

    setIsLocating(true);
    setLocationStatus(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=14&addressdetails=1&accept-language=en`
          );
          if (!response.ok) {
            throw new Error('Reverse geocoding failed.');
          }
          const data = await response.json();
          const address = data?.address ?? {};
          const locality = normalizeAdminPart(
            address.village ||
            address.hamlet ||
            address.suburb ||
            ''
          );
          const taluk = normalizeAdminPart(
            address.taluk ||
            address.subdistrict ||
            address.city_district ||
            address.county ||
            ''
          );
          const district = normalizeAdminPart(
            address.state_district ||
            address.district ||
            address.region ||
            ''
          );
          const state = normalizeAdminPart(address.state || address.province || '');
          const parts = [locality, taluk, district, state].filter(Boolean);
          const uniqueParts = parts.filter(
            (part, index) =>
              parts.findIndex(
                (p) => p.toLowerCase() === part.toLowerCase()
              ) === index
          );
          const placeName =
            uniqueParts.length > 0 ? uniqueParts.join(', ') : 'Unknown location';
          setQuery(placeName);
          setLocationStatus(`Accuracy: ±${Math.round(accuracy)}m`);
        } catch (err) {
          setLocationStatus('Could not resolve village name. Showing coordinates.');
          setQuery(`Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)}`);
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setLocationStatus(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission denied.'
            : 'Unable to fetch location. Try again.'
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleUseCurrentLocation = () => {
    setLocationConsentOpen(true);
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Headline animation - word by word
      const words = headlineRef.current?.querySelectorAll('.word');
      if (words) {
        gsap.fromTo(
          words,
          { opacity: 0, y: 50, rotateX: -90 },
          {
            opacity: 1,
            y: 0,
            rotateX: 0,
            duration: 0.8,
            stagger: 0.1,
            ease: 'expo.out',
            delay: 0.3,
          }
        );
      }

      // Subheadline
      gsap.fromTo(
        subheadlineRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out', delay: 0.9 }
      );

      // Search box
      gsap.fromTo(
        searchRef.current,
        { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1, duration: 0.7, ease: 'back.out(1.7)', delay: 1.1 }
      );

      // Hero image
      gsap.fromTo(
        imageRef.current,
        { opacity: 0, x: 100 },
        { opacity: 1, x: 0, duration: 1, ease: 'expo.out', delay: 0.8 }
      );
    }, heroRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-white via-brand-gray1 to-white pt-[72px] lg:pt-0"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-10 w-72 h-72 bg-brand-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-brand-secondary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-primary/3 rounded-full blur-3xl" />
      </div>

      <div className="relative page-container min-h-screen flex items-center">
        <div className="grid lg:grid-cols-2 gap-6 items-center w-full py-12 lg:py-0">
          {/* Left Content */}
          <div className="space-y-8 text-center lg:text-left">
            {/* Headline */}
            <h1
              ref={headlineRef}
              className="text-[28px] sm:text-[42px] lg:text-[56px] font-semibold text-brand-black leading-tight perspective-1000"
            >
              <span className="word inline-block">Find</span>{' '}
              <span className="word inline-block">Your</span>{' '}
              <span className="word inline-block text-brand-primary">Perfect</span>{' '}
              <span className="word inline-block text-brand-primary">Property</span>{' '}
              <span className="word inline-block">with</span>{' '}
              <span className="word inline-block">AI-Powered</span>{' '}
              <span className="word inline-block">Intelligence</span>
            </h1>

            {/* Subheadline */}
            <p
              ref={subheadlineRef}
              className="text-[20px] text-brand-gray3 max-w-xl mx-auto lg:mx-0"
            >
              Buy, Sell, Rent & Invest in Properties with Smart Technology. Your trusted partner in real estate.
            </p>

            {/* Search Box */}
            <div
              ref={searchRef}
              className="relative max-w-xl mx-auto lg:mx-0"
            >
              <div className="relative">
                <div className="relative flex items-center bg-white rounded-lg shadow-card hover:shadow-card-hover transition-shadow duration-300 p-2">
                <Search className="w-5 h-5 text-brand-gray3 ml-4 flex-shrink-0" />
                <Input
                  type="text"
                  placeholder="Search nearby (properties, schools, hospitals...)"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base px-4 text-black"
                />
                <Button className="bg-brand-primary hover:bg-brand-primary-dark text-white rounded-lg px-7 py-3.5 font-semibold transition-all duration-300 hover:scale-105 flex-shrink-0">
                  Search Nearby
                </Button>
              </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-brand-gray3">
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-gray2 text-brand-black hover:border-brand-primary hover:text-brand-primary transition-colors"
                  disabled={isLocating}
                >
                  <MapPin className="w-4 h-4" />
                  {isLocating ? 'Locating...' : 'Use Current Location'}
                </button>
                {locationStatus && (
                  <span className="text-brand-gray3">{locationStatus}</span>
                )}
              </div>
            </div>

          </div>

          {/* Right Content - Hero Image */}
          <div
            ref={imageRef}
            className="relative hidden lg:block"
          >
            <div className="relative">
              {/* Main Image */}
              <div className="relative rounded-xl overflow-hidden shadow-2xl">
                <img
                  src="/images/hero-bg.jpg"
                  alt="Modern luxury property"
                  className="w-full h-[500px] xl:h-[600px] object-cover"
                />
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
              </div>

              {/* Floating Stats Card */}
              <div
                className="absolute -bottom-6 -left-6 bg-white rounded-xl shadow-card-hover p-6 animate-float"
                style={{ animationDelay: '0.5s' }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-brand-primary/10 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-brand-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-brand-black">50K+</p>
                    <p className="text-sm text-brand-gray3">Properties Listed</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={locationConsentOpen} onOpenChange={setLocationConsentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Allow Location Access?</AlertDialogTitle>
            <AlertDialogDescription>
              We use your location only to fill nearby place suggestions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setLocationStatus('Location permission not granted.')}
              disabled={isLocating}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setLocationConsentOpen(false);
                requestCurrentLocation();
              }}
              disabled={isLocating}
            >
              Allow Location
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
