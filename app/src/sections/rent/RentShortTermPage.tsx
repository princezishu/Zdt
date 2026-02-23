import { useEffect, useState } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { apiRequest } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { PropertyCardsSkeleton } from '@/components/loading/PageSkeletons';

interface RentShortTermPageProps {
  onOpenDetails: (propertyId: string) => void;
  onOpenSaved: () => void;
  onOpenMap: () => void;
  onOpenList: () => void;
}

interface ShortTermRental {
  id: number;
  title: string;
  city: string;
  locality: string;
  nightlyRate: number | null;
  weeklyRate: number | null;
  cleaningFee: number | null;
  primaryImage: string;
  amenities: string[];
}

interface ShortTermResponse {
  rentals: ShortTermRental[];
}

function formatPrice(value: number | null, suffix: string) {
  if (!value || value <= 0) return 'On request';
  return `INR ${Math.round(value).toLocaleString('en-IN')}${suffix}`;
}

export default function RentShortTermPage({ onOpenDetails, onOpenSaved, onOpenMap, onOpenList }: RentShortTermPageProps) {
  const [rentals, setRentals] = useState<ShortTermRental[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    apiRequest<ShortTermResponse>('/api/rentals?rentalModel=short_term&sort=recommended&limit=24')
      .then((response) => {
        if (!active) return;
        setRentals(response.rentals || []);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load short-term rentals');
        setRentals([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="pb-20 pt-28 text-slate-900">
      <div className="page-container space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Short-Term Rentals</h1>
            <p className="text-sm text-slate-600">Daily & weekly stays with calendar availability.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-9" onClick={onOpenList}>Back to Rent</Button>
            <Button variant="outline" className="h-9" onClick={onOpenMap}>Map View</Button>
            <Button variant="outline" className="h-9" onClick={onOpenSaved}>Saved</Button>
          </div>
        </div>

        {loading ? (
          <PropertyCardsSkeleton />
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rentals.map((rental) => (
              <article key={rental.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <img src={rental.primaryImage || '/images/property-1.jpg'} alt={rental.title} className="h-44 w-full object-cover" />
                <div className="space-y-3 p-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{rental.title}</h3>
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {rental.locality || rental.city}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <p className="font-semibold text-slate-900">{formatPrice(rental.nightlyRate, '/night')}</p>
                    <p className="text-xs text-slate-500">{formatPrice(rental.weeklyRate, '/week')}</p>
                    <p className="text-xs text-slate-500">Cleaning fee {formatPrice(rental.cleaningFee, '')}</p>
                  </div>
                  <Button className="h-10 w-full" onClick={() => onOpenDetails(String(rental.id))}>
                    <CalendarDays className="mr-2 h-4 w-4" />
                    View Availability
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
