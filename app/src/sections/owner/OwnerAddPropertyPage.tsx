import { apiRequest } from '@/lib/http';
import { Button } from '@/components/ui/button';
import OwnerPropertyForm, { type OwnerPropertyFormState } from './OwnerPropertyForm';
import {
  isOwnerSubscriptionAccessError,
  useOwnerSubscriptionAccess,
} from './OwnerSubscriptionAccess';
import { OwnerLockedPageState } from './OwnerAccessStates';

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
  onOpenSubscription: () => void;
}

export default function OwnerAddPropertyPage({
  onBack,
  onOpenListings,
  onOpenRentals,
  onOpenSubscription,
}: OwnerAddPropertyPageProps) {
  const { access, currentSubscription, usage, loading, refreshAccess } = useOwnerSubscriptionAccess();

  const handleSubmit = async (payload: OwnerPropertyFormState) => {
    try {
      if (payload.listingMode === 'sale') {
        const formData = new FormData();
        const appendValue = (key: string, value: string | number | boolean | null | undefined) => {
          if (value === undefined || value === null || value === '') {
            return;
          }
          formData.append(key, String(value));
        };

        appendValue('title', payload.title);
        appendValue('description', payload.description);
        appendValue('propertyType', payload.propertyType);
        appendValue('bhk', payload.bhk ? Number(payload.bhk) : undefined);
        appendValue('areaSqft', payload.areaSqft ? Number(payload.areaSqft) : undefined);
        appendValue('carpetArea', payload.carpetArea ? Number(payload.carpetArea) : undefined);
        appendValue('facing', payload.facing);
        appendValue('floorNumber', payload.floorNumber ? Number(payload.floorNumber) : undefined);
        appendValue('totalFloors', payload.totalFloors ? Number(payload.totalFloors) : undefined);
        appendValue('state', payload.state);
        appendValue('city', payload.city);
        appendValue('locality', payload.locality);
        appendValue('address', payload.address);
        appendValue('latitude', toOptionalCoordinate(payload.latitude, -90, 90));
        appendValue('longitude', toOptionalCoordinate(payload.longitude, -180, 180));
        appendValue('price', payload.price ? Number(payload.price.replace(/,/g, '')) : undefined);
        appendValue('pricePerSqft', payload.pricePerSqft ? Number(payload.pricePerSqft) : undefined);
        appendValue('groupInventoryCount', toOptionalNumber(payload.groupInventoryCount));
        appendValue('groupDealMinBuyers', toOptionalNumber(payload.groupDealMinBuyers));
        appendValue(
          'groupDealMaxBuyers',
          payload.groupDealMaxBuyers ? toOptionalNumber(payload.groupDealMaxBuyers) : null
        );
        appendValue('groupDiscountType', payload.groupDiscountType);
        appendValue(
          'groupDiscountValue',
          payload.groupDiscountType === 'NONE' || payload.groupDiscountType === 'CONFIRM_LATER'
            ? null
            : payload.groupDiscountValue
              ? toOptionalNumber(payload.groupDiscountValue) ?? null
              : null
        );
        appendValue('groupDealNote', payload.groupDealNote);
        appendValue('isNegotiable', payload.isNegotiable);
        appendValue('reraNumber', payload.reraNumber);
        appendValue('possessionStatus', payload.possessionStatus);
        formData.append('amenities', JSON.stringify(payload.amenities));
        formData.append(
          'imageUrls',
          JSON.stringify(
            payload.imageUrls
              .split(',')
              .map((url) => url.trim())
              .filter(Boolean)
          )
        );
        appendValue('videoUrl', payload.videoUrl);
        appendValue('tourUrl', payload.tourUrl);
        if (payload.imageFile) {
          formData.append('image', payload.imageFile);
        }

        await apiRequest('/api/owner/properties', {
          method: 'POST',
          body: formData,
        });
        await refreshAccess();
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
      await refreshAccess();
      onOpenRentals();
    } catch (error) {
      if (isOwnerSubscriptionAccessError(error)) {
        await refreshAccess();
      }
      throw error;
    }
  };

  if (loading || !access || !usage) {
    return (
      <section className="min-h-screen pb-16 pt-28">
        <div className="page-container">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            Loading owner subscription access...
          </div>
        </div>
      </section>
    );
  }

  if (!access.listingQuota.canCreate) {
    return (
      <section className="min-h-screen pb-16 pt-28 text-slate-900">
        <div className="page-container space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Owner Listing Studio</p>
              <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">Add a new listing</h1>
              <p className="mt-2 text-sm text-slate-600">
                Publishing is blocked until this subscription has more active listing capacity.
              </p>
            </div>
            <Button variant="outline" onClick={onBack}>
              Back to Dashboard
            </Button>
          </div>

          <OwnerLockedPageState
            eyebrow="Listing Quota"
            title="Publishing is paused for this plan"
            description="Existing listings stay editable, but new sale and rental entries need available quota."
            message={access.listingQuota.message}
            meta={[
              `Current plan: ${currentSubscription?.planName || 'Free'}`,
              `Used: ${access.listingQuota.used}/${access.listingQuota.limit}`,
              `Remaining: ${access.listingQuota.remaining}`,
            ]}
            onOpenSubscription={onOpenSubscription}
            actionLabel="Upgrade Plan"
          />
        </div>
      </section>
    );
  }

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
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
              Remaining listing slots: <span className="font-semibold">{access.listingQuota.remaining}</span>
            </div>
            <Button variant="outline" onClick={onBack}>
              Back to Dashboard
            </Button>
          </div>
        </div>

        <OwnerPropertyForm mode="create" onSubmit={handleSubmit} onCancel={onBack} />
      </div>
    </section>
  );
}
