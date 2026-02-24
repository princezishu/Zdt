import { apiRequest } from '@/lib/http';
import { Button } from '@/components/ui/button';
import OwnerPropertyForm, { type OwnerPropertyFormState } from './OwnerPropertyForm';

function toOptionalNumber(value: string) {
  if (!value) return undefined;
  const normalized = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(normalized) ? normalized : undefined;
}

function toOptionalCoordinate(value: string, min: number, max: number): number | undefined {
  const normalized = Number(String(value || '').trim());
  if (!Number.isFinite(normalized)) return undefined;
  if (normalized < min || normalized > max) return undefined;
  return Number(normalized.toFixed(7));
}

interface OwnerAddPropertyPageProps {
  onBack: () => void;
  onOpenListings: () => void;
  onOpenRentals: () => void;
}

export default function OwnerAddPropertyPage({
  onBack,
  onOpenListings,
  onOpenRentals,
}: OwnerAddPropertyPageProps) {
  const handleSubmit = async (payload: OwnerPropertyFormState) => {
    if (payload.listingMode === 'sale') {
      await apiRequest('/api/owner/properties', {
        method: 'POST',
        body: JSON.stringify({
          title: payload.title,
          description: payload.description,
          propertyType: payload.propertyType,
          bhk: payload.bhk ? Number(payload.bhk) : undefined,
          areaSqft: payload.areaSqft ? Number(payload.areaSqft) : undefined,
          carpetArea: payload.carpetArea ? Number(payload.carpetArea) : undefined,
          facing: payload.facing,
          floorNumber: payload.floorNumber ? Number(payload.floorNumber) : undefined,
          totalFloors: payload.totalFloors ? Number(payload.totalFloors) : undefined,
          state: payload.state,
          city: payload.city,
          locality: payload.locality,
          address: payload.address,
          latitude: toOptionalCoordinate(payload.latitude, -90, 90),
          longitude: toOptionalCoordinate(payload.longitude, -180, 180),
          price: payload.price ? Number(payload.price.replace(/,/g, '')) : undefined,
          pricePerSqft: payload.pricePerSqft ? Number(payload.pricePerSqft) : undefined,
          groupInventoryCount: toOptionalNumber(payload.groupInventoryCount),
          groupDealMinBuyers: toOptionalNumber(payload.groupDealMinBuyers),
          groupDealMaxBuyers: payload.groupDealMaxBuyers ? toOptionalNumber(payload.groupDealMaxBuyers) : null,
          groupDiscountType: payload.groupDiscountType,
          groupDiscountValue:
            payload.groupDiscountType === 'NONE' || payload.groupDiscountType === 'CONFIRM_LATER'
              ? null
              : payload.groupDiscountValue
                ? toOptionalNumber(payload.groupDiscountValue) ?? null
                : null,
          groupDealNote: payload.groupDealNote,
          isNegotiable: payload.isNegotiable,
          reraNumber: payload.reraNumber,
          possessionStatus: payload.possessionStatus,
          amenities: payload.amenities,
          imageUrls: payload.imageUrls
            .split(',')
            .map((url) => url.trim())
            .filter(Boolean),
          videoUrl: payload.videoUrl,
          tourUrl: payload.tourUrl,
        }),
      });
      onOpenListings();
      return;
    }

    await apiRequest('/api/rentals', {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        description: payload.description,
        monthlyRent: payload.monthlyRent ? Number(payload.monthlyRent.replace(/,/g, '')) : null,
        securityDeposit: payload.securityDeposit ? Number(payload.securityDeposit.replace(/,/g, '')) : null,
        maintenanceCharges: payload.maintenanceCharges
          ? Number(payload.maintenanceCharges.replace(/,/g, ''))
          : null,
        maintenanceIncluded: false,
        city: payload.city,
        locality: payload.locality,
        address: payload.address,
        latitude: toOptionalCoordinate(payload.latitude, -90, 90) ?? null,
        longitude: toOptionalCoordinate(payload.longitude, -180, 180) ?? null,
        propertyType: payload.propertyType,
        bhk: payload.bhk ? Number(payload.bhk) : null,
        carpetArea: payload.carpetArea ? Number(payload.carpetArea) : null,
        furnishedStatus: payload.furnishedStatus,
        tenantPreference: payload.tenantPreference,
        availableFrom: payload.availableFrom || null,
        leaseDuration: payload.leaseDuration,
        noticePeriod: payload.noticePeriod,
        parking: 'NA',
        petsAllowed: payload.petsAllowed,
        smokingAllowed: payload.smokingAllowed,
        rentalModel: 'long_term',
        imageUrls: payload.imageUrls
          .split(',')
          .map((url) => url.trim())
          .filter(Boolean),
        virtualTourUrl: payload.tourUrl,
        amenityIds: [],
      }),
    });
    onOpenRentals();
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Owner Listing Studio</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">Add a new listing</h1>
            <p className="mt-2 text-sm text-slate-600">
              Publish premium sale or rental inventory with full media and compliance details.
            </p>
          </div>
          <Button variant="outline" onClick={onBack}>
            Back to Dashboard
          </Button>
        </div>

        <OwnerPropertyForm mode="create" onSubmit={handleSubmit} onCancel={onBack} />
      </div>
    </section>
  );
}
