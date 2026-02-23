import { useState } from 'react';
import { Building2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BuildingType, CreateBuildingPayload } from '@/lib/apartmentComplexApi';

interface CreateBuildingProps {
  submitting: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (payload: CreateBuildingPayload) => Promise<void>;
}

export default function CreateBuilding({ submitting, error, onCancel, onSubmit }: CreateBuildingProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<BuildingType>('residential');
  const [floorCount, setFloorCount] = useState('');
  const [roomsPerFloor, setRoomsPerFloor] = useState('');
  const [defaultRent, setDefaultRent] = useState('');
  const [defaultDueDate, setDefaultDueDate] = useState('');
  const [localError, setLocalError] = useState('');

  const submit = async () => {
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    const parsedFloorCount = Number(floorCount);
    const parsedRoomsPerFloor = Number(roomsPerFloor);
    const parsedDefaultRent = Number(defaultRent);

    if (!trimmedName) {
      setLocalError('Building name is required.');
      return;
    }
    if (!trimmedAddress) {
      setLocalError('Address is required.');
      return;
    }
    if (!Number.isInteger(parsedFloorCount) || parsedFloorCount <= 0) {
      setLocalError('Floor count must be greater than 0.');
      return;
    }
    if (!Number.isInteger(parsedRoomsPerFloor) || parsedRoomsPerFloor <= 0) {
      setLocalError('Rooms per floor must be greater than 0.');
      return;
    }
    if (!Number.isFinite(parsedDefaultRent) || parsedDefaultRent <= 0) {
      setLocalError('Default rent must be greater than 0.');
      return;
    }

    setLocalError('');
    await onSubmit({
      name: trimmedName,
      address: trimmedAddress,
      type,
      roomCount: parsedFloorCount * parsedRoomsPerFloor,
      floorCount: parsedFloorCount,
      roomsPerFloor: parsedRoomsPerFloor,
      defaultRent: parsedDefaultRent,
      defaultDueDate: defaultDueDate || null,
    });
  };

  const totalRooms = Number(floorCount || 0) * Number(roomsPerFloor || 0);
  const parsedRentPreview = Number(defaultRent || 0);
  const estimatedMonthlyRevenue = totalRooms > 0 && parsedRentPreview > 0 ? totalRooms * parsedRentPreview : 0;

  return (
    <div className="space-y-4">
      <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Building / Complex</h2>
            <p className="mt-1 text-sm text-slate-600">
              Create a building and auto-generate one room card per room.
            </p>
          </div>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Building2 className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5 md:col-span-1">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                  Building Name
                </span>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Sunrise Residency"
                  className="h-11 bg-white"
                />
              </label>

              <label className="space-y-1.5 md:col-span-1">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                  Building Type
                </span>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as BuildingType)}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>

              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                  Address
                </span>
                <Input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Street, area, city"
                  className="h-11 bg-white"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                  Number Of Floors
                </span>
                <Input
                  type="number"
                  min={1}
                  value={floorCount}
                  onChange={(event) => setFloorCount(event.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="5"
                  className="h-11 bg-white"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                  Rooms Per Floor
                </span>
                <Input
                  type="number"
                  min={1}
                  value={roomsPerFloor}
                  onChange={(event) => setRoomsPerFloor(event.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="12"
                  className="h-11 bg-white"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                  Default Monthly Rent (per room)
                </span>
                <Input
                  type="number"
                  min={1}
                  value={defaultRent}
                  onChange={(event) => setDefaultRent(event.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="15000"
                  className="h-11 bg-white"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                  Default Due Date (Optional)
                </span>
                <Input
                  type="date"
                  value={defaultDueDate}
                  onChange={(event) => setDefaultDueDate(event.target.value)}
                  className="h-11 bg-white"
                />
              </label>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Rooms are auto-generated floor-wise as <span className="font-semibold text-slate-800">F1-R1, F1-R2...</span>
              {' '}
              and can be renamed later.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Preview</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Floors</span>
                <span className="font-semibold text-slate-900">{floorCount || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Rooms/Floor</span>
                <span className="font-semibold text-slate-900">{roomsPerFloor || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Total Rooms</span>
                <span className="font-semibold text-slate-900">{totalRooms || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Default Rent</span>
                <span className="font-semibold text-slate-900">Rs {parsedRentPreview.toLocaleString() || 0}</span>
              </div>
              <div className="border-t border-slate-200 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700">Estimated Full Collection</span>
                  <span className="font-semibold text-emerald-700">
                    Rs {estimatedMonthlyRevenue.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {(localError || error) && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {localError || error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {submitting ? 'Creating...' : 'Create Building'}
          </Button>
        </div>
      </div>
    </div>
  );
}
