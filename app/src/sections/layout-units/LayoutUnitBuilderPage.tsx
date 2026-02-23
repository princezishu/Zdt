import { useEffect, useMemo, useRef, useState } from 'react';
import { Edit, MousePointerClick, PlusCircle } from 'lucide-react';
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
import type { AuthUser } from '@/lib/session';
import {
  createUnit,
  createUnitsBulk,
  getLatestFloorLayout,
  type LayoutBuilding,
  type LayoutFile,
  type LayoutFloor,
  type LayoutMarker,
  listFloorsByBuilding,
  listLayoutBuildings,
  listLayoutMarkers,
  listUnits,
  type UnitCategory,
  type UnitListingType,
  type UnitRecord,
  type UnitStatus,
  type UnitType,
  updateUnit,
  uploadFloorLayout,
  upsertLayoutMarkers,
} from '@/lib/layoutUnitsApi';
import { listAmenities, type Amenity } from '@/lib/realtyApi';
import LayoutAIAssist from './LayoutAIAssist';
import LayoutUnitsShell from './LayoutUnitsShell';
import PaymentGatewayPlaceholder from './PaymentGatewayPlaceholder';

interface LayoutUnitBuilderPageProps {
  token: string;
  user: AuthUser | null;
  selectedBuildingId: number | null;
  selectedFloorId: number | null;
  onSelectionChange: (next: { buildingId: number | null; floorId: number | null }) => void;
  onOpenFloorDetail: () => void;
  onOpenBuilder: () => void;
  onOpenUnitsList: () => void;
}

interface BulkDraftUnit {
  unitNumber: string;
  unitType: UnitType;
  category: UnitCategory;
  listingType: UnitListingType;
  areaCovered: string;
  priceValue: string;
  status: UnitStatus;
}

interface MarkerFormState {
  mode: 'create' | 'edit';
  unitId: number | null;
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
  amenityIds: number[];
  notes: string;
  x: number;
  y: number;
}

const unitTypeOptions: UnitType[] = ['Flat', 'Room', 'Shop', 'Office'];
const categoryOptions: UnitCategory[] = ['Residential', 'Commercial'];
const listingTypeOptions: UnitListingType[] = ['Rent', 'Sale', 'Lease'];
const statusOptions: UnitStatus[] = ['Available', 'Occupied', 'Maintenance'];

function emptyMarkerForm(x = 0, y = 0): MarkerFormState {
  return {
    mode: 'create',
    unitId: null,
    unitNumber: '',
    unitType: 'Flat',
    category: 'Residential',
    listingType: 'Rent',
    areaCovered: '',
    priceValue: '',
    depositAmount: '',
    maintenanceAmount: '',
    status: 'Available',
    occupiedByUserId: '',
    amenityIds: [],
    notes: '',
    x,
    y,
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read selected file.'));
    reader.readAsDataURL(file);
  });
}

function formatPriceLabel(listingType: UnitListingType): string {
  if (listingType === 'Rent') return 'Rent';
  if (listingType === 'Sale') return 'Sale';
  return 'Lease';
}

export default function LayoutUnitBuilderPage({
  token,
  user,
  selectedBuildingId,
  selectedFloorId,
  onSelectionChange,
  onOpenFloorDetail,
  onOpenBuilder,
  onOpenUnitsList,
}: LayoutUnitBuilderPageProps) {
  const [buildings, setBuildings] = useState<LayoutBuilding[]>([]);
  const [floors, setFloors] = useState<LayoutFloor[]>([]);
  const [layout, setLayout] = useState<LayoutFile | null>(null);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [unitsForFloor, setUnitsForFloor] = useState<UnitRecord[]>([]);
  const [markers, setMarkers] = useState<LayoutMarker[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingFloors, setLoadingFloors] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [uploadingLayout, setUploadingLayout] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeMode, setActiveMode] = useState<'bulk' | 'click'>('bulk');

  const [bulkUnitCount, setBulkUnitCount] = useState('10');
  const [bulkPrefix, setBulkPrefix] = useState('U');
  const [bulkStartNumber, setBulkStartNumber] = useState('1');
  const [bulkArea, setBulkArea] = useState('750');
  const [bulkListingType, setBulkListingType] = useState<UnitListingType>('Rent');
  const [bulkPrice, setBulkPrice] = useState('15000');
  const [bulkUnits, setBulkUnits] = useState<BulkDraftUnit[]>([]);
  const [savingBulkUnits, setSavingBulkUnits] = useState(false);

  const [markerDialogOpen, setMarkerDialogOpen] = useState(false);
  const [markerForm, setMarkerForm] = useState<MarkerFormState>(emptyMarkerForm());
  const [savingMarkerUnit, setSavingMarkerUnit] = useState(false);
  const layoutCanvasRef = useRef<HTMLDivElement | null>(null);

  const selectedFloor = useMemo(
    () => floors.find((floor) => floor.id === selectedFloorId) || null,
    [floors, selectedFloorId]
  );

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
        setError(loadError instanceof Error ? loadError.message : 'Unable to load layout builder data.');
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
      setLayout(null);
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

  useEffect(() => {
    if (!token || !selectedFloorId || user?.role !== 'admin') {
      setLayout(null);
      setUnitsForFloor([]);
      setMarkers([]);
      return;
    }
    let active = true;
    setLoadingContext(true);
    Promise.all([
      getLatestFloorLayout(selectedFloorId, token),
      listUnits({ floorId: selectedFloorId, limit: 200 }, token),
      listLayoutMarkers(selectedFloorId, token),
    ])
      .then(([layoutRow, floorUnits, markerRows]) => {
        if (!active) return;
        setLayout(layoutRow);
        setUnitsForFloor(floorUnits);
        setMarkers(markerRows);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load floor layout context.');
      })
      .finally(() => {
        if (!active) return;
        setLoadingContext(false);
      });

    return () => {
      active = false;
    };
  }, [token, selectedFloorId, user?.role]);

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

  const refreshFloorContext = async () => {
    if (!selectedFloorId) return;
    const [layoutRow, floorUnits, markerRows] = await Promise.all([
      getLatestFloorLayout(selectedFloorId, token),
      listUnits({ floorId: selectedFloorId, limit: 200 }, token),
      listLayoutMarkers(selectedFloorId, token),
    ]);
    setLayout(layoutRow);
    setUnitsForFloor(floorUnits);
    setMarkers(markerRows);
  };

  const handleUploadLayout = async () => {
    if (!selectedFloorId) {
      setError('Select a floor before uploading layout.');
      return;
    }
    if (!selectedFile) {
      setError('Choose a PNG/JPG/PDF layout file first.');
      return;
    }

    try {
      setUploadingLayout(true);
      setError('');
      const fileDataUrl = await fileToDataUrl(selectedFile);
      await uploadFloorLayout(
        {
          floorId: selectedFloorId,
          fileDataUrl,
          originalName: selectedFile.name,
        },
        token
      );
      setMessage(`Layout uploaded for floor #${selectedFloor?.floorNumber || selectedFloorId}.`);
      setSelectedFile(null);
      await refreshFloorContext();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload layout.');
    } finally {
      setUploadingLayout(false);
    }
  };

  const generateBulkDraft = () => {
    const count = Number(bulkUnitCount);
    const start = Number(bulkStartNumber);
    if (!Number.isInteger(count) || count <= 0 || count > 200) {
      setError('Unit count must be between 1 and 200.');
      return;
    }
    if (!Number.isInteger(start) || start < 0) {
      setError('Start number must be a valid integer.');
      return;
    }

    const units: BulkDraftUnit[] = [];
    for (let index = 0; index < count; index += 1) {
      const nextNumber = start + index;
      const normalizedPrefix = bulkPrefix.trim();
      units.push({
        unitNumber: normalizedPrefix ? `${normalizedPrefix}${nextNumber}` : String(nextNumber),
        unitType: 'Flat',
        category: 'Residential',
        listingType: bulkListingType,
        areaCovered: bulkArea,
        priceValue: bulkPrice,
        status: 'Available',
      });
    }
    setBulkUnits(units);
    setMessage(`${units.length} units generated. Edit rows before saving.`);
  };

  const handleSaveBulkUnits = async () => {
    if (!selectedFloorId) {
      setError('Select a floor first.');
      return;
    }
    if (bulkUnits.length === 0) {
      setError('Generate units before saving.');
      return;
    }

    try {
      setSavingBulkUnits(true);
      setError('');
      await createUnitsBulk(
        {
          floorId: selectedFloorId,
          units: bulkUnits.map((row) => {
            const price = row.priceValue ? Number(row.priceValue) : null;
            return {
              unitNumber: row.unitNumber.trim(),
              unitType: row.unitType,
              category: row.category,
              listingType: row.listingType,
              areaCovered: Number(row.areaCovered || 0),
              rentAmount: row.listingType === 'Rent' ? price : null,
              salePrice: row.listingType === 'Sale' ? price : null,
              leaseAmount: row.listingType === 'Lease' ? price : null,
              status: row.status,
              amenityIds: [],
            };
          }),
        },
        token
      );
      setMessage(`${bulkUnits.length} units saved successfully.`);
      setBulkUnits([]);
      await refreshFloorContext();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save bulk units.');
    } finally {
      setSavingBulkUnits(false);
    }
  };

  const openMarkerDialogForCreate = (x: number, y: number) => {
    setMarkerForm(emptyMarkerForm(x, y));
    setMarkerDialogOpen(true);
  };

  const openMarkerDialogForEdit = (marker: LayoutMarker) => {
    const unit = unitsForFloor.find((item) => item.id === marker.unitId);
    if (!unit) return;
    const price =
      unit.listingType === 'Rent'
        ? unit.rentAmount
        : unit.listingType === 'Sale'
          ? unit.salePrice
          : unit.leaseAmount;

    setMarkerForm({
      mode: 'edit',
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
      amenityIds: unit.amenityIds || [],
      notes: unit.notes || '',
      x: marker.x,
      y: marker.y,
    });
    setMarkerDialogOpen(true);
  };

  const handleLayoutClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!layout || layout.fileType !== 'image') {
      return;
    }
    const bounds = layoutCanvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    openMarkerDialogForCreate(Number(x.toFixed(3)), Number(y.toFixed(3)));
  };

  const toggleAmenity = (amenityId: number) => {
    setMarkerForm((prev) => {
      const exists = prev.amenityIds.includes(amenityId);
      return {
        ...prev,
        amenityIds: exists
          ? prev.amenityIds.filter((id) => id !== amenityId)
          : [...prev.amenityIds, amenityId],
      };
    });
  };

  const handleSaveMarkerUnit = async () => {
    if (!selectedFloorId) return;
    const area = Number(markerForm.areaCovered);
    const price = markerForm.priceValue ? Number(markerForm.priceValue) : null;
    if (!markerForm.unitNumber.trim()) {
      setError('Unit number is required.');
      return;
    }
    if (!Number.isFinite(area) || area <= 0) {
      setError('Area covered must be valid.');
      return;
    }

    try {
      setSavingMarkerUnit(true);
      setError('');
      const payload = {
        unitNumber: markerForm.unitNumber.trim(),
        unitType: markerForm.unitType,
        category: markerForm.category,
        listingType: markerForm.listingType,
        areaCovered: area,
        rentAmount: markerForm.listingType === 'Rent' ? price : null,
        salePrice: markerForm.listingType === 'Sale' ? price : null,
        leaseAmount: markerForm.listingType === 'Lease' ? price : null,
        depositAmount: markerForm.depositAmount ? Number(markerForm.depositAmount) : null,
        maintenanceAmount: markerForm.maintenanceAmount ? Number(markerForm.maintenanceAmount) : null,
        status: markerForm.status,
        occupiedByUserId: markerForm.occupiedByUserId ? Number(markerForm.occupiedByUserId) : null,
        amenityIds: markerForm.amenityIds,
        notes: markerForm.notes,
      };

      if (markerForm.mode === 'edit' && markerForm.unitId) {
        await updateUnit(
          markerForm.unitId,
          {
            ...payload,
            marker: { x: markerForm.x, y: markerForm.y },
          },
          token
        );
      } else {
        await createUnit(
          {
            floorId: selectedFloorId,
            ...payload,
            marker: { x: markerForm.x, y: markerForm.y },
          },
          token
        );
      }

      if (markerForm.mode === 'edit' && markerForm.unitId) {
        await upsertLayoutMarkers(
          {
            floorId: selectedFloorId,
            markers: [{ unitId: markerForm.unitId, x: markerForm.x, y: markerForm.y }],
          },
          token
        );
      }

      setMarkerDialogOpen(false);
      setMessage(markerForm.mode === 'edit' ? 'Marker and unit updated.' : 'Unit added on layout.');
      await refreshFloorContext();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save unit.');
    } finally {
      setSavingMarkerUnit(false);
    }
  };

  return (
    <LayoutUnitsShell
      activeView="builder"
      title="Layout & Unit Builder Page"
      description="Step 1 upload a floor layout. Step 2 create units through bulk template generation or click-to-add marker mapping."
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
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Step 1 - Select Floor</p>
        <div className="grid gap-3 md:grid-cols-2">
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
            <option value="">Select building...</option>
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
            disabled={!selectedBuildingId || loadingFloors}
          >
            <option value="">Select floor...</option>
            {floors.map((floor) => (
              <option key={floor.id} value={floor.id}>
                Floor #{floor.floorNumber} - {floor.floorName || 'Unnamed'}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            type="file"
            accept=".png,.jpg,.jpeg,.pdf,application/pdf,image/png,image/jpeg"
            onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            className="h-10 bg-white"
          />
          <Button onClick={() => void handleUploadLayout()} disabled={!selectedFile || uploadingLayout || !selectedFloorId}>
            {uploadingLayout ? 'Uploading...' : 'Upload Layout'}
          </Button>
        </div>

        {loadingContext ? <p className="text-sm text-slate-500">Loading floor context...</p> : null}
        {layout ? (
          <p className="text-xs text-slate-600">
            Active layout: {layout.originalName || `Layout #${layout.id}`} ({layout.fileType.toUpperCase()})
          </p>
        ) : (
          <p className="text-xs text-slate-500">No layout uploaded yet.</p>
        )}
      </div>

      <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Step 2 - Creation Method</p>
        <div className="flex flex-wrap gap-2">
          <Button variant={activeMode === 'bulk' ? 'default' : 'outline'} onClick={() => setActiveMode('bulk')}>
            Template / Bulk Builder
          </Button>
          <Button variant={activeMode === 'click' ? 'default' : 'outline'} onClick={() => setActiveMode('click')}>
            Click-to-Add on Layout
          </Button>
        </div>

        {activeMode === 'bulk' ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Input
                value={bulkUnitCount}
                onChange={(event) => setBulkUnitCount(event.target.value.replace(/[^\d]/g, ''))}
                placeholder="No. of units"
                className="h-10 bg-white"
              />
              <Input
                value={bulkPrefix}
                onChange={(event) => setBulkPrefix(event.target.value)}
                placeholder="Unit prefix"
                className="h-10 bg-white"
              />
              <Input
                value={bulkStartNumber}
                onChange={(event) => setBulkStartNumber(event.target.value.replace(/[^\d]/g, ''))}
                placeholder="Start number"
                className="h-10 bg-white"
              />
              <Input
                value={bulkArea}
                onChange={(event) => setBulkArea(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="Default area"
                className="h-10 bg-white"
              />
              <select
                value={bulkListingType}
                onChange={(event) => setBulkListingType(event.target.value as UnitListingType)}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
              >
                {listingTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <Input
                value={bulkPrice}
                onChange={(event) => setBulkPrice(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="Default price"
                className="h-10 bg-white"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={generateBulkDraft}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Generate Units
              </Button>
              <Button onClick={() => void handleSaveBulkUnits()} disabled={savingBulkUnits || bulkUnits.length === 0 || !selectedFloorId}>
                {savingBulkUnits ? 'Saving...' : 'Save All Units'}
              </Button>
            </div>

            {bulkUnits.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Unit No</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Listing</th>
                      <th className="px-3 py-2">Area</th>
                      <th className="px-3 py-2">Price</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkUnits.map((row, index) => (
                      <tr key={`${row.unitNumber}-${index}`} className="border-t border-slate-200">
                        <td className="px-3 py-2">
                          <input
                            value={row.unitNumber}
                            onChange={(event) =>
                              setBulkUnits((prev) =>
                                prev.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, unitNumber: event.target.value } : item
                                )
                              )
                            }
                            className="h-9 w-full rounded-md border border-slate-300 px-2"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.unitType}
                            onChange={(event) =>
                              setBulkUnits((prev) =>
                                prev.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, unitType: event.target.value as UnitType } : item
                                )
                              )
                            }
                            className="h-9 w-full rounded-md border border-slate-300 px-2"
                          >
                            {unitTypeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.category}
                            onChange={(event) =>
                              setBulkUnits((prev) =>
                                prev.map((item, rowIndex) =>
                                  rowIndex === index
                                    ? { ...item, category: event.target.value as UnitCategory }
                                    : item
                                )
                              )
                            }
                            className="h-9 w-full rounded-md border border-slate-300 px-2"
                          >
                            {categoryOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.listingType}
                            onChange={(event) =>
                              setBulkUnits((prev) =>
                                prev.map((item, rowIndex) =>
                                  rowIndex === index
                                    ? { ...item, listingType: event.target.value as UnitListingType }
                                    : item
                                )
                              )
                            }
                            className="h-9 w-full rounded-md border border-slate-300 px-2"
                          >
                            {listingTypeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={row.areaCovered}
                            onChange={(event) =>
                              setBulkUnits((prev) =>
                                prev.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, areaCovered: event.target.value } : item
                                )
                              )
                            }
                            className="h-9 w-full rounded-md border border-slate-300 px-2"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={row.priceValue}
                            onChange={(event) =>
                              setBulkUnits((prev) =>
                                prev.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, priceValue: event.target.value } : item
                                )
                              )
                            }
                            className="h-9 w-full rounded-md border border-slate-300 px-2"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.status}
                            onChange={(event) =>
                              setBulkUnits((prev) =>
                                prev.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, status: event.target.value as UnitStatus } : item
                                )
                              )
                            }
                            className="h-9 w-full rounded-md border border-slate-300 px-2"
                          >
                            {statusOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Generate rows to edit and save bulk units.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {!layout || layout.fileType !== 'image' ? (
              <p className="text-sm text-slate-500">
                Upload an image layout (PNG/JPG) to enable click-to-add marker mode.
              </p>
            ) : (
              <div
                ref={layoutCanvasRef}
                onClick={handleLayoutClick}
                className="relative cursor-crosshair overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
              >
                <img src={layout.fileUrl} alt="Floor layout" className="max-h-[560px] w-full object-contain" />
                {markers.map((marker) => (
                  <button
                    key={marker.id}
                    type="button"
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-blue-700 text-white shadow-lg"
                    style={{ left: `${marker.x}%`, top: `${marker.y}%`, width: 22, height: 22 }}
                    title={`Edit ${marker.unitNumber}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      openMarkerDialogForEdit(marker);
                    }}
                  >
                    <Edit className="mx-auto h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-600">
              <MousePointerClick className="mr-1 inline h-3.5 w-3.5" />
              Click on the layout to place a marker and enter unit details.
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <LayoutAIAssist />
        <PaymentGatewayPlaceholder />
      </div>

      <Dialog open={markerDialogOpen} onOpenChange={setMarkerDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {markerForm.mode === 'edit' ? 'Edit Marker & Unit' : 'Add Unit On Layout'}
            </DialogTitle>
            <DialogDescription>
              Coordinates: X {markerForm.x.toFixed(2)}%, Y {markerForm.y.toFixed(2)}%
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              value={markerForm.unitNumber}
              onChange={(event) => setMarkerForm((prev) => ({ ...prev, unitNumber: event.target.value }))}
              placeholder="Unit number"
              className="h-10 bg-white"
            />
            <select
              value={markerForm.unitType}
              onChange={(event) => setMarkerForm((prev) => ({ ...prev, unitType: event.target.value as UnitType }))}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              {unitTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={markerForm.category}
              onChange={(event) =>
                setMarkerForm((prev) => ({ ...prev, category: event.target.value as UnitCategory }))
              }
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={markerForm.listingType}
              onChange={(event) =>
                setMarkerForm((prev) => ({ ...prev, listingType: event.target.value as UnitListingType }))
              }
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              {listingTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <Input
              value={markerForm.areaCovered}
              onChange={(event) => setMarkerForm((prev) => ({ ...prev, areaCovered: event.target.value }))}
              placeholder="Area covered"
              className="h-10 bg-white"
            />
            <Input
              value={markerForm.priceValue}
              onChange={(event) => setMarkerForm((prev) => ({ ...prev, priceValue: event.target.value }))}
              placeholder={`${formatPriceLabel(markerForm.listingType)} amount`}
              className="h-10 bg-white"
            />
            <Input
              value={markerForm.depositAmount}
              onChange={(event) => setMarkerForm((prev) => ({ ...prev, depositAmount: event.target.value }))}
              placeholder="Deposit"
              className="h-10 bg-white"
            />
            <Input
              value={markerForm.maintenanceAmount}
              onChange={(event) =>
                setMarkerForm((prev) => ({ ...prev, maintenanceAmount: event.target.value }))
              }
              placeholder="Maintenance"
              className="h-10 bg-white"
            />
            <select
              value={markerForm.status}
              onChange={(event) => setMarkerForm((prev) => ({ ...prev, status: event.target.value as UnitStatus }))}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <Input
              value={markerForm.occupiedByUserId}
              onChange={(event) =>
                setMarkerForm((prev) => ({ ...prev, occupiedByUserId: event.target.value.replace(/[^\d]/g, '') }))
              }
              placeholder="Tenant user id (required if occupied)"
              className="h-10 bg-white"
            />
          </div>

          <Input
            value={markerForm.notes}
            onChange={(event) => setMarkerForm((prev) => ({ ...prev, notes: event.target.value }))}
            placeholder="Notes"
            className="h-10 bg-white"
          />

          <div className="max-h-40 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Amenities</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {amenities.map((amenity) => (
                <label
                  key={amenity.id}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={markerForm.amenityIds.includes(amenity.id)}
                    onChange={() => toggleAmenity(amenity.id)}
                    className="h-4 w-4 accent-blue-700"
                  />
                  <span>{amenity.name}</span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkerDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveMarkerUnit()} disabled={savingMarkerUnit}>
              {savingMarkerUnit ? 'Saving...' : 'Save Unit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LayoutUnitsShell>
  );
}
