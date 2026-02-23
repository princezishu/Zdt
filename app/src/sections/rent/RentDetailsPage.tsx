import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Flag,
  MapPin,
  MessageCircle,
  PhoneCall,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PropertyCardsSkeleton } from '@/components/loading/PageSkeletons';

interface RentDetailsPageProps {
  rentalId: string;
  onBackToRent: () => void;
  onOpenSimilar: (propertyId: string) => void;
  onOpenSaved: () => void;
  onOpenShortTerm: () => void;
  onOpenCoLiving: () => void;
  onOpenMessages: (propertyReference?: string) => void;
}

interface RentalDetails {
  id: number;
  title: string;
  description: string;
  monthlyRent: number | null;
  securityDeposit: number | null;
  maintenanceCharges: number | null;
  maintenanceIncluded: boolean;
  city: string;
  locality: string;
  address: string;
  bhk: number | null;
  carpetArea: number | null;
  furnishedStatus: string;
  tenantPreference: string;
  availableFrom: string;
  leaseDuration: string;
  noticePeriod: string;
  parking: string;
  petsAllowed: boolean;
  smokingAllowed: boolean;
  rentalModel: string;
  nightlyRate: number | null;
  weeklyRate: number | null;
  cleaningFee: number | null;
  serviceFee: number | null;
  seatsAvailable: number | null;
  imageUrls: string[];
  primaryImage: string;
  virtualTourUrl: string;
  isVerified: boolean;
  isFeatured: boolean;
  viewCount: number;
  amenities: string[];
}

interface DetailsResponse {
  rental: RentalDetails;
}

interface SimilarResponse {
  rentals: Array<{ id: number; title: string; city: string; locality: string; primaryImage: string; monthlyRent: number | null }>;
}

function formatCurrency(value: number | null, suffix = ''): string {
  if (!value || value <= 0) return 'On request';
  return `INR ${Math.round(value).toLocaleString('en-IN')}${suffix}`;
}

export default function RentDetailsPage({
  rentalId,
  onBackToRent,
  onOpenSimilar,
  onOpenSaved,
  onOpenShortTerm,
  onOpenCoLiving,
  onOpenMessages,
}: RentDetailsPageProps) {
  const [rental, setRental] = useState<RentalDetails | null>(null);
  const [similar, setSimilar] = useState<SimilarResponse['rentals']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeImage, setActiveImage] = useState('');

  const [leadMessage, setLeadMessage] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    apiRequest<DetailsResponse>(`/api/rentals/${rentalId}`)
      .then((response) => {
        if (!active) return;
        setRental(response.rental);
        setActiveImage(response.rental.primaryImage || response.rental.imageUrls?.[0] || '/images/property-1.jpg');
        if (response.rental.city) {
          apiRequest<SimilarResponse>(`/api/rentals?city=${encodeURIComponent(response.rental.city)}&limit=3`)
            .then((similarResponse) => {
              if (!active) return;
              setSimilar(similarResponse.rentals || []);
            })
            .catch(() => {
              if (!active) return;
              setSimilar([]);
            });
        }
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load rental');
        setRental(null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [rentalId]);

  const gallery = useMemo(() => {
    if (!rental) return [];
    const images = rental.imageUrls && rental.imageUrls.length > 0 ? rental.imageUrls : [rental.primaryImage];
    return images.filter(Boolean);
  }, [rental]);

  const submitLead = async () => {
    if (!rental) return;
    if (!leadMessage.trim()) {
      toast.error('Please add a message before submitting.');
      return;
    }
    try {
      await apiRequest('/api/rentals/leads', {
        method: 'POST',
        body: JSON.stringify({ rentalId: rental.id, message: leadMessage.trim() }),
      });
      toast.success('Request sent to owner');
      setLeadMessage('');
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : 'Unable to send request');
    }
  };

  if (loading) {
    return (
      <section className="pb-16 pt-28">
        <div className="page-container">
          <PropertyCardsSkeleton />
        </div>
      </section>
    );
  }

  if (!rental || error) {
    return (
      <section className="pb-16 pt-28">
        <div className="page-container">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {error || 'Rental not found.'}
          </div>
          <Button className="mt-4" onClick={onBackToRent}>Back to Rent</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" className="h-9" onClick={onBackToRent}>Back to Rent</Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-9" onClick={onOpenSaved}>Saved</Button>
            <Button variant="outline" className="h-9" onClick={onOpenShortTerm}>Short-Term</Button>
            <Button variant="outline" className="h-9" onClick={onOpenCoLiving}>Co-Living</Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <img src={activeImage} alt={rental.title} className="h-[360px] w-full object-cover sm:h-[440px]" />
              <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">
                {gallery.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setActiveImage(item)}
                    className={`overflow-hidden rounded-xl border ${activeImage === item ? 'border-blue-500' : 'border-slate-200'}`}
                  >
                    <img src={item} alt="Rental view" className="h-20 w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                {rental.isVerified && (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                    Verified listing
                  </Badge>
                )}
                {rental.isFeatured && (
                  <Badge className="bg-amber-500 text-white hover:bg-amber-500">Featured</Badge>
                )}
              </div>

              <h1 className="mt-4 text-3xl font-bold text-slate-900">{rental.title}</h1>
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-slate-400" />
                {rental.locality || rental.address}, {rental.city}
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Rent</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatCurrency(rental.monthlyRent, '/mo')}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Deposit</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatCurrency(rental.securityDeposit)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Maintenance</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {rental.maintenanceIncluded ? 'Included' : formatCurrency(rental.maintenanceCharges)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Available From</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {rental.availableFrom ? new Date(rental.availableFrom).toLocaleDateString('en-IN') : 'Immediate'}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Amenities</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {rental.amenities.map((amenity) => (
                      <span key={amenity} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Lease Terms</h3>
                  <div className="mt-3 space-y-2 text-xs text-slate-600">
                    <p>Lease duration: {rental.leaseDuration}</p>
                    <p>Notice period: {rental.noticePeriod || 'Standard'}</p>
                    <p>Tenant preference: {rental.tenantPreference}</p>
                    <p>Pets: {rental.petsAllowed ? 'Allowed' : 'Not allowed'}</p>
                    <p>Smoking: {rental.smokingAllowed ? 'Allowed' : 'Not allowed'}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">Description</h3>
                <p className="mt-2 text-sm text-slate-600">{rental.description}</p>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">House Rules</h3>
                  <div className="mt-3 space-y-2 text-xs text-slate-600">
                    <p>Quiet hours: 10 PM - 7 AM</p>
                    <p>Visitor policy: Register at gate</p>
                    <p>Rent due date: 5th of every month</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Price Breakdown</h3>
                  <div className="mt-3 space-y-2 text-xs text-slate-600">
                    <p>Rent: {formatCurrency(rental.monthlyRent)}</p>
                    <p>Deposit: {formatCurrency(rental.securityDeposit)}</p>
                    <p>Maintenance: {rental.maintenanceIncluded ? 'Included' : formatCurrency(rental.maintenanceCharges)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Locality Insights</h3>
                  <div className="mt-3 grid gap-2 text-xs text-slate-600">
                    <p>Travel time to metro: 14 minutes</p>
                    <p>Office hubs: 3 within 5 km</p>
                    <p>Colleges nearby: 2 premium campuses</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Virtual Tour</h3>
                  <div className="mt-3 text-xs text-slate-600">
                    {rental.virtualTourUrl ? 'Virtual tour available' : 'Virtual tour placeholder'}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Similar Rentals</h2>
                  <p className="text-sm text-slate-600">Curated nearby options</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {similar.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-blue-300"
                    onClick={() => onOpenSimilar(String(item.id))}
                  >
                    <img src={item.primaryImage || '/images/property-1.jpg'} alt={item.title} className="h-32 w-full object-cover" />
                    <div className="p-3">
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                      <p className="text-xs text-slate-500">{item.locality || item.city}</p>
                      <p className="mt-1 text-sm font-semibold text-blue-900">{formatCurrency(item.monthlyRent, '/mo')}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Monthly Rent</p>
              <p className="mt-2 text-3xl font-bold text-blue-900">{formatCurrency(rental.monthlyRent, '/mo')}</p>
              <p className="mt-2 text-sm text-slate-600">{rental.viewCount} views</p>

              <Button className="mt-4 h-11 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800" onClick={() => onOpenMessages(String(rental.id))}>
                <PhoneCall className="h-4 w-4" />
                Contact Owner
              </Button>

              <Button variant="outline" className="mt-3 h-10 w-full rounded-xl border-slate-300" onClick={submitLead}>
                Apply to Rent
              </Button>

              <div className="mt-3 space-y-2">
                <Textarea value={leadMessage} onChange={(e) => setLeadMessage(e.target.value)} placeholder="Tell us about your rental requirements" className="min-h-24" />
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-semibold text-slate-900">Schedule Visit</h3>
                <div className="mt-3 grid gap-2">
                  <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
                  <Input type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} />
                  <Button className="h-10 w-full" onClick={submitLead}>
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Schedule Visit
                  </Button>
                </div>
              </div>

              <Button variant="outline" className="mt-4 h-10 w-full border-slate-300" onClick={() => toast('Chat with owner coming soon.')}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Chat with Owner
              </Button>

              <Button variant="outline" className="mt-3 h-10 w-full border-slate-300 text-rose-700 hover:bg-rose-50 hover:text-rose-700" onClick={() => toast('Fraud report submitted.')}
              >
                <Flag className="mr-2 h-4 w-4" />
                Report Listing
              </Button>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Trust & Safety</h3>
              <ul className="mt-3 space-y-3 text-sm text-slate-700">
                <li className="inline-flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  KYC verified owner badge in progress.
                </li>
                <li className="inline-flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-amber-600" />
                  Agreement template download available.
                </li>
                <li className="inline-flex items-start gap-2">
                  <Flag className="mt-0.5 h-4 w-4 text-rose-600" />
                  Report any suspicious listings instantly.
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
