import { useEffect, useMemo, useState } from 'react';
import { Filter, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  type LayoutBuilding,
  type LayoutFloor,
  listFloorsByBuilding,
  listLayoutBuildings,
  listUnits,
  type UnitCategory,
  type UnitListingType,
  type UnitRecord,
  type UnitStatus,
  type UnitType,
  updateUnit,
} from '@/lib/layoutUnitsApi';
import { listAmenities, type Amenity } from '@/lib/realtyApi';
import LayoutUnitsShell from './LayoutUnitsShell';

interface UnitsListPageProps {
  token: string;
  user: AuthUser | null;
  selectedBuildingId: number | null;
  selectedFloorId: number | null;
  onSelectionChange: (next: { buildingId: number | null; floorId: number | null }) => void;
  onOpenFloorDetail: () => void;
  onOpenBuilder: () => void;
  onOpenUnitsList: () => void;
}

interface EditFormState {
  unitId: number;
  unitNumber: string;
  unitType: UnitType;
  category: UnitCategory;
  listingType: UnitListingType;
  areaCovered: string;
  priceValue: string;
  depositAmount: string;
  maintenanceAmount: string;
  status: UnitStatus;
  occupiedByUserId: string;
  notes: string;
  amenityIds: number[];
}

const unitTypeOptions: Array<'all' | UnitType> = ['all', 'Flat', 'Room', 'Shop', 'Office'];
const categoryOptions: Array<'all' | UnitCategory> = ['all', 'Residential', 'Commercial'];
const listingTypeOptions: Array<'all' | UnitListingType> = ['all', 'Rent', 'Sale', 'Lease'];
const statusOptions: Array<'all' | UnitStatus> = ['all', 'Available', 'Occupied', 'Maintenance'];

function emptyEditForm(): EditFormState | null {
  return null;
}

function toEditForm(unit: UnitRecord): EditFormState {
  const price =
    unit.listingType === 'Rent'
      ? unit.rentAmount
      : unit.listingType === 'Sale'
        ? unit.salePrice
        : unit.leaseAmount;
  return {
    unitId: unit.id,
    unitNumber: unit.unitNumber,
    unitType: unit.unitType,
    category: unit.category,
    listingType: unit.listingType,
    areaCovered: String(unit.areaCovered || ''),
    priceValue: price == null ? '' : String(price),
    depositAmount: unit.depositAmount == null ? '' : String(unit.depositAmount),
    maintenanceAmount: unit.maintenanceAmount == null ? '' : String(unit.maintenanceAmount),
    status: unit.status,
    occupiedByUserId: unit.occupiedByUserId == null ? '' : String(unit.occupiedByUserId),
    notes: unit.notes || '',
    amenityIds: unit.amenityIds || [],
  };
}

function resolvePrice(unit: UnitRecord): number | null {
  if (unit.listingType === 'Rent') return unit.rentAmount;
  if (unit.listingType === 'Sale') return unit.salePrice;
  return unit.leaseAmount;
}

export default function UnitsListPage({
  token,
  user,
  selectedBuildingId,
  selectedFloorId,
  onSelectionChange,
  onOpenFloorDetail,
  onOpenBuilder,
  onOpenUnitsList,
}: UnitsListPageProps) {
  const [buildings, setBuildings] = useState<LayoutBuilding[]>([]);
  const [floors, setFloors] = useState<LayoutFloor[]>([]);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);

  const [statusFilter, setStatusFilter] = useState<'all' | UnitStatus>('all');
  const [unitTypeFilter, setUnitTypeFilter] = useState<'all' | UnitType>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | UnitCategory>('all');
  const [listingTypeFilter, setListingTypeFilter] = useState<'all' | UnitListingType>('all');
  const [areaMin, setAreaMin] = useState('');
  const [areaMax, setAreaMax] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(emptyEditForm());
  const [savingEdit, setSavingEdit] = useState(false);

  const totalVisible = useMemo(() => units.length, [units]);

  useEffect(() => {
    if (!token || user?.role !== 'admin') {
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([listLayoutBuildings(token), listAmenities()])
      .then(([buildingRows, amenityRows]) => {
        if (!active) return;
        setBuildings(buildingRows);
        setAmenities(amenityRows);
        if (!selectedBuildingId && buildingRows.length > 0) {
          onSelectionChange({ buildingId: buildingRows[0].id, floorId: null });
        }
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load units page context.');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
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
    listFloorsByBuilding(selectedBuildingId, token)
      .then((rows) => {
        if (!active) return;
        setFloors(rows);
        if (!selectedFloorId && rows.length > 0) {
          onSelectionChange({ buildingId: selectedBuildingId, floorId: rows[0].id });
        }
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load floors.');
      });

    return () => {
      active = false;
    };
  }, [token, selectedBuildingId, selectedFloorId, user?.role, onSelectionChange]);

  const refreshUnits = async () => {
    try {
      setLoadingUnits(true);
      setError('');
      const rows = await listUnits(
        {
          buildingId: selectedBuildingId,
          floorId: selectedFloorId,
          status: statusFilter,
          unitType: unitTypeFilter,
          category: categoryFilter,
          listingType: listingTypeFilter,
          areaMin: areaMin ? Number(areaMin) : null,
          areaMax: areaMax ? Number(areaMax) : null,
          priceMin: priceMin ? Number(priceMin) : null,
          priceMax: priceMax ? Number(priceMax) : null,
          q: search.trim(),
          limit: 200,
        },
        token
      );
      setUnits(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load units.');
    } finally {
      setLoadingUnits(false);
    }
  };

  useEffect(() => {
    if (!token || user?.role !== 'admin') {
      return;
    }
    void refreshUnits();
  }, [token, user?.role, selectedBuildingId, selectedFloorId, statusFilter, unitTypeFilter, categoryFilter, listingTypeFilter]);

  if (!user || user.role !== 'admin') {
    return (
      <section className="min-h-screen pb-16 pt-28 text-slate-900">
        <div className="page-container">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            Admin access required.
          </div>
        </div>
      </section>
    );
  }

  const toggleAmenity = (amenityId: number) => {
    if (!editForm) return;
    const exists = editForm.amenityIds.includes(amenityId);
    setEditForm({
      ...editForm,
      amenityIds: exists
        ? editForm.amenityIds.filter((id) => id !== amenityId)
        : [...editForm.amenityIds, amenityId],
    });
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    const area = Number(editForm.areaCovered);
    const price = editForm.priceValue ? Number(editForm.priceValue) : null;
    if (!Number.isFinite(area) || area <= 0) {
      setError('Area covered must be valid.');
      return;
    }

    try {
      setSavingEdit(true);
      setError('');
      await updateUnit(
        editForm.unitId,
        {
          unitNumber: editForm.unitNumber.trim(),
          unitType: editForm.unitType,
          category: editForm.category,
          listingType: editForm.listingType,
          areaCovered: area,
          rentAmount: editForm.listingType === 'Rent' ? price : null,
          salePrice: editForm.listingType === 'Sale' ? price : null,
          leaseAmount: editForm.listingType === 'Lease' ? price : null,
          depositAmount: editForm.depositAmount ? Number(editForm.depositAmount) : null,
          maintenanceAmount: editForm.maintenanceAmount ? Number(editForm.maintenanceAmount) : null,
          status: editForm.status,
          occupiedByUserId: editForm.occupiedByUserId ? Number(editForm.occupiedByUserId) : null,
          notes: editForm.notes,
          amenityIds: editForm.amenityIds,
        },
        token
      );
      setMessage(`Unit ${editForm.unitNumber} updated.`);
      setEditDialogOpen(false);
      setEditForm(emptyEditForm());
      await refreshUnits();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update unit.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <LayoutUnitsShell
      activeView="units-list"
      title="Units List Page"
      description="Filter units by area, pricing, status, and type. Edit existing units using the same module rules."
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
        <div className="flex items-center gap-2 text-slate-900">
          <Filter className="h-4 w-4" />
          <p className="text-sm font-semibold">Filters</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <select
            value={selectedBuildingId || ''}
            onChange={(event) =>
              onSelectionChange({
                buildingId: event.target.value ? Number(event.target.value) : null,
                floorId: null,
              })
            }
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
            disabled={loading}
          >
            <option value="">All buildings</option>
            {buildings.map((building) => (
              <option key={building.id} value={building.id}>
                {building.name}
              </option>
            ))}
          </select>
          <select
            value={selectedFloorId || ''}
            onChange={(event) =>
              onSelectionChange({
                buildingId: selectedBuildingId,
                floorId: event.target.value ? Number(event.target.value) : null,
              })
            }
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="">All floors</option>
            {floors.map((floor) => (
              <option key={floor.id} value={floor.id}>
                Floor #{floor.floorNumber}
              </option>
            ))}
          </select>
          <select value={unitTypeFilter} onChange={(event) => setUnitTypeFilter(event.target.value as 'all' | UnitType)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
            {unitTypeOptions.map((option) => (
              <option key={option} value={option}>
                Unit Type: {option}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | UnitStatus)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                Status: {option}
              </option>
            ))}
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as 'all' | UnitCategory)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                Category: {option}
              </option>
            ))}
          </select>
          <select value={listingTypeFilter} onChange={(event) => setListingTypeFilter(event.target.value as 'all' | UnitListingType)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
            {listingTypeOptions.map((option) => (
              <option key={option} value={option}>
                Listing: {option}
              </option>
            ))}
          </select>
          <Input value={areaMin} onChange={(event) => setAreaMin(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="Area min" className="h-10 bg-white" />
          <Input value={areaMax} onChange={(event) => setAreaMax(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="Area max" className="h-10 bg-white" />
          <Input value={priceMin} onChange={(event) => setPriceMin(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="Price min" className="h-10 bg-white" />
          <Input value={priceMax} onChange={(event) => setPriceMax(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="Price max" className="h-10 bg-white" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search unit/building/floor" className="h-10 bg-white lg:col-span-2" />
          <div className="flex gap-2 lg:col-span-2">
            <Button variant="outline" onClick={() => void refreshUnits()} disabled={loadingUnits}>
              {loadingUnits ? 'Loading...' : 'Apply'}
            </Button>
            <Button onClick={onOpenBuilder}>Open Builder</Button>
          </div>
        </div>
      </div>

      <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Units ({totalVisible})</h2>
          {loadingUnits ? <span className="text-xs text-slate-500">Refreshing...</span> : null}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Listing</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Amenities</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell>
                  <p className="font-medium text-slate-900">{unit.unitNumber}</p>
                  <p className="text-xs text-slate-500">
                    {unit.buildingName} | Floor #{unit.floorNumber}
                  </p>
                </TableCell>
                <TableCell>{unit.unitType}</TableCell>
                <TableCell>{unit.listingType}</TableCell>
                <TableCell>{unit.areaCovered}</TableCell>
                <TableCell>{resolvePrice(unit) == null ? '-' : resolvePrice(unit)}</TableCell>
                <TableCell>{unit.status}</TableCell>
                <TableCell>{unit.amenities.length > 0 ? unit.amenities.join(', ') : '-'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditForm(toEditForm(unit));
                      setEditDialogOpen(true);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {units.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-500">
                  No units found for current filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Unit</DialogTitle>
            <DialogDescription>Update pricing, status, and amenities.</DialogDescription>
          </DialogHeader>

          {editForm ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={editForm.unitNumber} onChange={(event) => setEditForm({ ...editForm, unitNumber: event.target.value })} placeholder="Unit number" className="h-10 bg-white" />
                <select value={editForm.unitType} onChange={(event) => setEditForm({ ...editForm, unitType: event.target.value as UnitType })} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
                  {unitTypeOptions.filter((option) => option !== 'all').map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value as UnitCategory })} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
                  {categoryOptions.filter((option) => option !== 'all').map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select value={editForm.listingType} onChange={(event) => setEditForm({ ...editForm, listingType: event.target.value as UnitListingType })} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
                  {listingTypeOptions.filter((option) => option !== 'all').map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <Input value={editForm.areaCovered} onChange={(event) => setEditForm({ ...editForm, areaCovered: event.target.value })} placeholder="Area covered" className="h-10 bg-white" />
                <Input value={editForm.priceValue} onChange={(event) => setEditForm({ ...editForm, priceValue: event.target.value })} placeholder="Price / rent / lease" className="h-10 bg-white" />
                <Input value={editForm.depositAmount} onChange={(event) => setEditForm({ ...editForm, depositAmount: event.target.value })} placeholder="Deposit" className="h-10 bg-white" />
                <Input value={editForm.maintenanceAmount} onChange={(event) => setEditForm({ ...editForm, maintenanceAmount: event.target.value })} placeholder="Maintenance" className="h-10 bg-white" />
                <select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value as UnitStatus })} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900">
                  {statusOptions.filter((option) => option !== 'all').map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <Input value={editForm.occupiedByUserId} onChange={(event) => setEditForm({ ...editForm, occupiedByUserId: event.target.value.replace(/[^\d]/g, '') })} placeholder="Tenant user id (if occupied)" className="h-10 bg-white" />
              </div>
              <Input value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} placeholder="Notes" className="h-10 bg-white" />

              <div className="max-h-40 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Amenities</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {amenities.map((amenity) => (
                    <label key={amenity.id} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
                      <input type="checkbox" checked={editForm.amenityIds.includes(amenity.id)} onChange={() => toggleAmenity(amenity.id)} className="h-4 w-4 accent-blue-700" />
                      <span>{amenity.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveEdit()} disabled={savingEdit || !editForm}>
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LayoutUnitsShell>
  );
}
