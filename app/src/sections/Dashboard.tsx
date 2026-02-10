import { Bell, Calendar, ChevronRight, Heart, Home, MapPin, Search, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardProps {
  onBackHome: () => void;
}

const stats = [
  { label: 'Saved Properties', value: '18', icon: Heart },
  { label: 'Active Alerts', value: '6', icon: Bell },
  { label: 'Visits Scheduled', value: '3', icon: Calendar },
  { label: 'Market Match', value: '92%', icon: TrendingUp },
];

const activity = [
  {
    title: 'New listing matched your alert',
    description: '3 BHK in Indiranagar, Bengaluru',
    time: '2 hours ago',
  },
  {
    title: 'Price drop detected',
    description: 'Luxury villa in Whitefield',
    time: 'Yesterday',
  },
  {
    title: 'Visit confirmed with agent',
    description: 'Apartment tour scheduled for Friday',
    time: '2 days ago',
  },
];

const recommendations = [
  {
    title: 'Skyline Heights',
    location: 'Koramangala, Bengaluru',
    price: '₹1.28 Cr',
  },
  {
    title: 'Riverstone Villas',
    location: 'Sarjapur Road, Bengaluru',
    price: '₹2.4 Cr',
  },
  {
    title: 'Zenith Apartments',
    location: 'HSR Layout, Bengaluru',
    price: '₹92 L',
  },
];

export default function Dashboard({ onBackHome }: DashboardProps) {
  return (
    <section className="relative min-h-screen w-full bg-white overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 section-glow opacity-95" />
      <div className="absolute inset-0 futuristic-grid opacity-20" />
      <div className="absolute -top-20 -right-20 h-[320px] w-[320px] rounded-full bg-brand-secondary/15 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-[420px] w-[420px] rounded-full bg-brand-primary/10 blur-3xl" />

      <div className="relative page-container py-10">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-gray2 bg-white/80 p-6 shadow-card">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary text-white">
              <Home className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-brand-gray3">Welcome back</p>
              <h1 className="text-2xl font-semibold text-brand-black">User Dashboard</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              className="border border-brand-gray2 text-brand-gray3 hover:text-brand-primary hover:border-brand-primary"
            >
              <Search className="mr-2 h-4 w-4" />
              New Search
            </Button>
            <Button
              className="bg-brand-primary hover:bg-brand-primary-dark text-white"
            >
              <MapPin className="mr-2 h-4 w-4" />
              Start a Tour
            </Button>
            <Button
              variant="ghost"
              onClick={onBackHome}
              className="border border-brand-gray2 text-brand-gray3 hover:text-brand-primary hover:border-brand-primary"
            >
              Back to Home
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-brand-gray2 bg-white/90 p-5 shadow-card-hover neon-card"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-brand-gray3">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-brand-black">
                    {stat.value}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-secondary/15 text-brand-primary">
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Activity */}
          <div className="rounded-2xl border border-brand-gray2 bg-white/90 p-6 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-black">Recent activity</h2>
              <Button variant="ghost" className="text-brand-primary">
                View all
              </Button>
            </div>
            <div className="mt-6 space-y-4">
              {activity.map((item) => (
                <div
                  key={item.title}
                  className="flex items-start justify-between gap-4 rounded-xl border border-brand-gray2/70 bg-white p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-brand-black">{item.title}</p>
                    <p className="text-xs text-brand-gray3">{item.description}</p>
                  </div>
                  <span className="text-xs text-brand-gray3">{item.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div className="rounded-2xl border border-brand-gray2 bg-white/90 p-6 shadow-card">
            <h2 className="text-lg font-semibold text-brand-black">Recommended for you</h2>
            <div className="mt-6 space-y-4">
              {recommendations.map((item) => (
                <div
                  key={item.title}
                  className="flex items-center justify-between rounded-xl border border-brand-gray2/70 bg-white p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-brand-black">{item.title}</p>
                    <p className="text-xs text-brand-gray3">{item.location}</p>
                    <p className="mt-1 text-sm font-semibold text-brand-primary">
                      {item.price}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="text-brand-primary hover:text-brand-secondary"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
