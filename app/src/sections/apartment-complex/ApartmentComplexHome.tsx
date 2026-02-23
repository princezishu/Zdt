import { Building2, CalendarDays, CircleDollarSign, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BuildingSummary } from '@/lib/apartmentComplexApi';

interface ApartmentComplexHomeProps {
  monthKey: string;
  loading: boolean;
  error: string;
  buildings: BuildingSummary[];
  onCreateBuilding: () => void;
  onOpenBuilding: (buildingId: string) => void;
  onRefresh: () => void;
}

function toTitle(value: string): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export default function ApartmentComplexHome({
  monthKey,
  loading,
  error,
  buildings,
  onCreateBuilding,
  onOpenBuilding,
  onRefresh,
}: ApartmentComplexHomeProps) {
  const totals = buildings.reduce(
    (acc, building) => {
      acc.rooms += building.totalRooms || 0;
      acc.paid += building.paidThisMonth || 0;
      acc.pending += building.pendingThisMonth || 0;
      acc.collected += building.totalCollectedThisMonth || 0;
      acc.pendingAmount += building.totalPendingAmount || 0;
      return acc;
    },
    {
      rooms: 0,
      paid: 0,
      pending: 0,
      collected: 0,
      pendingAmount: 0,
    }
  );

  return (
    <div className="space-y-4">
      <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Apartment & Complex Buildings</h2>
            <p className="mt-1 text-sm text-slate-600">
              Manage rent status, tenants, and monthly collection for {monthKey}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onRefresh} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button onClick={onCreateBuilding}>Create Building</Button>
          </div>
        </div>
      </div>

      {!loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Buildings</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{buildings.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Total Rooms</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{totals.rooms}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-emerald-700">Paid Rooms</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-800">{totals.paid}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-red-700">Pending Rooms</p>
            <p className="mt-1 text-2xl font-semibold text-red-800">{totals.pending}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-blue-700">Collected</p>
            <p className="mt-1 text-xl font-semibold text-blue-800">{formatCurrency(totals.collected)}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-amber-700">Pending Amount</p>
            <p className="mt-1 text-xl font-semibold text-amber-800">{formatCurrency(totals.pendingAmount)}</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`building-skeleton-${index}`}
              className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : null}

      {!loading && buildings.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No buildings yet. Create your first building to start room-level rent tracking.
        </div>
      ) : null}

      {!loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {buildings.map((building) => (
            <button
              key={building.id}
              type="button"
              onClick={() => onOpenBuilding(building.id)}
              className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                building.isSold ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                    {toTitle(building.type)}
                  </span>
                  {building.isSold ? (
                    <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-amber-800">
                      Sold
                    </span>
                  ) : null}
                </div>
              </div>

              <h3 className="mt-4 text-lg font-semibold text-slate-900">{building.name}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{building.address}</p>
              {building.isSold && building.soldNote ? (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                  Sold Note: {building.soldNote}
                </p>
              ) : null}

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between text-slate-700">
                  <span>Total Floors</span>
                  <span className="font-semibold text-slate-900">{building.totalFloors}</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Total Rooms</span>
                  <span className="font-semibold text-slate-900">{building.totalRooms}</span>
                </div>
                <div className="flex items-center justify-between text-emerald-700">
                  <span>Paid This Month</span>
                  <span className="font-semibold">{building.paidThisMonth}</span>
                </div>
                <div className="flex items-center justify-between text-red-700">
                  <span>Pending This Month</span>
                  <span className="font-semibold">{building.pendingThisMonth}</span>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                  <span>Collection completion</span>
                  <span className="font-semibold text-slate-700">
                    {building.totalRooms > 0 ? Math.round((building.paidThisMonth / building.totalRooms) * 100) : 0}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          building.totalRooms > 0
                            ? Math.round((building.paidThisMonth / building.totalRooms) * 100)
                            : 0
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                  <CircleDollarSign className="h-3.5 w-3.5" />
                  Collected: {formatCurrency(building.totalCollectedThisMonth)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 font-semibold text-red-700">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Pending: {formatCurrency(building.totalPendingAmount)}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
