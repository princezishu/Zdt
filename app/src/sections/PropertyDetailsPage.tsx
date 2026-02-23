import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Bus,
  CalendarDays,
  Camera,
  Car,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Download,
  Dumbbell,
  FileCheck2,
  GitCompareArrows,
  Heart,
  Hospital,
  IndianRupee,
  Landmark,
  LineChart,
  MapPin,
  MessageCircle,
  PhoneCall,
  PlayCircle,
  School,
  Share2,
  ShieldCheck,
  Star,
  Store,
  Trees,
  Users,
  Waves,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import { apiRequest } from '@/lib/http';
import { PhoneVerificationField } from './workflow/CommonBlocks';

type PropertyCategory = 'Flat' | 'Villa' | 'Plot' | 'Commercial';

interface PropertyDetailsPageProps {
  onOpenChat?: (propertyReference?: string) => void;
}

interface MediaAsset {
  src: string;
  label: string;
}

interface SimilarProperty {
  id: string;
  title: string;
  location: string;
  price: string;
  bhk: string;
  image: string;
}

interface Amenity {
  label: string;
  icon: LucideIcon;
}

const mediaAssets: MediaAsset[] = [
  { src: '/images/property-1.jpg', label: 'Living Room View' },
  { src: '/images/property-2.jpg', label: 'Front Elevation' },
  { src: '/images/property-3.jpg', label: 'Master Bedroom' },
  { src: '/images/property-4.jpg', label: 'Kitchen and Dining' },
  { src: '/images/property-5.jpg', label: 'Amenity Deck' },
];

const specsByType: Record<PropertyCategory, Array<{ label: string; value: string }>> = {
  Flat: [
    { label: 'BHK', value: '3 BHK' },
    { label: 'Carpet Area', value: '1,420 sq.ft' },
    { label: 'Built-up Area', value: '1,790 sq.ft' },
    { label: 'Floor / Total Floors', value: '11 / 22' },
    { label: 'Furnished Type', value: 'Semi-Furnished' },
    { label: 'Age of Building', value: '4 Years' },
    { label: 'Lift', value: '4 High Speed Lifts' },
    { label: 'Parking', value: '2 Covered Slots' },
    { label: 'Society Name', value: 'Skyline Meridian' },
  ],
  Villa: [
    { label: 'BHK', value: '4 BHK' },
    { label: 'Land Area', value: '2,900 sq.ft' },
    { label: 'Built-up Area', value: '3,450 sq.ft' },
    { label: 'Floors', value: 'G + 2' },
    { label: 'Private Garden', value: 'Yes' },
    { label: 'Parking', value: '2 Car Private Parking' },
    { label: 'Furnished Type', value: 'Fully Furnished' },
    { label: 'Age', value: '2 Years' },
  ],
  Plot: [
    { label: 'Plot Area', value: '2,400 sq.ft' },
    { label: 'Dimensions', value: '40 x 60 ft' },
    { label: 'Road Width', value: '40 ft Road' },
    { label: 'Corner Plot', value: 'Yes' },
    { label: 'Facing Direction', value: 'East Facing' },
    { label: 'Plot Shape', value: 'Rectangular' },
    { label: 'Boundary Wall', value: 'Available' },
    { label: 'Approvals', value: 'NA + RERA Approved' },
  ],
  Commercial: [
    { label: 'Type', value: 'Office Space' },
    { label: 'Area', value: '2,150 sq.ft' },
    { label: 'Floor', value: '8th Floor' },
    { label: 'Washroom', value: '2 Attached' },
    { label: 'Parking', value: '4 Reserved' },
    { label: 'Power Backup', value: '100% DG Backup' },
    { label: 'Suitable For', value: 'IT / Startup Office' },
  ],
};

const amenities: Amenity[] = [
  { label: 'Parking', icon: Car },
  { label: 'Lift', icon: Building2 },
  { label: 'Security', icon: ShieldCheck },
  { label: 'CCTV', icon: Camera },
  { label: 'Power Backup', icon: Zap },
  { label: 'Swimming Pool', icon: Waves },
  { label: 'Clubhouse', icon: Users },
  { label: 'Garden', icon: Trees },
  { label: 'Gym', icon: Dumbbell },
  { label: "Children's Play Area", icon: Star },
];

const similarProperties: SimilarProperty[] = [
  {
    id: 'ZDT-PR-1948',
    title: 'Lakeview Heights Residence',
    location: 'Koregaon Park, Pune',
    price: 'Rs 2.55 Cr',
    bhk: '3 BHK',
    image: '/images/property-2.jpg',
  },
  {
    id: 'ZDT-PR-2194',
    title: 'Emerald Court Premium Flat',
    location: 'Kalyani Nagar, Pune',
    price: 'Rs 2.2 Cr',
    bhk: '3 BHK',
    image: '/images/property-3.jpg',
  },
  {
    id: 'ZDT-PR-2307',
    title: 'Riverside Business Suites',
    location: 'Baner, Pune',
    price: 'Rs 2.8 Cr',
    bhk: 'Commercial',
    image: '/images/property-4.jpg',
  },
  {
    id: 'ZDT-PR-2411',
    title: 'Aster Family Homes',
    location: 'Viman Nagar, Pune',
    price: 'Rs 1.95 Cr',
    bhk: '3 BHK',
    image: '/images/property-5.jpg',
  },
];

const priceTrendBars = [68, 72, 75, 79, 84, 88];
const investmentTrendBars = [55, 63, 69, 72, 78, 82];

export default function PropertyDetailsPage({ onOpenChat }: PropertyDetailsPageProps) {
  const [activeMedia, setActiveMedia] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [isCompared, setIsCompared] = useState(false);
  const [activeSpecType, setActiveSpecType] = useState<PropertyCategory>('Flat');
  const [shareState, setShareState] = useState('');
  const [visitFormOpen, setVisitFormOpen] = useState(false);
  const [visitName, setVisitName] = useState('');
  const [visitPhone, setVisitPhone] = useState('');
  const [visitPhoneVerificationId, setVisitPhoneVerificationId] = useState('');
  const [visitCity, setVisitCity] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [visitMessage, setVisitMessage] = useState('');
  const [isVisitSubmitting, setIsVisitSubmitting] = useState(false);
  const [fraudFormOpen, setFraudFormOpen] = useState(false);
  const [fraudReporterName, setFraudReporterName] = useState('');
  const [fraudPhone, setFraudPhone] = useState('');
  const [fraudPhoneVerificationId, setFraudPhoneVerificationId] = useState('');
  const [fraudReason, setFraudReason] = useState('');
  const [fraudMessage, setFraudMessage] = useState('');

  const specificationRows = useMemo(() => specsByType[activeSpecType], [activeSpecType]);

  const handleShare = async () => {
    const sharePayload = {
      title: 'ZDT Realty | Skyline Meridian',
      text: 'Check this verified premium listing on ZDT Realty.',
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(sharePayload);
        setShareState('Shared');
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShareState('Link copied');
      }
    } catch {
      setShareState('Share unavailable');
    }

    window.setTimeout(() => setShareState(''), 1800);
  };

  const mapLink =
    'https://maps.google.com/maps?q=Koregaon%20Park%20Pune&t=&z=13&ie=UTF8&iwloc=&output=embed';

  const showPreviousMedia = () => {
    setActiveMedia((current) => (current === 0 ? mediaAssets.length - 1 : current - 1));
  };

  const showNextMedia = () => {
    setActiveMedia((current) => (current === mediaAssets.length - 1 ? 0 : current + 1));
  };

  const submitVisitRequest = async () => {
    if (!visitName.trim() || !visitCity.trim() || !visitDate || !visitTime) {
      setVisitMessage('Please complete all schedule visit fields.');
      return;
    }
    if (!visitPhoneVerificationId) {
      setVisitMessage('Verify your phone before scheduling visit.');
      return;
    }

    setIsVisitSubmitting(true);
    setVisitMessage('');
    try {
      const response = await apiRequest<{ referenceId: string }>(
        '/workflow/public/schedule-visit',
        {
          method: 'POST',
          body: JSON.stringify({
            propertyReference: 'ZDT-PR-2031',
            propertyTitle: 'Skyline Meridian Residence',
            requesterName: visitName.trim(),
            phone: visitPhone,
            phoneVerificationId: visitPhoneVerificationId,
            city: visitCity.trim(),
            preferredDate: visitDate,
            preferredTime: visitTime,
            note: 'Schedule visit from property details page.',
          }),
        }
      );
      setVisitMessage(`Visit request submitted. Reference ID: ${response.referenceId}`);
      setVisitFormOpen(false);
      setVisitPhoneVerificationId('');
    } catch (error) {
      setVisitMessage(error instanceof Error ? error.message : 'Unable to schedule visit.');
    } finally {
      setIsVisitSubmitting(false);
    }
  };

  const submitFraudReport = async () => {
    if (!fraudReporterName.trim() || !fraudReason.trim()) {
      setFraudMessage('Please add your name and fraud reason.');
      return;
    }
    if (!fraudPhoneVerificationId) {
      setFraudMessage('Verify your phone before submitting fraud report.');
      return;
    }

    setFraudMessage('');
    try {
      const response = await apiRequest<{ caseId: string; message: string }>(
        '/workflow/public/report-fraud',
        {
          method: 'POST',
          body: JSON.stringify({
            propertyReference: 'ZDT-PR-2031',
            reporterName: fraudReporterName.trim(),
            phone: fraudPhone,
            phoneVerificationId: fraudPhoneVerificationId,
            reason: fraudReason.trim(),
          }),
        }
      );
      setFraudMessage(`${response.message}. Case ID: ${response.caseId}`);
      setFraudFormOpen(false);
      setFraudPhoneVerificationId('');
    } catch (error) {
      setFraudMessage(error instanceof Error ? error.message : 'Unable to submit fraud report.');
    }
  };

  return (
    <main className="relative w-full pb-24 pt-24">
      <div className="page-container zdt-page-stack">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
          <div className="zdt-panel rounded-2xl border border-brand-gray2 bg-white p-4 shadow-card">
            <div className="relative overflow-hidden rounded-xl">
              <img
                src={mediaAssets[activeMedia]?.src}
                alt={mediaAssets[activeMedia]?.label}
                className="h-[420px] w-full object-cover md:h-[520px]"
              />
              <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                  Verified
                </Badge>
                <Badge variant="outline" className="border-white/50 bg-white/90 text-slate-900">
                  Property ID: ZDT-PR-2031
                </Badge>
              </div>
              <div className="absolute right-4 top-4 flex gap-2">
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={showPreviousMedia}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm transition hover:bg-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  onClick={showNextMedia}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm transition hover:bg-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
                <Button className="bg-brand-primary text-white hover:bg-brand-primary-dark">
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Video Tour
                </Button>
                <Button variant="outline" className="bg-white/90 text-slate-900 hover:bg-white">
                  360 View (Future)
                </Button>
              </div>
            </div>

            <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
              {mediaAssets.map((asset, index) => (
                <button
                  key={asset.label}
                  type="button"
                  onClick={() => setActiveMedia(index)}
                  className={`relative min-w-28 overflow-hidden rounded-lg border transition ${
                    activeMedia === index
                      ? 'border-brand-primary ring-2 ring-brand-primary/25'
                      : 'border-brand-gray2'
                  }`}
                >
                  <img src={asset.src} alt={asset.label} className="h-20 w-28 object-cover" />
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setIsSaved((previous) => !previous)}
                className={isSaved ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : ''}
              >
                <Heart className={`mr-2 h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
                {isSaved ? 'Saved' : 'Save'}
              </Button>
              <Button variant="outline" onClick={handleShare}>
                <Share2 className="mr-2 h-4 w-4" />
                {shareState || 'Share'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsCompared((previous) => !previous)}
                className={
                  isCompared
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/15'
                    : ''
                }
              >
                <GitCompareArrows className="mr-2 h-4 w-4" />
                {isCompared ? 'Added to Compare' : 'Compare'}
              </Button>
            </div>
          </div>

          <aside className="zdt-panel rounded-2xl border border-brand-gray2 bg-white p-6 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gray3">
              Price & Quick Info
            </p>
            <div className="mt-4 space-y-3">
              <p className="inline-flex items-center gap-1 text-3xl font-bold text-brand-black md:text-4xl">
                <IndianRupee className="h-8 w-8" />
                2.35 Cr
              </p>
              <p className="text-sm text-brand-gray3">Rs 13,128 / sq.ft</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <QuickInfo label="Negotiable" value="Yes" />
                <QuickInfo label="EMI Estimate" value="Rs 1.92 L / month" />
                <QuickInfo label="Property Type" value="Flat / Apartment" />
                <QuickInfo label="Status" value="Ready to Move" />
                <QuickInfo label="RERA" value="Approved" />
                <QuickInfo label="Updated" value="12 Feb 2026" />
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-brand-gray2 bg-brand-gray1 p-4">
              <p className="text-sm font-semibold text-brand-black">Price Trend</p>
              <div className="mt-3 flex h-20 items-end gap-2">
                {priceTrendBars.map((value, index) => (
                  <div key={`${value}-${index}`} className="flex-1 rounded-t bg-brand-primary/20">
                    <div
                      className="w-full rounded-t bg-brand-primary"
                      style={{ height: `${value}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <LineChart className="h-4 w-4" />
                Investment Score: 8.6 / 10
              </p>
              <p className="mt-2 text-xs text-emerald-700">
                Strong rental demand, premium micro-market, and low unsold inventory.
              </p>
            </div>
          </aside>
        </section>

        <section className="zdt-panel rounded-2xl border border-brand-gray2 bg-white p-6 shadow-card">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-brand-black">Property Specifications</h2>
              <p className="text-sm text-brand-gray3">
                Specifications automatically adapt based on selected property type.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['Flat', 'Villa', 'Plot', 'Commercial'] as PropertyCategory[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActiveSpecType(type)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    activeSpecType === type
                      ? 'bg-brand-primary text-white'
                      : 'bg-brand-gray1 text-brand-gray3 hover:bg-brand-gray2'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {specificationRows.map((item) => (
              <div key={item.label} className="rounded-lg border border-brand-gray2 bg-brand-gray1 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray3">{item.label}</p>
                <p className="mt-1 text-sm font-semibold text-brand-black">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-cyan-50 to-white p-6 shadow-card">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-brand-black">Vastu Analysis</h2>
              <p className="text-sm text-slate-600">Premium placement check for better harmony.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  Vastu Compatibility Score: 82%
                </Badge>
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                  <Star className="mr-1 h-3.5 w-3.5 fill-current" />
                  4.2 / 5 Rating
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Download Vastu Summary
              </Button>
              <Button variant="outline" disabled>
                Consult Vastu Expert (Future)
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <VastuItem title="Main Door Direction" value="East - Excellent" />
            <VastuItem title="Kitchen Placement" value="South-East - Good" />
            <VastuItem title="Master Bedroom" value="South-West - Good" />
            <VastuItem title="Toilet Placement" value="West - Moderate" />
            <VastuItem title="Plot Shape" value="Rectangular - Good" />
            <VastuItem title="Road Facing Direction" value="North-East - Excellent" />
            <VastuItem title="Layout" value="Moderate" />
            <VastuItem title="Overall Verdict" value="Favorable for Family Living" />
          </div>
        </section>

        <section className="zdt-panel rounded-2xl border border-brand-gray2 bg-white p-6 shadow-card">
          <h2 className="text-2xl font-semibold text-brand-black">Amenities</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {amenities.map((amenity) => (
              <div
                key={amenity.label}
                className="rounded-xl border border-brand-gray2 bg-brand-gray1 p-4 text-center"
              >
                <amenity.icon className="mx-auto h-5 w-5 text-brand-primary" />
                <p className="mt-2 text-xs font-semibold text-brand-black">{amenity.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="zdt-panel rounded-2xl border border-brand-gray2 bg-white p-6 shadow-card">
          <h2 className="text-2xl font-semibold text-brand-black">Location & Map</h2>
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-xl border border-brand-gray2">
              <iframe
                src={mapLink}
                title="Property location map"
                loading="lazy"
                className="h-[320px] w-full"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div className="space-y-3">
              <LocationRow icon={School} label="Schools" value="1.3 km | 2.1 km | 2.4 km" />
              <LocationRow icon={Hospital} label="Hospitals" value="1.1 km | 1.8 km" />
              <LocationRow icon={Bus} label="Metro / Bus" value="0.8 km Metro, 300m Bus Stop" />
              <LocationRow icon={Store} label="Grocery" value="Within 500m radius" />
              <LocationRow icon={Landmark} label="Highway Distance" value="7.2 km" />
              <LocationRow icon={Star} label="Locality Rating" value="4.4 / 5" />
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                <p className="font-semibold">Future Development Projects Nearby</p>
                <p className="mt-1">Proposed metro extension and IT park phase-II in 2.5 km radius.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="zdt-panel rounded-2xl border border-brand-gray2 bg-white p-6 shadow-card">
          <h2 className="text-2xl font-semibold text-brand-black">Owner / Agent</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-primary text-2xl font-bold text-white">
              ZD
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-brand-black">ZDT Elite Desk</p>
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  Verified
                </Badge>
              </div>
              <p className="mt-1 text-sm text-brand-gray3">Member Since: April 2021</p>
              <p className="mt-1 text-sm text-brand-gray3">Contact shared after lead confirmation.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  className="bg-brand-primary text-white hover:bg-brand-primary-dark"
                  onClick={() => setVisitMessage('Verify phone and use Schedule Visit to connect with team desk.')}
                >
                  <PhoneCall className="mr-2 h-4 w-4" />
                  Contact
                </Button>
                <Button variant="outline" onClick={() => setVisitFormOpen((previous) => !previous)}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Schedule Visit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onOpenChat?.('ZDT-PR-2031')}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Chat
                </Button>
                <Button variant="outline">WhatsApp</Button>
              </div>
              {visitFormOpen && (
                <div className="mt-4 rounded-xl border border-brand-gray2 bg-brand-gray1 p-3">
                  <p className="text-sm font-semibold text-brand-black">Schedule Site Visit</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input
                      value={visitName}
                      onChange={(event) => setVisitName(event.target.value)}
                      placeholder="Your Name"
                      className="h-10 bg-white"
                    />
                    <LgdLocationInput
                      value={visitCity}
                      onChange={setVisitCity}
                      placeholder="City"
                      className="h-10 bg-white"
                      suggestKind="india"
                      indiaValueField="village"
                    />
                    <Input
                      type="date"
                      value={visitDate}
                      onChange={(event) => setVisitDate(event.target.value)}
                      className="h-10 bg-white"
                    />
                    <Input
                      value={visitTime}
                      onChange={(event) => setVisitTime(event.target.value)}
                      placeholder="Preferred Time (e.g. 5:30 PM)"
                      className="h-10 bg-white"
                    />
                    <div className="sm:col-span-2">
                      <PhoneVerificationField
                        phone={visitPhone}
                        onPhoneChange={setVisitPhone}
                        verifiedToken={visitPhoneVerificationId}
                        onVerifiedTokenChange={setVisitPhoneVerificationId}
                        purpose="schedule_visit"
                        title="Phone verification required"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <LgdLocationAccuracyNote />
                    </div>
                  </div>
                  <Button
                    className="mt-3 bg-brand-primary text-white hover:bg-brand-primary-dark"
                    onClick={submitVisitRequest}
                    disabled={isVisitSubmitting}
                  >
                    {isVisitSubmitting ? 'Submitting...' : 'Submit Visit Request'}
                  </Button>
                </div>
              )}
              {visitMessage && <p className="mt-3 text-sm text-brand-primary">{visitMessage}</p>}
            </div>
          </div>
        </section>

        <section className="zdt-panel rounded-2xl border border-brand-gray2 bg-white p-6 shadow-card">
          <h2 className="text-2xl font-semibold text-brand-black">Similar Properties</h2>
          <p className="mt-1 text-sm text-brand-gray3">
            Same locality, similar budget, and matching category for better comparison.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {similarProperties.map((property) => (
              <div
                key={property.id}
                className="overflow-hidden rounded-xl border border-brand-gray2 bg-brand-gray1"
              >
                <img src={property.image} alt={property.title} className="h-40 w-full object-cover" />
                <div className="space-y-1 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray3">{property.id}</p>
                  <p className="line-clamp-2 text-sm font-semibold text-brand-black">{property.title}</p>
                  <p className="inline-flex items-center gap-1 text-xs text-brand-gray3">
                    <MapPin className="h-3.5 w-3.5" />
                    {property.location}
                  </p>
                  <p className="text-sm font-semibold text-brand-primary">{property.price}</p>
                  <p className="text-xs text-brand-gray3">{property.bhk}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="zdt-panel rounded-2xl border border-brand-gray2 bg-white p-6 shadow-card">
          <h2 className="text-2xl font-semibold text-brand-black">Investment Insights</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard title="Estimated Rental Income" value="Rs 78,000 / month" />
            <MetricCard title="Appreciation Potential" value="11.5% yearly" />
            <MetricCard title="ROI Estimate" value="7.8%" />
            <MetricCard title="Market Demand Score" value="8.9 / 10" />
            <MetricCard title="Occupancy Potential" value="High" />
          </div>
          <div className="mt-5 rounded-xl border border-brand-gray2 bg-brand-gray1 p-4">
            <p className="text-sm font-semibold text-brand-black">6-Month Price Trend</p>
            <div className="mt-3 flex h-24 items-end gap-2">
              {investmentTrendBars.map((value, index) => (
                <div key={`${value}-${index}`} className="flex-1 rounded-t bg-cyan-100">
                  <div
                    className="w-full rounded-t bg-cyan-500"
                    style={{ height: `${value}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="zdt-panel rounded-2xl border border-brand-gray2 bg-white p-6 shadow-card">
          <h2 className="text-2xl font-semibold text-brand-black">Safety & Transparency</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SafetyCard icon={ShieldCheck} title="RERA Number" value="P52100078432" tone="safe" />
            <SafetyCard icon={FileCheck2} title="Legal Status" value="Clear Title" tone="safe" />
            <SafetyCard
              icon={CheckCircle2}
              title="Documents Verified"
              value="Ownership + Tax + Plan"
              tone="safe"
            />
            <SafetyCard
              icon={AlertTriangle}
              title="Fraud Warning"
              value="Avoid direct token transfer before ZDT verification."
              tone="alert"
            />
          </div>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Safety Tip: Always verify site photos, owner identity, and legal papers through platform workflow.
          </div>
          <div className="mt-4">
            <Button
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
              onClick={() => setFraudFormOpen((previous) => !previous)}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Report Fraud
            </Button>
          </div>
          {fraudFormOpen && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-800">Fraud Report Desk</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input
                  value={fraudReporterName}
                  onChange={(event) => setFraudReporterName(event.target.value)}
                  placeholder="Your Name"
                  className="h-10 bg-white"
                />
                <div className="sm:col-span-2">
                  <PhoneVerificationField
                    phone={fraudPhone}
                    onPhoneChange={setFraudPhone}
                    verifiedToken={fraudPhoneVerificationId}
                    onVerifiedTokenChange={setFraudPhoneVerificationId}
                    purpose="fraud_report"
                    title="Phone verification required"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Textarea
                    value={fraudReason}
                    onChange={(event) => setFraudReason(event.target.value)}
                    placeholder="Explain the suspicious listing behavior"
                    className="min-h-24 bg-white"
                  />
                </div>
              </div>
              <Button
                className="mt-3 bg-red-600 text-white hover:bg-red-700"
                onClick={submitFraudReport}
              >
                Submit Fraud Report
              </Button>
            </div>
          )}
          {fraudMessage && <p className="mt-3 text-sm text-red-700">{fraudMessage}</p>}
        </section>

        <section className="zdt-panel rounded-2xl border border-brand-gray2 bg-white p-6 shadow-card">
          <h2 className="text-xl font-semibold text-brand-black">Optional Premium Features</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline">Compare Vastu Score</Button>
            <Button variant="outline">Download Brochure</Button>
            <Button variant="outline" onClick={() => setVisitFormOpen(true)}>Request Site Visit</Button>
            <Button variant="outline">Virtual Tour Booking</Button>
            <Button variant="outline">EMI Calculator</Button>
            <Button variant="outline">Price Drop Alert</Button>
          </div>
        </section>
      </div>
    </main>
  );
}

function QuickInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-brand-gray2 bg-brand-gray1 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-gray3">{label}</p>
      <p className="mt-1 text-sm font-semibold text-brand-black">{value}</p>
    </div>
  );
}

function VastuItem({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-white/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{title}</p>
      <p className="mt-1 text-sm font-semibold text-emerald-900">{value}</p>
    </div>
  );
}

function LocationRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-brand-gray2 bg-brand-gray1 p-3">
      <Icon className="mt-0.5 h-4 w-4 text-brand-primary" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray3">{label}</p>
        <p className="text-sm font-medium text-brand-black">{value}</p>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-brand-gray2 bg-brand-gray1 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray3">{title}</p>
      <p className="mt-1 text-sm font-semibold text-brand-black">{value}</p>
    </div>
  );
}

function SafetyCard({
  icon: Icon,
  title,
  value,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  tone: 'safe' | 'alert';
}) {
  const toneClass =
    tone === 'safe'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <Icon className="h-4 w-4" />
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide">{title}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
