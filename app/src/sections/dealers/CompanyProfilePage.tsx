import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AmenitySelector from '@/components/realty/AmenitySelector';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import {
  createProperty,
  getBuilderMembership,
  getCompany,
  listAmenities,
  listCompanyProjects,
  listCompanyProperties,
  type Amenity,
  type BuilderMembership,
  type Company,
  type PropertyLayoutDetails,
  type PropertyPaymentStatus,
  type Project,
  type PropertyListing,
  type PropertyUnitLayout,
} from '@/lib/realtyApi';
import { uploadImageFile } from '@/lib/mediaUploadApi';
import type { AuthUser } from '@/lib/session';

interface CompanyProfilePageProps {
  companyId: number;
  token: string;
  user: AuthUser | null;
  onBackDirectory: () => void;
  onOpenProject: (projectId: number) => void;
  onOpenMessages: (companyId: number) => void;
  onOpenNewProject: () => void;
}

function formatPrice(value: number | null): string {
  if (!value || value <= 0) return 'On request';
  return `Rs ${Math.round(value).toLocaleString('en-IN')}`;
}

function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return 'Not updated';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not updated';
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeCompanyDisplayName(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\bdevolpers\b/gi, 'Developers')
    .replace(/\bdevlopers\b/gi, 'Developers')
    .replace(/\bdevolper\b/gi, 'Developer')
    .replace(/\bdevloper\b/gi, 'Developer');
}

const COMPANY_NAME_CONNECTORS = new Set(['and', 'of', 'the', '&']);

function formatCompanyDisplayName(value: string): string {
  const normalized = normalizeCompanyDisplayName(value);
  if (!normalized) return '';
  return normalized
    .split(/\s+/)
    .map((token, index) => {
      if (!/[a-z]/i.test(token)) return token;
      if (token === token.toUpperCase() && token.length <= 4) return token;
      const lower = token.toLowerCase();
      if (index > 0 && COMPANY_NAME_CONNECTORS.has(lower)) return lower;
      return `${lower[0].toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
}

const MAX_FLOORS = 80;
const MAX_UNITS_PER_FLOOR = 100;

function parsePositiveInt(value: string, fallback: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(num), 1), max);
}

function parseNullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function paymentStatusClasses(status: PropertyPaymentStatus): string {
  if (status === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'partial') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'overdue') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function buildLayoutDetails(params: {
  floorCount: number;
  unitsPerFloor: number;
  defaultSizeSqft: number | null;
  defaultPrice: number | null;
  unitPrefix: string;
  previous: PropertyLayoutDetails;
}): PropertyLayoutDetails {
  const { floorCount, unitsPerFloor, defaultSizeSqft, defaultPrice, unitPrefix, previous } = params;
  const nextFloors: PropertyLayoutDetails['floors'] = [];

  for (let floorNumber = 1; floorNumber <= floorCount; floorNumber += 1) {
    const prevFloor = previous.floors.find((item) => item.floorNumber === floorNumber);
    const prevUnits = new Map((prevFloor?.units || []).map((unit) => [unit.id, unit]));
    const units: PropertyUnitLayout[] = [];

    for (let index = 0; index < unitsPerFloor; index += 1) {
      const unitId = `F${floorNumber}-U${index + 1}`;
      const previousUnit = prevUnits.get(unitId);
      units.push({
        id: unitId,
        label: previousUnit?.label || `${unitPrefix} ${index + 1}`,
        sizeSqft: previousUnit?.sizeSqft ?? defaultSizeSqft,
        price: previousUnit?.price ?? defaultPrice,
        isOccupied: previousUnit?.isOccupied ?? false,
        occupantName: previousUnit?.occupantName || '',
        payment: {
          monthlyRent: previousUnit?.payment?.monthlyRent ?? null,
          lastPaymentDate: previousUnit?.payment?.lastPaymentDate || '',
          dueAmount: previousUnit?.payment?.dueAmount ?? null,
          status: previousUnit?.payment?.status || 'na',
        },
      });
    }

    nextFloors.push({
      floorNumber,
      units,
    });
  }

  return { floors: nextFloors };
}

export default function CompanyProfilePage({
  companyId,
  token,
  user,
  onBackDirectory,
  onOpenProject,
  onOpenMessages,
  onOpenNewProject,
}: CompanyProfilePageProps) {
  const [company, setCompany] = useState<Company | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [membership, setMembership] = useState<BuilderMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submittingProperty, setSubmittingProperty] = useState(false);

  const [propertyTitle, setPropertyTitle] = useState('');
  const [propertyType, setPropertyType] = useState('Apartment');
  const [listingType, setListingType] = useState<'sale' | 'rent'>('sale');
  const [salePrice, setSalePrice] = useState('');
  const [rentPerMonth, setRentPerMonth] = useState('');
  const [rentDeposit, setRentDeposit] = useState('');
  const [stateName, setStateName] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [areaSqft, setAreaSqft] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [furnishing, setFurnishing] = useState<'furnished' | 'semi_furnished' | 'unfurnished' | 'na'>('na');
  const [availabilityDate, setAvailabilityDate] = useState('');
  const [propertyImageUrls, setPropertyImageUrls] = useState<string[]>([]);
  const [uploadingPropertyImages, setUploadingPropertyImages] = useState(false);
  const [propertyDescription, setPropertyDescription] = useState('');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [floorCount, setFloorCount] = useState('1');
  const [unitsPerFloor, setUnitsPerFloor] = useState('4');
  const [defaultUnitSizeSqft, setDefaultUnitSizeSqft] = useState('');
  const [defaultUnitPrice, setDefaultUnitPrice] = useState('');
  const [layoutDetails, setLayoutDetails] = useState<PropertyLayoutDetails>({ floors: [] });

  const amenityNames = useMemo(() => amenities.map((item) => item.name), [amenities]);
  const supportsFloorBlocks = propertyType === 'Apartment' || propertyType === 'Commercial';

  const canManageCompany = Boolean(
    token &&
      user &&
      membership?.company &&
      membership.company.id === companyId &&
      (membership.company.type === 'builder' || membership.company.type === 'dealer')
  );

  const amenityNameToId = useMemo(() => {
    const map = new Map<string, number>();
    amenities.forEach((amenity) => map.set(amenity.name, amenity.id));
    return map;
  }, [amenities]);

  const websiteUrl = useMemo(() => normalizeWebsite(company?.website || ''), [company?.website]);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [companyData, projectRows, propertyRows, amenityRows] = await Promise.all([
        getCompany(companyId),
        listCompanyProjects(companyId),
        listCompanyProperties(companyId),
        listAmenities(),
      ]);

      setCompany(companyData);
      setProjects(projectRows);
      setProperties(propertyRows);
      setAmenities(amenityRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load company profile');
      setCompany(null);
      setProjects([]);
      setProperties([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    let active = true;
    if (!token) {
      setMembership(null);
      return;
    }

    getBuilderMembership(token)
      .then((value) => {
        if (!active) return;
        setMembership(value);
      })
      .catch(() => {
        if (!active) return;
        setMembership(null);
      });

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!supportsFloorBlocks) {
      setLayoutDetails({ floors: [] });
      return;
    }

    const parsedFloorCount = parsePositiveInt(floorCount, 1, MAX_FLOORS);
    const parsedUnitsPerFloor = parsePositiveInt(unitsPerFloor, 1, MAX_UNITS_PER_FLOOR);
    const defaultSize = parseNullableNumber(defaultUnitSizeSqft);
    const defaultPrice = parseNullableNumber(defaultUnitPrice);
    const unitPrefix = propertyType === 'Commercial' ? 'Shop' : 'Room';

    setLayoutDetails((prev) =>
      buildLayoutDetails({
        floorCount: parsedFloorCount,
        unitsPerFloor: parsedUnitsPerFloor,
        defaultSizeSqft: defaultSize,
        defaultPrice,
        unitPrefix,
        previous: prev,
      })
    );
  }, [supportsFloorBlocks, floorCount, unitsPerFloor, defaultUnitSizeSqft, defaultUnitPrice, propertyType]);

  const resetPropertyForm = () => {
    setPropertyTitle('');
    setPropertyType('Apartment');
    setListingType('sale');
    setSalePrice('');
    setRentPerMonth('');
    setRentDeposit('');
    setStateName('');
    setCity('');
    setArea('');
    setFullAddress('');
    setLandmark('');
    setAreaSqft('');
    setBedrooms('');
    setBathrooms('');
    setFurnishing('na');
    setAvailabilityDate('');
    setPropertyImageUrls([]);
    setPropertyDescription('');
    setSelectedAmenities([]);
    setFloorCount('1');
    setUnitsPerFloor('4');
    setDefaultUnitSizeSqft('');
    setDefaultUnitPrice('');
    setLayoutDetails({ floors: [] });
  };

  const updateLayoutUnit = (
    floorNumber: number,
    unitId: string,
    updater: (current: PropertyUnitLayout) => PropertyUnitLayout
  ) => {
    setLayoutDetails((prev) => ({
      floors: prev.floors.map((floor) =>
        floor.floorNumber !== floorNumber
          ? floor
          : {
              ...floor,
              units: floor.units.map((unit) => (unit.id === unitId ? updater(unit) : unit)),
            }
      ),
    }));
  };

  const handleCreateProperty = async () => {
    if (!token || !company) return;
    setError('');
    setMessage('');

    if (!propertyTitle.trim()) {
      setError('Property title is required.');
      return;
    }
    if (!stateName.trim() || !city.trim() || !area.trim() || !fullAddress.trim()) {
      setError('State, city, area and full address are required.');
      return;
    }
    if (listingType === 'sale' && !salePrice.trim()) {
      setError('Sale price is required for sale listing.');
      return;
    }
    if (listingType === 'rent' && !rentPerMonth.trim()) {
      setError('Rent per month is required for rent listing.');
      return;
    }
    if (selectedAmenities.length === 0) {
      setError('At least one amenity is required.');
      return;
    }
    if (supportsFloorBlocks && layoutDetails.floors.length === 0) {
      setError('Add at least one floor and one room/shop block.');
      return;
    }

    const amenityIds = selectedAmenities
      .map((name) => amenityNameToId.get(name) || 0)
      .filter((id) => id > 0);

    setSubmittingProperty(true);
    try {
      await createProperty(
        {
          companyId: company.id,
          title: propertyTitle.trim(),
          propertyType,
          listingType,
          price: listingType === 'sale' ? Number(salePrice || '0') : null,
          rentPerMonth: listingType === 'rent' ? Number(rentPerMonth || '0') : null,
          rentDeposit: listingType === 'rent' ? Number(rentDeposit || '0') : null,
          state: stateName.trim(),
          city: city.trim(),
          area: area.trim(),
          fullAddress: fullAddress.trim(),
          landmark: landmark.trim(),
          areaSqft: areaSqft ? Number(areaSqft) : null,
          bedrooms: bedrooms ? Number(bedrooms) : null,
          bathrooms: bathrooms ? Number(bathrooms) : null,
          furnishing,
          availabilityDate: availabilityDate || '',
          imageUrls: propertyImageUrls,
          description: propertyDescription.trim(),
          layoutDetails: supportsFloorBlocks ? layoutDetails : { floors: [] },
          amenityIds,
        },
        token
      );

      setMessage('Property listing added successfully.');
      resetPropertyForm();
      const latestProperties = await listCompanyProperties(company.id);
      setProperties(latestProperties);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create property');
    } finally {
      setSubmittingProperty(false);
    }
  };

  const handlePropertyImageUpload = async (files: FileList | null) => {
    if (!token || !files || files.length === 0) return;

    const selected = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (selected.length === 0) {
      setError('Please choose image files only.');
      return;
    }

    setError('');
    setUploadingPropertyImages(true);

    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        const response = await uploadImageFile(token, 'realty_property', file, {
          maxSide: 1800,
          mimeType: 'image/webp',
          quality: 0.9,
        });
        uploaded.push(response.imageUrl);
      }
      setPropertyImageUrls((current) => [...current, ...uploaded].slice(0, 30));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload property images');
    } finally {
      setUploadingPropertyImages(false);
    }
  };

  const removePropertyImage = (index: number) => {
    setPropertyImageUrls((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  if (loading) {
    return (
      <section className="min-h-screen pb-16 pt-36 text-slate-900 lg:pt-40">
        <div className="page-container">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading company profile...</div>
        </div>
      </section>
    );
  }

  if (!company) {
    return (
      <section className="min-h-screen pb-16 pt-36 text-slate-900 lg:pt-40">
        <div className="page-container space-y-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error || 'Company profile not found.'}
          </div>
          <Button variant="outline" onClick={onBackDirectory}>
            Back to Directory
          </Button>
        </div>
      </section>
    );
  }

  const displayCompanyName = formatCompanyDisplayName(company.name);
  const companyTypeLabel = company.companyType === 'builder' ? 'Builder' : 'Dealer';
  const bannerImageUrl = company.coverImage || company.bannerUrl || company.logoUrl || '';
  const profileImageUrl = company.logoUrl || bannerImageUrl;
  const locationParts = [company.city, company.area, company.state].filter(Boolean);
  const locationLabel = locationParts.length > 0 ? locationParts.join(', ') : 'Address shared on request';
  const companyDescription =
    company.description?.trim() ||
    `${displayCompanyName} is available on ZDT Realty. Contact us for latest pricing, availability, and site visits.`;

  return (
    <section className="min-h-screen pb-16 pt-36 text-slate-900 lg:pt-40">
      <div className="page-container space-y-6">
        <button
          type="button"
          onClick={onBackDirectory}
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to Dealers/Builders
        </button>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="relative h-44 w-full overflow-hidden bg-slate-900 sm:h-56 lg:h-64">
            {bannerImageUrl ? (
              <img
                src={bannerImageUrl}
                alt={`${displayCompanyName} cover`}
                className="h-full w-full object-cover object-[center_38%]"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/30 to-transparent" />
            <div className="absolute left-4 top-4 z-20 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white shadow-sm ring-1 ring-slate-200 sm:left-6 sm:top-6 sm:h-24 sm:w-24">
              {profileImageUrl ? (
                <img src={profileImageUrl} alt={`${displayCompanyName} logo`} className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-8 w-8 text-slate-500" />
              )}
            </div>
          </div>

          <div className="p-5 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="break-words text-2xl font-bold leading-tight text-slate-900 sm:text-3xl lg:text-[2.6rem]">
                    {displayCompanyName}
                  </h1>
                  {company.isVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Verified
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-base text-slate-600">{companyTypeLabel}</p>
                <p className="mt-1.5 inline-flex items-center gap-1 text-sm text-slate-500">
                  <MapPin className="h-3.5 w-3.5" />
                  {locationLabel}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Button
                  onClick={() => onOpenMessages(company.id)}
                  variant="outline"
                  className="h-11 shrink-0 rounded-xl"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Message
                </Button>
                {canManageCompany ? (
                  <Button
                    onClick={onOpenNewProject}
                    className="h-11 shrink-0 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add New Project
                  </Button>
                ) : null}
              </div>
            </div>

            <p className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
              {companyDescription}
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Phone</p>
                <p className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-slate-900">
                  <Phone className="h-4 w-4 text-slate-500" />
                  {company.phone ? (
                    <a href={`tel:${company.phone}`} className="hover:text-blue-700 hover:underline">
                      {company.phone}
                    </a>
                  ) : (
                    'Not shared'
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Email</p>
                <p className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-slate-900 break-all">
                  <Mail className="h-4 w-4 text-slate-500" />
                  {company.email ? (
                    <a href={`mailto:${company.email}`} className="hover:text-blue-700 hover:underline">
                      {company.email}
                    </a>
                  ) : (
                    'Not shared'
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Website</p>
                <p className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-slate-900 break-all">
                  <Globe className="h-4 w-4 text-slate-500" />
                  {websiteUrl ? (
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-700 hover:underline"
                    >
                      {company.website}
                    </a>
                  ) : (
                    'Not shared'
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">RERA</p>
                <p className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-slate-500" />
                  {company.reraNumber || 'Not provided'}
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-500">
              Service Areas: {company.serviceAreas.length > 0 ? company.serviceAreas.join(', ') : 'Not set'}
            </p>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {message}
          </div>
        ) : null}

        <Tabs defaultValue="projects" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <TabsList className="mb-4 h-10">
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="properties">Properties</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="documents">Documents/Verification</TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="space-y-4">
            {projects.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No projects added yet.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {projects.map((project) => (
                  <article key={project.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="overflow-hidden rounded-xl bg-slate-200" style={{ aspectRatio: '16 / 9' }}>
                      {project.primaryImage ? (
                        <img src={project.primaryImage} alt={project.projectName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-500">No Image</div>
                      )}
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-900">{project.projectName}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {[project.area, project.city].filter(Boolean).join(', ')}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {formatPrice(project.priceMin)} - {formatPrice(project.priceMax)}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                      {project.construction?.overallStatus || project.status}
                    </p>
                    <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50/60 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-blue-900">
                          {Math.max(
                            0,
                            Math.min(100, Math.round(Number(project.construction?.completionPercent || 0)))
                          )}
                          % Completed
                        </p>
                        <p className="text-[11px] text-blue-900/80">
                          Last updated: {formatDisplayDate(project.construction?.lastUpdatedAt)}
                        </p>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-blue-100">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, Math.round(Number(project.construction?.completionPercent || 0)))
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                    <Button
                      className="mt-4 h-10 rounded-xl bg-blue-700 text-white hover:bg-blue-800"
                      onClick={() => onOpenProject(project.id)}
                    >
                      View Project
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="properties" className="space-y-4">
            {canManageCompany ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-base font-semibold text-slate-900">Add Property Listing</p>
                <p className="mt-1 text-sm text-slate-600">
                  Post sale/rent listings under this company profile.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Input
                    value={propertyTitle}
                    onChange={(event) => setPropertyTitle(event.target.value)}
                    placeholder="Title"
                    className="h-11 bg-white"
                  />
                  <select
                    value={propertyType}
                    onChange={(event) => setPropertyType(event.target.value)}
                    className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700"
                  >
                    <option value="Apartment">Apartment</option>
                    <option value="Villa">Villa</option>
                    <option value="Plotted">Plotted</option>
                    <option value="Commercial">Complex / Commercial</option>
                    <option value="Independent House">Independent House</option>
                    <option value="Shop">Shop</option>
                    <option value="Office">Office</option>
                    <option value="Warehouse">Warehouse</option>
                  </select>
                  <select
                    value={listingType}
                    onChange={(event) => setListingType(event.target.value as 'sale' | 'rent')}
                    className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700"
                  >
                    <option value="sale">Sale Listing</option>
                    <option value="rent">Rent Listing</option>
                  </select>
                  {listingType === 'sale' ? (
                    <Input
                      value={salePrice}
                      onChange={(event) => setSalePrice(event.target.value.replace(/\D/g, ''))}
                      placeholder="Sale Price"
                      className="h-11 bg-white"
                    />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        value={rentPerMonth}
                        onChange={(event) => setRentPerMonth(event.target.value.replace(/\D/g, ''))}
                        placeholder="Rent per month"
                        className="h-11 bg-white"
                      />
                      <Input
                        value={rentDeposit}
                        onChange={(event) => setRentDeposit(event.target.value.replace(/\D/g, ''))}
                        placeholder="Deposit"
                        className="h-11 bg-white"
                      />
                    </div>
                  )}
                  <LgdLocationInput
                    value={stateName}
                    onChange={setStateName}
                    placeholder="State"
                    className="h-11 bg-white"
                    suggestKind="state"
                    indiaValueField="state"
                  />
                  <LgdLocationInput
                    value={city}
                    onChange={setCity}
                    placeholder="City"
                    className="h-11 bg-white"
                    suggestKind="india"
                    indiaValueField="village"
                  />
                  <LgdLocationInput
                    value={area}
                    onChange={setArea}
                    placeholder="Area"
                    className="h-11 bg-white"
                    suggestKind="india"
                    indiaValueField="subdistrict"
                  />
                  <div className="sm:col-span-2">
                    <LgdLocationAccuracyNote />
                  </div>
                  <Input
                    value={fullAddress}
                    onChange={(event) => setFullAddress(event.target.value)}
                    placeholder="Full Address"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={landmark}
                    onChange={(event) => setLandmark(event.target.value)}
                    placeholder="Landmark"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={areaSqft}
                    onChange={(event) => setAreaSqft(event.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="Area sqft"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={bedrooms}
                    onChange={(event) => setBedrooms(event.target.value.replace(/\D/g, ''))}
                    placeholder="Bedrooms"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={bathrooms}
                    onChange={(event) => setBathrooms(event.target.value.replace(/\D/g, ''))}
                    placeholder="Bathrooms"
                    className="h-11 bg-white"
                  />
                  {supportsFloorBlocks ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {propertyType === 'Commercial' ? 'Complex Blocks' : 'Apartment Blocks'}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Add floor count and rooms/shops per floor. Empty blocks stay red (Available), occupied blocks become green.
                      </p>

                      <div className="mt-3 grid gap-3 md:grid-cols-4">
                        <Input
                          value={floorCount}
                          onChange={(event) => setFloorCount(event.target.value.replace(/\D/g, ''))}
                          placeholder="No. of floors"
                          className="h-10 bg-white"
                        />
                        <Input
                          value={unitsPerFloor}
                          onChange={(event) => setUnitsPerFloor(event.target.value.replace(/\D/g, ''))}
                          placeholder={propertyType === 'Commercial' ? 'Shops per floor' : 'Rooms per floor'}
                          className="h-10 bg-white"
                        />
                        <Input
                          value={defaultUnitSizeSqft}
                          onChange={(event) => setDefaultUnitSizeSqft(event.target.value.replace(/[^0-9.]/g, ''))}
                          placeholder="Size per unit (sqft)"
                          className="h-10 bg-white"
                        />
                        <Input
                          value={defaultUnitPrice}
                          onChange={(event) => setDefaultUnitPrice(event.target.value.replace(/[^0-9.]/g, ''))}
                          placeholder="Price per unit"
                          className="h-10 bg-white"
                        />
                      </div>

                      <div className="mt-4 space-y-4">
                        {layoutDetails.floors.map((floor) => {
                          const occupiedCount = floor.units.filter((unit) => unit.isOccupied).length;
                          return (
                            <div key={floor.floorNumber} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-900">Floor {floor.floorNumber}</p>
                                <p className="text-xs text-slate-600">
                                  {occupiedCount}/{floor.units.length} occupied
                                </p>
                              </div>

                              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {floor.units.map((unit) => (
                                  <div
                                    key={unit.id}
                                    className={`rounded-lg border p-3 ${
                                      unit.isOccupied
                                        ? 'border-emerald-200 bg-emerald-50'
                                        : 'border-red-200 bg-red-50'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm font-semibold text-slate-900">{unit.label}</p>
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                          unit.isOccupied ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                        }`}
                                      >
                                        {unit.isOccupied ? 'Taken' : 'Available'}
                                      </span>
                                    </div>

                                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                      <Input
                                        value={unit.sizeSqft ?? ''}
                                        onChange={(event) =>
                                          updateLayoutUnit(floor.floorNumber, unit.id, (current) => ({
                                            ...current,
                                            sizeSqft: parseNullableNumber(event.target.value),
                                          }))
                                        }
                                        placeholder="Size sqft"
                                        className="h-9 bg-white text-xs"
                                      />
                                      <Input
                                        value={unit.price ?? ''}
                                        onChange={(event) =>
                                          updateLayoutUnit(floor.floorNumber, unit.id, (current) => ({
                                            ...current,
                                            price: parseNullableNumber(event.target.value),
                                          }))
                                        }
                                        placeholder="Price"
                                        className="h-9 bg-white text-xs"
                                      />
                                    </div>

                                    <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
                                      <input
                                        type="checkbox"
                                        checked={unit.isOccupied}
                                        onChange={(event) =>
                                          updateLayoutUnit(floor.floorNumber, unit.id, (current) => ({
                                            ...current,
                                            isOccupied: event.target.checked,
                                            occupantName: event.target.checked ? current.occupantName : '',
                                            payment: event.target.checked
                                              ? current.payment
                                              : { monthlyRent: null, dueAmount: null, lastPaymentDate: '', status: 'na' },
                                          }))
                                        }
                                      />
                                      Occupied by shopkeeper/tenant
                                    </label>

                                    <Input
                                      value={unit.occupantName}
                                      onChange={(event) =>
                                        updateLayoutUnit(floor.floorNumber, unit.id, (current) => ({
                                          ...current,
                                          occupantName: event.target.value,
                                        }))
                                      }
                                      placeholder="Shopkeeper / tenant name"
                                      className="mt-2 h-9 bg-white text-xs"
                                      disabled={!unit.isOccupied}
                                    />

                                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                      <Input
                                        value={unit.payment.monthlyRent ?? ''}
                                        onChange={(event) =>
                                          updateLayoutUnit(floor.floorNumber, unit.id, (current) => ({
                                            ...current,
                                            payment: {
                                              ...current.payment,
                                              monthlyRent: parseNullableNumber(event.target.value),
                                            },
                                          }))
                                        }
                                        placeholder="Monthly payment"
                                        className="h-9 bg-white text-xs"
                                        disabled={!unit.isOccupied}
                                      />
                                      <Input
                                        value={unit.payment.dueAmount ?? ''}
                                        onChange={(event) =>
                                          updateLayoutUnit(floor.floorNumber, unit.id, (current) => ({
                                            ...current,
                                            payment: {
                                              ...current.payment,
                                              dueAmount: parseNullableNumber(event.target.value),
                                            },
                                          }))
                                        }
                                        placeholder="Pending due"
                                        className="h-9 bg-white text-xs"
                                        disabled={!unit.isOccupied}
                                      />
                                      <Input
                                        type="date"
                                        value={unit.payment.lastPaymentDate || ''}
                                        onChange={(event) =>
                                          updateLayoutUnit(floor.floorNumber, unit.id, (current) => ({
                                            ...current,
                                            payment: {
                                              ...current.payment,
                                              lastPaymentDate: event.target.value,
                                            },
                                          }))
                                        }
                                        className="h-9 bg-white text-xs"
                                        disabled={!unit.isOccupied}
                                      />
                                      <select
                                        value={unit.payment.status}
                                        onChange={(event) =>
                                          updateLayoutUnit(floor.floorNumber, unit.id, (current) => ({
                                            ...current,
                                            payment: {
                                              ...current.payment,
                                              status: event.target.value as PropertyPaymentStatus,
                                            },
                                          }))
                                        }
                                        className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
                                        disabled={!unit.isOccupied}
                                      >
                                        <option value="na">No status</option>
                                        <option value="paid">Paid</option>
                                        <option value="partial">Partially Paid</option>
                                        <option value="overdue">Overdue</option>
                                      </select>
                                    </div>

                                    <p
                                      className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${paymentStatusClasses(unit.payment.status)}`}
                                    >
                                      Payment: {unit.payment.status}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <select
                    value={furnishing}
                    onChange={(event) =>
                      setFurnishing(event.target.value as 'furnished' | 'semi_furnished' | 'unfurnished' | 'na')
                    }
                    className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700"
                  >
                    <option value="na">Not specified</option>
                    <option value="furnished">Furnished</option>
                    <option value="semi_furnished">Semi Furnished</option>
                    <option value="unfurnished">Unfurnished</option>
                  </select>
                  <Input
                    type="date"
                    value={availabilityDate}
                    onChange={(event) => setAvailabilityDate(event.target.value)}
                    className="h-11 bg-white"
                  />
                </div>

                <div className="mt-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <Input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        const files = event.target.files;
                        event.target.value = '';
                        void handlePropertyImageUpload(files);
                      }}
                      className="h-11 bg-white"
                    />
                    {propertyImageUrls.length > 0 ? (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {propertyImageUrls.map((url, index) => (
                          <div key={`${url}-${index}`} className="rounded-md border border-slate-200 bg-white p-1">
                            <div className="relative overflow-hidden rounded" style={{ aspectRatio: '4 / 3' }}>
                              <img src={url} alt={`Property upload ${index + 1}`} className="h-full w-full object-cover" />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-1 h-7 w-full text-xs"
                              onClick={() => removePropertyImage(index)}
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3">
                  <Textarea
                    value={propertyDescription}
                    onChange={(event) => setPropertyDescription(event.target.value)}
                    placeholder="Description"
                    className="min-h-20 bg-white"
                  />
                </div>
                <div className="mt-3">
                  <AmenitySelector
                    title="Amenities"
                    options={amenityNames}
                    selected={selectedAmenities}
                    onChange={setSelectedAmenities}
                    required
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <Button
                    onClick={handleCreateProperty}
                    disabled={submittingProperty || uploadingPropertyImages}
                    className="h-11 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
                  >
                    {uploadingPropertyImages
                      ? 'Uploading images...'
                      : submittingProperty
                        ? 'Saving...'
                        : 'Add Property Listing'}
                  </Button>
                </div>
              </div>
            ) : null}

            {properties.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No property listings available.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {properties.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="overflow-hidden rounded-xl bg-slate-200" style={{ aspectRatio: '16 / 9' }}>
                      {item.primaryImage ? (
                        <img src={item.primaryImage} alt={item.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-500">No Image</div>
                      )}
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {[item.area, item.city].filter(Boolean).join(', ')}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {item.listingType === 'sale'
                        ? formatPrice(item.price)
                        : `${formatPrice(item.rentPerMonth)} / month`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.amenities.slice(0, 6).map((amenity) => (
                        <span
                          key={`${item.id}-${amenity}`}
                          className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600"
                        >
                          {amenity}
                        </span>
                      ))}
                    </div>
                    {item.layoutDetails?.floors?.length > 0 ? (
                      <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                          Floor Blocks & Payment Tracker
                        </p>
                        {item.layoutDetails.floors.map((floor) => (
                          <div key={`${item.id}-floor-${floor.floorNumber}`} className="rounded-lg border border-slate-200 p-2">
                            <p className="text-xs font-semibold text-slate-700">Floor {floor.floorNumber}</p>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              {floor.units.map((unit) => (
                                <div
                                  key={unit.id}
                                  className={`rounded-md border px-2 py-1 text-xs ${
                                    unit.isOccupied ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
                                  }`}
                                >
                                  <p className="font-semibold text-slate-900">{unit.label}</p>
                                  <p className="text-slate-700">{unit.isOccupied ? unit.occupantName || 'Taken' : 'Available'}</p>
                                  {unit.isOccupied ? (
                                    <p className="text-slate-600">
                                      Due:{' '}
                                      {unit.payment.dueAmount == null
                                        ? 'Rs 0'
                                        : `Rs ${Math.round(unit.payment.dueAmount).toLocaleString('en-IN')}`}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="reviews">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Reviews module is reserved as a future release placeholder.
            </div>
          </TabsContent>

          <TabsContent value="documents">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Verification documents section is prepared as an optional placeholder for the next phase.
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
