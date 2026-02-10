import Login from './sections/Login';
import Register from './sections/Register';
import Header from './sections/Header';
import Hero from './sections/Hero';
import Categories from './sections/Categories';
import FeaturedProperties from './sections/FeaturedProperties';
import Services from './sections/Services';
import Statistics from './sections/Statistics';
import Testimonials from './sections/Testimonials';
import Footer from './sections/Footer';
import Dashboard from './sections/Dashboard';
import { useState, useEffect } from 'react';

function App() {
  const [currentView, setCurrentView] = useState<'home' | 'login' | 'register' | 'dashboard'>('home');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const handleLogin = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentView('login');
  };

  const handleRegister = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentView('register');
  };

  const handleHome = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentView('home');
  };

  const handleDashboard = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentView('dashboard');
  };

  // --- COOL BACKGROUND COMPONENT ---
  const BackgroundEffects = () => (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-[#020617]" />
      <div className="absolute inset-0 aurora opacity-70" />
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-sky-500/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-cyan-400/15 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[800px] h-[400px] bg-emerald-400/10 rounded-full blur-[100px]" />
      <div className="absolute inset-0 futuristic-grid" />
      <div className="absolute inset-0 scanlines" />
      <div 
        className="absolute inset-0 opacity-[0.03]" 
        style={{ 
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', 
          backgroundSize: '40px 40px' 
        }} 
      />
    </div>
  );

  return (
    <div className={`min-h-screen text-slate-100 font-sans sci-fi selection:bg-cyan-500/30 selection:text-cyan-100 transition-opacity duration-700 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
      
      {/* 1. Global Background */}
      <BackgroundEffects />

      {/* 2. Main Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        
        {/* --- VIEW: LOGIN (No Header) --- */}
        {currentView === 'login' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-500 ease-out min-h-screen flex flex-col">
            {/* Note: Header is REMOVED here so the page is clean */}
            <Login onSwitchToRegister={handleRegister} onBack={handleHome} onLoginSuccess={handleDashboard} />
          </div>
        )}

        {/* --- VIEW: REGISTER (No Header) --- */}
        {currentView === 'register' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-500 ease-out min-h-screen flex flex-col">
            {/* Note: Header is REMOVED here so the page is clean */}
            <Register onSwitchToLogin={handleLogin} onBack={handleHome} />
          </div>
        )}

        {/* --- VIEW: DASHBOARD --- */}
        {currentView === 'dashboard' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-500 ease-out min-h-screen flex flex-col">
            <Dashboard onBackHome={handleHome} />
          </div>
        )}

        {/* --- VIEW: HOME (With Header) --- */}
        {currentView === 'home' && (
          <div className="animate-in fade-in zoom-in-95 duration-700 ease-out">
            <Header
              onLogin={handleLogin}
              onRegister={handleRegister}
              onHome={handleHome}
              currentView={currentView}
            />
            
            <main className="space-y-0">
              <Hero />
              
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/50 to-transparent pointer-events-none" />
                <Categories />
              </div>

              <FeaturedProperties />
              
              <div className="bg-slate-900/30 backdrop-blur-sm border-y border-white/5">
                <Services />
              </div>

              <Statistics />
              <Testimonials />
            </main>

            <Footer />
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
