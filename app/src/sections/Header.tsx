import { useState, useEffect, useRef } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const navLinks = [
  { label: 'Buy', href: '#categories' },
  { label: 'Sell', href: '#categories' },
  { label: 'Rent', href: '#categories' },
  { label: 'Invest', href: '#categories' },
  { label: 'Services', href: '#services' },
  { label: 'News', href: '#news' },
];

interface HeaderProps {
  onLogin: () => void;
  onRegister: () => void;
  onHome: () => void;
  currentView: 'home' | 'login' | 'register';
}

export default function Header({ onLogin, onRegister, onHome, currentView }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 50);

      const isScrollingDown = currentScrollY > lastScrollY.current;
      if (currentScrollY < 10) {
        setIsHidden(false);
      } else if (isScrollingDown && currentScrollY > 120) {
        setIsHidden(true);
      } else if (!isScrollingDown) {
        setIsHidden(false);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const shouldHide = isHidden && !isOpen;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-expo-out ${
        isScrolled
          ? 'glass shadow-lg h-[72px]'
          : 'bg-transparent h-[72px]'
      } ${shouldHide ? '-translate-y-full' : 'translate-y-0'}`}
    >
      <div className="page-container h-full">
        <div className="flex items-center justify-between h-full">
          {/* Logo */}
          <a
            href="#"
            className="flex items-center gap-3 group"
          >
            <div className="flex items-center justify-center transition-transform duration-300 group-hover:scale-110 overflow-hidden">
              <img
                src="/images/logo-transparent.png"
                alt="ZDT Realty"
                className="w-14 h-14 object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-brand-black leading-tight">
                ZDT <span className="text-brand-primary">Realty</span>
              </span>
              <span className="text-sm text-brand-gray3 uppercase tracking-wider">
                Where Trust Meets Property
              </span>
            </div>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-6">
            {navLinks.map((link, index) => (
              <a
                key={link.label}
                href={link.href}
                className="relative text-base font-medium text-brand-gray3 hover:text-brand-primary transition-colors duration-300 group"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                {link.label}
                <span className="absolute -bottom-1 left-1/2 w-0 h-0.5 bg-brand-primary transition-all duration-300 group-hover:w-full group-hover:left-0" />
              </a>
            ))}
          </nav>

          {/* Auth Buttons and CTA Button */}
          <div className="hidden lg:flex items-center gap-4">
            {currentView === 'home' ? (
              <>
                <Button
                  variant="ghost"
                  onClick={onLogin}
                  className="text-brand-gray3 hover:text-brand-primary font-medium px-6 py-3 text-[15px] rounded-lg"
                >
                  Login
                </Button>
                <Button
                  onClick={onRegister}
                  className="bg-brand-primary hover:bg-brand-primary-dark text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105 text-[15px]"
                >
                  Register
                </Button>
              </>
            ) : (
              <Button
                onClick={onHome}
                className="bg-brand-primary hover:bg-brand-primary-dark text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105 hover:shadow-glow text-[15px]"
              >
                Home
              </Button>
            )}
          </div>

          {/* Mobile Menu */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon" className="relative">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-8">
                  <div className="flex items-center justify-center overflow-hidden">
                    <img
                      src="/images/logo-transparent.png"
                      alt="ZDT Realty"
                      className="w-14 h-14 object-contain"
                    />
                  </div>
                  <div>
                    <span className="text-[20px] font-bold">
                      ZDT <span className="text-brand-primary">Realty</span>
                    </span>
                    <p className="text-sm text-brand-gray3">Where Trust Meets Property</p>
                  </div>
                </div>
                <nav className="flex flex-col gap-6">
                  {navLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                      className="text-base font-medium text-brand-gray3 hover:text-brand-primary transition-colors duration-300 py-2"
                    >
                      {link.label}
                    </a>
                  ))}
                </nav>
                <div className="mt-auto pb-8">
                  <Button className="w-full bg-brand-primary hover:bg-brand-primary-dark text-white rounded-lg font-semibold py-3">
                    Register
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
