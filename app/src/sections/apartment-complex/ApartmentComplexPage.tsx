import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AuthUser } from '@/lib/session';
import {
  createApartmentBuilding,
  listApartmentComplexBuildings,
  type BuildingSummary,
  type CreateBuildingPayload,
} from '@/lib/apartmentComplexApi';
import ApartmentComplexHome from './ApartmentComplexHome';
import BuildingDetails from './BuildingDetails';
import CreateBuilding from './CreateBuilding';

type ModuleView = 'home' | 'create' | 'details';

interface ApartmentComplexPageProps {
  token: string;
  user: AuthUser | null;
}

export default function ApartmentComplexPage({ token, user }: ApartmentComplexPageProps) {
  const canManageComplex = Boolean(user && (user.role === 'admin' || user.role === 'user'));
  const [view, setView] = useState<ModuleView>('home');
  const [monthKey, setMonthKey] = useState('');
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState('');

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadBuildings = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await listApartmentComplexBuildings(token);
      setMonthKey(response.monthKey || '');
      setBuildings(Array.isArray(response.buildings) ? response.buildings : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load buildings.');
      setBuildings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !canManageComplex) {
      return;
    }
    void loadBuildings();
  }, [token, canManageComplex]);

  const handleCreateBuilding = async (payload: CreateBuildingPayload) => {
    try {
      setCreating(true);
      setError('');
      const response = await createApartmentBuilding(payload, token);
      toast.success('Building created successfully.');
      setSelectedBuildingId(response.building.id);
      await loadBuildings();
      setView('details');
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : 'Unable to create building.';
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  if (!canManageComplex) {
    return (
      <section className="min-h-screen pb-16 pt-28 text-slate-900">
        <div className="page-container">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            Access required. Log in with an authorized account.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        {view !== 'details' ? (
          <div className="zdt-panel-hero rounded-3xl border border-white/20 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-2xl">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Property Management</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Apartment & Complex Management</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/85">
              Floor-wise building setup, room-level tenant tracking, and monthly rent collection monitoring in one dashboard.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/30 px-3 py-1 text-xs font-semibold text-cyan-100">
              <Building2 className="h-3.5 w-3.5" />
              Active Month: {monthKey || 'Current Month'}
            </div>
          </div>
        ) : null}

        {view === 'home' ? (
          <ApartmentComplexHome
            monthKey={monthKey}
            loading={loading}
            error={error}
            buildings={buildings}
            onRefresh={() => {
              void loadBuildings();
            }}
            onCreateBuilding={() => setView('create')}
            onOpenBuilding={(buildingId) => {
              setSelectedBuildingId(buildingId);
              setView('details');
            }}
          />
        ) : null}

        {view === 'create' ? (
          <CreateBuilding
            submitting={creating}
            error={error}
            onCancel={() => setView('home')}
            onSubmit={handleCreateBuilding}
          />
        ) : null}

        {view === 'details' && selectedBuildingId ? (
          <BuildingDetails
            token={token}
            buildingId={selectedBuildingId}
            availableBuildings={buildings}
            onSelectBuilding={(nextBuildingId) => {
              setSelectedBuildingId(nextBuildingId);
            }}
            onBack={() => setView('home')}
            onBuildingUpdated={loadBuildings}
          />
        ) : null}
      </div>
    </section>
  );
}
