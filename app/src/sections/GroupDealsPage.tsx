import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, MapPin, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getGeoStates, type GeoStateItem } from '@/lib/geoApi';
import {
  getGroupDeals,
  type GroupDealItem,
  type GroupDealSortKey,
  type GroupDealUnitType,
} from '@/lib/groupDealsApi';

type LocationScope = 'all' | 'state';
type UnitFilter = GroupDealUnitType | 'ALL';

interface GroupDealsPageProps {
  onOpenDeal: (dealCode: string) => void;
}

const SORT_OPTIONS: Array<{ key: GroupDealSortKey; label: string }> = [
  { key: 'most_active', label: 'Most active' },
  { key: 'ending_soon', label: 'Ending soon' },
  { key: 'newest', label: 'Newest' },
];

function formatPrice(value: number | null): string {
  if (!value || value <= 0) return 'Price on request';
  if (value >= 10000000) return `INR ${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `INR ${(value / 100000).toFixed(1)} L`;
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

function estimatedGroupPrice(item: GroupDealItem): number | null {
  if (item.finalGroupPrice && item.finalGroupPrice > 0) return item.finalGroupPrice;
  if (!item.basePrice || item.basePrice <= 0) return null;
  if (!item.discountValue || item.discountValue <= 0) return null;
  if (item.dealType === 'FLAT_DISCOUNT') {
    return Math.max(0, item.basePrice - item.discountValue);
  }
  if (item.dealType === 'PERCENT_DISCOUNT') {
    return Math.max(0, item.basePrice * (1 - item.discountValue / 100));
  }
  return null;
}

function dealBenefitLabel(item: GroupDealItem): string {
  if (item.dealType === 'FLAT_DISCOUNT' && item.discountValue) {
    return `${formatPrice(item.discountValue)} off per unit`;
  }
  if (item.dealType === 'PERCENT_DISCOUNT' && item.discountValue) {
    return `${item.discountValue}% off per unit`;
  }
  return 'Group discount available. Final price confirmed by builder on minimum completion.';
}

function statusClass(status: GroupDealItem['status']) {
  if (status === 'ACTIVE') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (status === 'MIN_REACHED') return 'bg-blue-100 text-blue-800 border-blue-300';
  if (status === 'CONFIRMED') return 'bg-indigo-100 text-indigo-800 border-indigo-300';
  if (status === 'FULL') return 'bg-amber-100 text-amber-800 border-amber-300';
  if (status === 'EXPIRED') return 'bg-slate-200 text-slate-700 border-slate-300';
  if (status === 'CANCELLED') return 'bg-red-100 text-red-800 border-red-300';
  return 'bg-slate-200 text-slate-700 border-slate-300';
}

export default function GroupDealsPage({ onOpenDeal }: GroupDealsPageProps) {
  const [locationScope, setLocationScope] = useState<LocationScope>('all');
  const [stateCode, setStateCode] = useState('');
  const [unitType, setUnitType] = useState<UnitFilter>('ALL');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<GroupDealSortKey>('most_active');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [states, setStates] = useState<GeoStateItem[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);

  const [items, setItems] = useState<GroupDealItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const selectedState = useMemo(
    () => states.find((entry) => entry.code === stateCode) || null,
    [stateCode, states]
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoadingStates(true);
        const response = await getGeoStates({ limit: 200, offset: 0 });
        if (!active) return;
        setStates(Array.isArray(response.items) ? response.items : []);
      } catch {
        if (!active) return;
        setStates([]);
      } finally {
        if (active) setLoadingStates(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getGroupDeals({
      scope: locationScope,
      stateCode: locationScope === 'state' ? stateCode || undefined : undefined,
      unitType: unitType === 'ALL' ? undefined : unitType,
      verifiedOnly,
      minPrice: minPrice.trim() ? Number(minPrice) : undefined,
      maxPrice: maxPrice.trim() ? Number(maxPrice) : undefined,
      sort: sortKey,
      page,
      pageSize,
    })
      .then((response) => {
        if (!active) return;
        setItems(Array.isArray(response.items) ? response.items : []);
        setTotal(Number(response.total || 0));
      })
      .catch((requestError) => {
        if (!active) return;
        setItems([]);
        setTotal(0);
        setError(requestError instanceof Error ? requestError.message : 'Could not load group deals.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [locationScope, maxPrice, minPrice, page, pageSize, sortKey, stateCode, unitType, verifiedOnly]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold sm:text-3xl">Group Purchase Deals</h1>
          <p className="mt-2 text-sm text-slate-600">
            Buy together, save more. ZDT forms buyer groups and connects with builders. ZDT does not collect booking money.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Location</p>
              <select
                value={locationScope}
                onChange={(event) => {
                  const nextScope = event.target.value as LocationScope;
                  setLocationScope(nextScope);
                  if (nextScope === 'all') {
                    setStateCode('');
                  }
                  setPage(1);
                }}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="all">All India</option>
                <option value="state">State</option>
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                State
              </p>
              <select
                value={stateCode}
                onChange={(event) => {
                  setStateCode(event.target.value);
                  setPage(1);
                }}
                disabled={locationScope !== 'state' || loadingStates}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
              >
                <option value="">
                  {locationScope === 'state' ? 'Select state' : 'All India mode'}
                </option>
                {states.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.name} ({state.code})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Unit Type</p>
              <select
                value={unitType}
                onChange={(event) => {
                  setUnitType(event.target.value as UnitFilter);
                  setPage(1);
                }}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="ALL">All unit types</option>
                <option value="2BHK">2BHK</option>
                <option value="3BHK">3BHK</option>
                <option value="SHOP">Shop</option>
                <option value="PLOT">Plot</option>
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Sort</p>
              <select
                value={sortKey}
                onChange={(event) => {
                  setSortKey(event.target.value as GroupDealSortKey);
                  setPage(1);
                }}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Min Price</p>
              <Input
                value={minPrice}
                onChange={(event) => {
                  setMinPrice(event.target.value.replace(/[^\d]/g, ''));
                  setPage(1);
                }}
                placeholder="INR"
                className="h-11 bg-white"
              />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Max Price</p>
              <Input
                value={maxPrice}
                onChange={(event) => {
                  setMaxPrice(event.target.value.replace(/[^\d]/g, ''));
                  setPage(1);
                }}
                placeholder="INR"
                className="h-11 bg-white"
              />
            </label>
          </div>

          <label className="mt-4 inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(event) => {
                setVerifiedOnly(event.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-slate-300"
            />
            Verified builder only
          </label>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mr-2 inline h-4 w-4" />
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Loading group deals...
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-slate-900">No group deals found</p>
            <p className="mt-2 text-sm text-slate-600">
              Try changing filters or switch to All India for broader discovery.
            </p>
          </div>
        ) : null}

        {!loading && items.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item) => {
              const estimatedPrice = estimatedGroupPrice(item);
              return (
                <article key={item.dealCode} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{item.dealCode}</p>
                      <h2 className="mt-1 text-xl font-semibold text-slate-900">{item.projectName}</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.builderName}{' '}
                        {item.builderVerified ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Verified Builder
                          </span>
                        ) : (
                          <span className="text-amber-700">Builder not verified</span>
                        )}
                      </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </div>

                  <p className="mt-2 inline-flex items-center gap-1 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    {item.cityName}, {item.stateName}
                    {item.stateCode ? ` (${item.stateCode})` : ''}
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Unit Type</p>
                      <p className="mt-1 font-semibold text-slate-900">{item.unitType}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Base Price</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatPrice(item.basePrice)}</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue-700">Group Benefit</p>
                    <p className="mt-1 text-sm font-medium text-blue-900">{dealBenefitLabel(item)}</p>
                    <p className="mt-1 text-xs text-blue-800">
                      {estimatedPrice
                        ? `Estimated group price: ${formatPrice(estimatedPrice)}`
                        : 'Final pricing confirmed by builder after minimum buyers reached.'}
                    </p>
                  </div>

                  <div className="mt-4 space-y-2">
                    <p className="inline-flex items-center gap-1 text-sm text-slate-700">
                      <Users className="h-4 w-4 text-slate-500" />
                      Joined buyers: {item.joinedBuyers}/{item.minBuyers}
                      {item.maxBuyers ? ` (max ${item.maxBuyers})` : ''}
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${item.progressPercent}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      {item.daysLeft === null
                        ? 'No closing date'
                        : item.daysLeft === 0
                          ? 'Closing today'
                          : `${item.daysLeft} day(s) left`}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      {selectedState && locationScope === 'state'
                        ? `Filtered in ${selectedState.name}`
                        : 'All India view'}
                    </p>
                    <Button
                      onClick={() => onOpenDeal(item.dealCode)}
                      className="bg-brand-primary text-white hover:bg-brand-primary-dark"
                    >
                      View Deal
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {!loading && totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">
              Page {page} of {totalPages} ({total} deals)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-9"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                className="h-9"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="font-semibold">Important Note</p>
          <p className="mt-1">
            ZDT Properties facilitates group interest and builder connections. ZDT does not collect booking amounts for group deals. Final pricing, unit allocation, and purchase agreements are handled directly between the buyer and the builder after builder confirmation.
          </p>
        </div>
      </div>
    </section>
  );
}
