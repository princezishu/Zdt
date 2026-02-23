import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AuthUser } from '@/lib/session';
import {
  createFloor,
  type LayoutBuilding,
  type LayoutFloor,
  listFloorsByBuilding,
  listLayoutBuildings,
} from '@/lib/layoutUnitsApi';
import LayoutUnitsShell from './LayoutUnitsShell';

interface FloorDetailPageProps {
  token: string;
  user: AuthUser | null;
  selectedBuildingId: number | null;
  selectedFloorId: number | null;
  onSelectionChange: (next: { buildingId: number | null; floorId: number | null }) => void;
  onOpenFloorDetail: () => void;
  onOpenBuilder: () => void;
  onOpenUnitsList: () => void;
}

export default function FloorDetailPage({
  token,
  user,
  selectedBuildingId,
  selectedFloorId,
  onSelectionChange,
  onOpenFloorDetail,
  onOpenBuilder,
  onOpenUnitsList,
}: FloorDetailPageProps) {
  const [buildings, setBuildings] = useState<LayoutBuilding[]>([]);
  const [floors, setFloors] = useState<LayoutFloor[]>([]);
  const [loadingBuildings, setLoadingBuildings] = useState(true);
  const [loadingFloors, setLoadingFloors] = useState(false);
  const [savingFloor, setSavingFloor] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [floorNumber, setFloorNumber] = useState('');
  const [floorName, setFloorName] = useState('');

  const selectedFloor = useMemo(
    () => floors.find((floor) => floor.id === selectedFloorId) || null,
    [floors, selectedFloorId]
  );

  useEffect(() => {
    if (!token || user?.role !== 'admin') {
      return;
    }
    let active = true;
    setLoadingBuildings(true);
    setError('');
    listLayoutBuildings(token)
      .then((rows) => {
        if (!active) return;
        setBuildings(rows);
        if (!selectedBuildingId && rows.length > 0) {
          onSelectionChange({ buildingId: rows[0].id, floorId: null });
        }
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load buildings.');
      })
      .finally(() => {
        if (!active) return;
        setLoadingBuildings(false);
      });

    return () => {
      active = false;
    };
  }, [token, user?.role, selectedBuildingId, onSelectionChange]);

  useEffect(() => {
    if (!token || !selectedBuildingId || user?.role !== 'admin') {
      setFloors([]);
      return;
    }
    let active = true;
    setLoadingFloors(true);
    listFloorsByBuilding(selectedBuildingId, token)
      .then((rows) => {
        if (!active) return;
        setFloors(rows);
        if (!selectedFloorId && rows.length > 0) {
          onSelectionChange({ buildingId: selectedBuildingId, floorId: rows[0].id });
          return;
        }
        if (selectedFloorId && !rows.some((floor) => floor.id === selectedFloorId)) {
          onSelectionChange({ buildingId: selectedBuildingId, floorId: rows[0]?.id || null });
        }
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load floors.');
      })
      .finally(() => {
        if (!active) return;
        setLoadingFloors(false);
      });

    return () => {
      active = false;
    };
  }, [token, selectedBuildingId, selectedFloorId, user?.role, onSelectionChange]);

  if (!user || user.role !== 'admin') {
    return (
      <section className="min-h-screen pt-28 pb-16 text-slate-900">
        <div className="page-container">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            Admin access required.
          </div>
        </div>
      </section>
    );
  }

  const handleCreateFloor = async () => {
    if (!selectedBuildingId) {
      setError('Select a building first.');
      return;
    }
    const numericFloor = Number(floorNumber);
    if (!Number.isInteger(numericFloor) || numericFloor < 0) {
      setError('Floor number must be a valid integer.');
      return;
    }

    try {
      setSavingFloor(true);
      setError('');
      const created = await createFloor(
        {
          buildingId: selectedBuildingId,
          floorNumber: numericFloor,
          floorName: floorName.trim() || undefined,
        },
        token
      );
      setMessage(`Floor ${created.floorNumber} created.`);
      setFloorNumber('');
      setFloorName('');
      const nextFloors = await listFloorsByBuilding(selectedBuildingId, token);
      setFloors(nextFloors);
      onSelectionChange({ buildingId: selectedBuildingId, floorId: created.id });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create floor.');
    } finally {
      setSavingFloor(false);
    }
  };

  return (
    <LayoutUnitsShell
      activeView="floor-detail"
      title="Floor Detail Page"
      description="Create floors under existing buildings, review uploaded floor layouts, and jump to the layout-based unit builder."
      onOpenFloorDetail={onOpenFloorDetail}
      onOpenBuilder={onOpenBuilder}
      onOpenUnitsList={onOpenUnitsList}
    >
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {message}
        </p>
      )}

      <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-sm font-semibold text-slate-900">Select Building</p>
            <select
              value={selectedBuildingId || ''}
              onChange={(event) =>
                onSelectionChange({
                  buildingId: event.target.value ? Number(event.target.value) : null,
                  floorId: null,
                })
              }
              className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
              disabled={loadingBuildings}
            >
              <option value="">Choose a building...</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name} ({building.city || 'N/A'})
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" onClick={onOpenBuilder}>
            <Upload className="mr-2 h-4 w-4" />
            Upload Layout
          </Button>
        </div>

        {loadingBuildings ? <p className="text-sm text-slate-500">Loading buildings...</p> : null}
      </div>

      <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Create Floor</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            value={floorNumber}
            onChange={(event) => setFloorNumber(event.target.value.replace(/[^\d]/g, ''))}
            placeholder="Floor number (0,1,2...)"
            className="h-10 bg-white"
          />
          <Input
            value={floorName}
            onChange={(event) => setFloorName(event.target.value)}
            placeholder="Floor name (optional)"
            className="h-10 bg-white"
          />
          <Button onClick={() => void handleCreateFloor()} disabled={savingFloor || !selectedBuildingId}>
            {savingFloor ? 'Saving...' : 'Create Floor'}
          </Button>
        </div>
      </div>

      <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Floors</h2>
          <Button variant="outline" onClick={onOpenUnitsList}>
            Open Units List
          </Button>
        </div>

        {loadingFloors ? <p className="text-sm text-slate-500">Loading floors...</p> : null}
        {!loadingFloors && floors.length === 0 ? (
          <p className="text-sm text-slate-500">No floors found for this building.</p>
        ) : null}

        {floors.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Floor</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Layout</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {floors.map((floor) => (
                <TableRow
                  key={floor.id}
                  data-state={floor.id === selectedFloorId ? 'selected' : undefined}
                >
                  <TableCell>#{floor.floorNumber}</TableCell>
                  <TableCell>{floor.floorName || '-'}</TableCell>
                  <TableCell>{floor.latestLayout ? 'Uploaded' : 'Not uploaded'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onSelectionChange({ buildingId: floor.buildingId, floorId: floor.id });
                        onOpenBuilder();
                      }}
                    >
                      Add Units
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </div>

      {selectedFloor ? (
        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Layout Preview - Floor #{selectedFloor.floorNumber}
              </h2>
              <p className="text-sm text-slate-600">{selectedFloor.floorName || 'Unnamed floor'}</p>
            </div>
            <Button onClick={onOpenBuilder}>Add Units</Button>
          </div>

          {selectedFloor.latestLayout ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              {selectedFloor.latestLayout.fileType === 'image' ? (
                <img
                  src={selectedFloor.latestLayout.fileUrl}
                  alt={`Floor ${selectedFloor.floorNumber} layout`}
                  className="max-h-[360px] w-full rounded-lg object-contain"
                />
              ) : (
                <a
                  href={selectedFloor.latestLayout.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-blue-700 underline"
                >
                  Open PDF layout
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No layout uploaded yet for this floor.</p>
          )}
        </div>
      ) : null}
    </LayoutUnitsShell>
  );
}
