import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/http';
import OwnerPropertyForm, { type OwnerPropertyFormState } from './OwnerPropertyForm';

function toOptionalNumber(value: string) {
  if (!value) return undefined;
  const normalized = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(normalized) ? normalized : undefined;
}

interface OwnerEditPropertyPageProps {
  propertyId: string;
  onBack: () => void;
}

interface OwnerPropertyResponse {
  property: {
    id: number;
    title: string;
    description: string;
    propertyType: string;
    price: number | null;
    pricePerSqft: number | null;
    state: string;
    city: string;
    locality: string;
    address: string;
    areaSqft: number | null;
    carpetArea: number | null;
    bedrooms: number | null;
    floorNumber: number | null;
    totalFloors: number | null;
    facing: string;
    isNegotiable: boolean;
    reraNumber: string;
    possessionStatus: string;
    imageUrls: string[];
    layoutDetails?: { amenities?: string[]; media?: { videoUrl?: string; tourUrl?: string } };
    groupDeal?: {
      groupInventoryCount?: number;
      groupDealMinBuyers?: number;
      groupDealMaxBuyers?: number | null;
      groupDiscountType?: 'NONE' | 'FLAT_DISCOUNT' | 'PERCENT_DISCOUNT' | 'CONFIRM_LATER';
      groupDiscountValue?: number | null;
      groupDealNote?: string;
    };
  };
}

export default function OwnerEditPropertyPage({ propertyId, onBack }: OwnerEditPropertyPageProps) {
  const [initialState, setInitialState] = useState<OwnerPropertyFormState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest<OwnerPropertyResponse>(`/api/owner/properties/${propertyId}`)
      .then((response) => {
        if (!active) return;
        const property = response.property;
        setInitialState({
          listingMode: 'sale',
          propertyType: property.propertyType || 'Apartment',
          title: property.title || '',
          description: property.description || '',
          bhk: property.bedrooms ? String(property.bedrooms) : '',
          areaSqft: property.areaSqft ? String(property.areaSqft) : '',
          carpetArea: property.carpetArea ? String(property.carpetArea) : '',
          facing: property.facing || 'NA',
          floorNumber: property.floorNumber ? String(property.floorNumber) : '',
          totalFloors: property.totalFloors ? String(property.totalFloors) : '',
          state: property.state || '',
          city: property.city || '',
          locality: property.locality || '',
          address: property.address || '',
          pincode: '',
          latitude: '',
          longitude: '',
          price: property.price ? String(property.price) : '',
          pricePerSqft: property.pricePerSqft ? String(property.pricePerSqft) : '',
          isNegotiable: property.isNegotiable,
          reraNumber: property.reraNumber || '',
          possessionStatus: property.possessionStatus || 'ready',
          groupInventoryCount: property.groupDeal?.groupInventoryCount
            ? String(property.groupDeal.groupInventoryCount)
            : '1',
          groupDealMinBuyers: property.groupDeal?.groupDealMinBuyers
            ? String(property.groupDeal.groupDealMinBuyers)
            : '2',
          groupDealMaxBuyers:
            property.groupDeal?.groupDealMaxBuyers === null || property.groupDeal?.groupDealMaxBuyers === undefined
              ? ''
              : String(property.groupDeal.groupDealMaxBuyers),
          groupDiscountType: property.groupDeal?.groupDiscountType || 'NONE',
          groupDiscountValue:
            property.groupDeal?.groupDiscountValue === null || property.groupDeal?.groupDiscountValue === undefined
              ? ''
              : String(property.groupDeal.groupDiscountValue),
          groupDealNote: property.groupDeal?.groupDealNote || '',
          amenities: property.layoutDetails?.amenities || [],
          imageUrls: property.imageUrls?.join(', ') || '',
          videoUrl: property.layoutDetails?.media?.videoUrl || '',
          tourUrl: property.layoutDetails?.media?.tourUrl || '',
          monthlyRent: '',
          securityDeposit: '',
          maintenanceCharges: '',
          furnishedStatus: 'unfurnished',
          tenantPreference: 'family',
          leaseDuration: '11 months',
          availableFrom: '',
          noticePeriod: '',
          houseRules: '',
          petsAllowed: false,
          smokingAllowed: false,
        });
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [propertyId]);

  const handleSubmit = async (payload: OwnerPropertyFormState) => {
    await apiRequest(`/api/owner/properties/${propertyId}`, {
      method: 'PUT',
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
        latitude: payload.latitude ? Number(payload.latitude) : undefined,
        longitude: payload.longitude ? Number(payload.longitude) : undefined,
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
    onBack();
  };

  if (loading || !initialState) {
    return (
      <section className="min-h-screen pb-16 pt-28">
        <div className="page-container">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            Loading property details...
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Owner Listing Studio</p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">Edit listing #{propertyId}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Update media, pricing, and availability in real time.
          </p>
        </div>
        <OwnerPropertyForm mode="edit" initialState={initialState} onSubmit={handleSubmit} onCancel={onBack} />
      </div>
    </section>
  );
}
