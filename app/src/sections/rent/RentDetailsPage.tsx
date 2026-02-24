import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarDays, Flag, MapPin, MessageCircle, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PropertyCardsSkeleton } from '@/components/loading/PageSkeletons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface RentDetailsPageProps {
  rentalId: string;
  onBackToRent: () => void;
  onOpenSimilar: (propertyId: string) => void;
  onOpenSaved: () => void;
  onOpenCompare: () => void;
  onOpenMessages: (propertyReference?: string, draftMessage?: string) => void;
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
  propertyType: string;
  furnishedStatus: string;
  tenantPreference: string;
  availableFrom: string;
  leaseDuration: string;
  lockInPeriod?: string;
  parking: string;
  petsAllowed: boolean;
  usageType?: string;
  ownerName?: string;
  builderName?: string;
  companyName?: string;
  imageUrls: string[];
  primaryImage: string;
  isVerified: boolean;
  amenities: string[];
}

interface SimilarResponse {
  rentals: Array<{ id: number; title: string; city: string; locality: string; primaryImage: string; monthlyRent: number | null }>;
}

const fmt = (value: number | null, suffix = '') => (!value || value <= 0 ? 'On request' : `INR ${Math.round(value).toLocaleString('en-IN')}${suffix}`);
const dateLabel = (value: string) => {
  if (!value) return 'Immediate';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Immediate' : date.toLocaleDateString('en-IN');
};

export default function RentDetailsPage({
  rentalId,
  onBackToRent,
  onOpenSimilar,
  onOpenSaved,
  onOpenCompare,
  onOpenMessages,
}: RentDetailsPageProps) {
  const [rental, setRental] = useState<RentalDetails | null>(null);
  const [similar, setSimilar] = useState<SimilarResponse['rentals']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeImage, setActiveImage] = useState('');

  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantMessage, setTenantMessage] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [reportReason, setReportReason] = useState('incorrect_rent');
  const [reportDetails, setReportDetails] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    apiRequest<{ rental: RentalDetails }>(`/api/rentals/${rentalId}`)
      .then((response) => {
        if (!active) return;
        setRental(response.rental);
        const image = response.rental.primaryImage || response.rental.imageUrls?.[0] || '/images/property-1.jpg';
        setActiveImage(image);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load rental details');
        setRental(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [rentalId]);

  useEffect(() => {
    if (!rental?.city) return;
    let active = true;
    apiRequest<SimilarResponse>(`/api/rentals?city=${encodeURIComponent(rental.city)}&limit=3`)
      .then((response) => {
        if (active) setSimilar(response.rentals || []);
      })
      .catch(() => {
        if (active) setSimilar([]);
      });
    return () => {
      active = false;
    };
  }, [rental?.city]);

  const affordabilityHint = useMemo(() => {
    const income = Number(monthlyIncome);
    if (!Number.isFinite(income) || income <= 0) return 'Enter monthly income for rent affordability guidance.';
    const suggested = Math.round(income * 0.3);
    return `Suggested monthly rent budget: INR ${suggested.toLocaleString('en-IN')} (30% of income).`;
  }, [monthlyIncome]);

  const submitLead = async (type: 'callback' | 'visit' | 'enquiry' | 'report') => {
    if (!rental) return;
    if (!tenantName.trim() || !tenantPhone.trim()) {
      toast.error('Please enter your name and phone number.');
      return;
    }

    let message = tenantMessage.trim();
    if (type === 'callback') {
      message = message || 'Requesting a call back for rental details.';
    } else if (type === 'visit') {
      message = `Schedule visit request for ${visitDate || 'TBD'} at ${visitTime || 'TBD'}. ${message}`.trim();
    } else if (type === 'report') {
      message = `Report reason: ${reportReason}. ${reportDetails || ''}`.trim();
    } else {
      message = message || 'Interested in this rental. Please share terms.';
    }

    if (!message) {
      toast.error('Please add a short message.');
      return;
    }

    try {
      setSubmitting(true);
      await apiRequest('/api/rentals/leads', {
        method: 'POST',
        body: JSON.stringify({
          rentalId: rental.id,
          action: type,
          name: tenantName.trim(),
          phone: tenantPhone.trim(),
          message,
        }),
      });
      toast.success(type === 'report' ? 'Listing report submitted.' : 'Request sent successfully.');
      if (type !== 'report') setTenantMessage('');
      if (type === 'report') setReportDetails('');
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : 'Unable to submit request');
    } finally {
      setSubmitting(false);
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
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error || 'Rental not found.'}</div>
          <Button className="mt-4" onClick={onBackToRent}>Back to Rent</Button>
        </div>
      </section>
    );
  }

  const ownerName = rental.ownerName || rental.builderName || rental.companyName || 'Verified Owner / Builder';
  const areaLabel = rental.carpetArea ? `${rental.carpetArea} sq.ft` : 'Area on request';
  const gallery = rental.imageUrls?.length ? rental.imageUrls : [rental.primaryImage];

  return (
    <section className="pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" className="h-9" onClick={onBackToRent}>Back to Rent</Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-9" onClick={onOpenSaved}>Save & Shortlist</Button>
            <Button variant="outline" className="h-9" onClick={onOpenCompare}>Compare Rentals</Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <img src={activeImage || '/images/property-1.jpg'} alt={rental.title} className="h-[340px] w-full object-cover sm:h-[420px]" />
              <div className="grid grid-cols-4 gap-2 p-3">
                {gallery.filter(Boolean).map((image) => (
                  <button key={image} type="button" onClick={() => setActiveImage(image)} className={`overflow-hidden rounded-xl border ${activeImage === image ? 'border-slate-900' : 'border-slate-200'}`}>
                    <img src={image} alt="Rental view" className="h-20 w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-slate-900 text-white hover:bg-slate-900">Rent Property</Badge>
                {rental.isVerified && <Badge className="bg-emerald-600 text-white hover:bg-emerald-600"><BadgeCheck className="mr-1 h-3.5 w-3.5" />Verified listing</Badge>}
              </div>
              <h1 className="mt-4 text-3xl font-semibold text-slate-900">{rental.title}</h1>
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600"><MapPin className="h-4 w-4 text-slate-500" />{rental.locality || rental.address}, {rental.city}</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <InfoCard label="Monthly Rent" value={fmt(rental.monthlyRent, '/mo')} />
                <InfoCard label="Security Deposit" value={fmt(rental.securityDeposit)} />
                <InfoCard label="Maintenance Charges" value={rental.maintenanceIncluded ? 'Included' : fmt(rental.maintenanceCharges)} />
                <InfoCard label="Lease Duration" value={rental.leaseDuration || 'As agreed'} />
                <InfoCard label="Lock-in Period" value={rental.lockInPeriod || 'Not specified'} />
                <InfoCard label="Area + Type" value={`${areaLabel} - ${rental.bhk ? `${rental.bhk} BHK` : rental.propertyType || 'Rental'}`} />
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Property Description</h2>
              <p className="mt-3 text-sm leading-6 text-slate-700">{rental.description || 'Rental terms will be shared by the owner.'}</p>
              <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                <InfoCard label="Usage Rules" value={rental.usageType || 'Residential / Commercial as mentioned by owner'} />
                <InfoCard label="Pet Policy" value={rental.petsAllowed ? 'Pets allowed' : 'No pets policy'} />
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Furnishing & Amenities</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">{rental.furnishedStatus || 'Furnishing details on request'}</span>
                {(rental.amenities?.length ? rental.amenities : ['Parking', 'Lift', 'Security']).map((amenity) => (
                  <span key={amenity} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">{amenity}</span>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Availability & Schedule</h2>
              <p className="mt-2 text-sm text-slate-600">Available from {dateLabel(rental.availableFrom)}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
                <Input type="time" value={visitTime} onChange={(event) => setVisitTime(event.target.value)} />
              </div>
              <Button className="mt-3" onClick={() => void submitLead('visit')} disabled={submitting}>
                <CalendarDays className="mr-2 h-4 w-4" />
                Schedule Visit
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Location & Connectivity</h2>
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">Map View</p>
                  <p className="mt-1">{rental.locality || rental.address}, {rental.city}</p>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  <li>Transport: Local bus and city access points nearby</li>
                  <li>Schools: Educational institutions in local radius</li>
                  <li>Offices: Employment hubs within city travel distance</li>
                  <li>Markets: Daily needs and grocery markets nearby</li>
                </ul>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Owner / Builder Profile</h2>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p><span className="font-medium text-slate-900">Name:</span> {ownerName}</p>
                  <p><span className="font-medium text-slate-900">Verification:</span> {rental.isVerified ? 'Verified' : 'In review'}</p>
                  <p><span className="font-medium text-slate-900">Response Time:</span> Usually within 2-6 business hours</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Tenant Actions</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Input value={tenantName} onChange={(event) => setTenantName(event.target.value)} placeholder="Your name" />
                <Input value={tenantPhone} onChange={(event) => setTenantPhone(event.target.value)} placeholder="Phone number" />
                <Textarea value={tenantMessage} onChange={(event) => setTenantMessage(event.target.value)} placeholder="Send enquiry to owner" className="min-h-24 sm:col-span-2" />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Button onClick={() => void submitLead('callback')} disabled={submitting}>Request Call Back</Button>
                <Button variant="outline" onClick={() => void submitLead('visit')} disabled={submitting}>Schedule Visit</Button>
                <Button variant="outline" onClick={() => void submitLead('enquiry')} disabled={submitting}>Send Enquiry</Button>
              </div>
              <p className="mt-3 text-xs text-slate-600">No payment collected on platform.</p>
            </div>

            <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Safety & Transparency</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Select value={reportReason} onValueChange={setReportReason}>
                  <SelectTrigger><SelectValue placeholder="Reason" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incorrect_rent">Incorrect rent</SelectItem>
                    <SelectItem value="already_rented">Already rented</SelectItem>
                    <SelectItem value="fake_listing">Fake listing</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="Add details (optional)" className="min-h-24" />
              </div>
              <Button variant="outline" className="mt-3 border-rose-300 text-rose-700 hover:bg-rose-100 hover:text-rose-700" onClick={() => void submitLead('report')} disabled={submitting}>
                <Flag className="mr-2 h-4 w-4" />
                Report Listing
              </Button>
              <p className="mt-3 text-xs text-slate-600">
                ZDT Realty is an independent real estate platform. Rental agreements and payments are handled directly between owners and tenants.
              </p>
            </div>

            {similar.length > 0 && (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Similar Rentals</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {similar.map((item) => (
                    <button key={item.id} type="button" onClick={() => onOpenSimilar(String(item.id))} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-slate-300">
                      <img src={item.primaryImage || '/images/property-1.jpg'} alt={item.title} className="h-28 w-full object-cover" />
                      <div className="p-3">
                        <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-600">{item.locality || item.city}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{fmt(item.monthlyRent, '/mo')}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Rent Summary</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{fmt(rental.monthlyRent, '/mo')}</p>
              <p className="mt-2 text-sm text-slate-600">Deposit: {fmt(rental.securityDeposit)}</p>
              <Button className="mt-4 w-full bg-slate-900 text-white hover:bg-slate-800" onClick={() => onOpenMessages(String(rental.id), 'Hi, please share full rental terms and availability details.')}>
                <MessageCircle className="mr-2 h-4 w-4" />
                Contact Owner
              </Button>
              <Button variant="outline" className="mt-3 w-full" onClick={onOpenSaved}>Save & Shortlist</Button>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Rent Affordability Calculator</h3>
              <Input className="mt-3" value={monthlyIncome} onChange={(event) => setMonthlyIncome(event.target.value)} placeholder="Monthly income (INR)" />
              <p className="mt-2 text-xs text-slate-600">{affordabilityHint}</p>
              <div className="mt-3 grid gap-2">
                <Button variant="outline" onClick={onOpenCompare}>Compare Rentals</Button>
                <Button variant="outline" onClick={onOpenSaved}>Save & Shortlist</Button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Trust & Verification</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li className="inline-flex items-start gap-2"><UserRoundCheck className="mt-0.5 h-4 w-4 text-emerald-600" />Owner verification: {rental.isVerified ? 'Yes' : 'In progress'}</li>
                <li className="inline-flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-amber-600" />Ownership check: In Progress</li>
                <li className="inline-flex items-start gap-2"><Flag className="mt-0.5 h-4 w-4 text-rose-600" />Report incorrect or suspicious listings</li>
              </ul>
            </div>
          </aside>
        </div>

        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          ZDT Realty is an independent real estate platform focused on transparent and verified rental listings.
        </p>
      </div>
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
