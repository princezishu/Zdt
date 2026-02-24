import { useEffect, useMemo, useState } from 'react';
import { BellRing, History, LayoutGrid, PlusSquare, RefreshCcw, Shuffle, Table2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  deleteApartmentRoom,
  deleteApartmentRoomsBulk,
  generateBuildingRooms,
  getApartmentBuildingDetails,
  sendApartmentRentAlert,
  markRoomPaid,
  markRoomUnpaid,
  updateApartmentBuildingSold,
  updateApartmentRoom,
  type BuildingSummary,
  type PaymentMethod,
  type UpdateRoomPayload,
  type RoomRecord,
} from '@/lib/apartmentComplexApi';
import RoomHistoryModal from './RoomHistoryModal';

interface BuildingDetailsProps {
  token: string;
  buildingId: string;
  availableBuildings: BuildingSummary[];
  onSelectBuilding: (buildingId: string) => void;
  onBack: () => void;
  onBuildingUpdated: () => Promise<void> | void;
}

interface RoomDraft {
  roomLabel: string;
  rentAmount: string;
  tenantName: string;
  tenantPhone: string;
  tenantJoinedOn: string;
  dueDate: string;
  paidDate: string;
  amountPaid: string;
  paymentMethod: PaymentMethod;
}

interface PendingAction {
  type: 'paid' | 'unpaid';
  scope: 'room' | 'floor';
  roomId?: string;
  roomLabel?: string;
  floorNumber?: number;
  roomIds: string[];
}

interface PendingDelete {
  scope: 'room' | 'selection';
  roomLabel?: string;
  roomIds: string[];
}

type RoomDraftErrors = {
  roomLabel?: string;
  rentAmount?: string;
  tenantPhone?: string;
  amountPaid?: string;
};

type ViewMode = 'cards' | 'table';

function toDraft(room: RoomRecord): RoomDraft {
  return {
    roomLabel: room.roomLabel || '',
    rentAmount: String(room.rentAmount || ''),
    tenantName: room.tenantName || '',
    tenantPhone: room.tenantPhone || '',
    tenantJoinedOn: room.tenantJoinedOn || '',
    dueDate: room.currentMonthPayment?.dueDate || '',
    paidDate: room.currentMonthPayment?.paidDate || '',
    amountPaid: String(room.currentMonthPayment?.amountPaid ?? room.rentAmount ?? ''),
    paymentMethod: room.currentMonthPayment?.paymentMethod || 'cash',
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateDisplay(value?: string | null): string {
  if (!value) return '-';
  const text = String(value);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text;
}

function getDueDayFromDateValue(value?: string | null): number | null {
  const text = formatDateDisplay(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const day = Number(text.slice(8, 10));
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function parseMonthKey(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getNextMonthKey(value: string): string {
  const parts = parseMonthKey(value);
  if (!parts) return todayIso().slice(0, 7);
  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

function resolveDueDateForMonth(monthKey: string, dueDay: number): string | null {
  const parts = parseMonthKey(monthKey);
  if (!parts || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return null;
  const finalDay = Math.min(dueDay, getDaysInMonth(parts.year, parts.month));
  return `${monthKey}-${String(finalDay).padStart(2, '0')}`;
}

function getDueDateForMonth(monthKey: string, dueDate?: string | null, joinedOn?: string | null): string {
  const dueDay = getDueDayFromDateValue(dueDate) || getDueDayFromDateValue(joinedOn);
  if (!dueDay) return '';
  return resolveDueDateForMonth(monthKey, dueDay) || '';
}

function getNextDueDate(monthKey: string, dueDate?: string | null, joinedOn?: string | null): string | null {
  const dueDay = getDueDayFromDateValue(dueDate) || getDueDayFromDateValue(joinedOn);
  if (!dueDay) return null;
  return resolveDueDateForMonth(getNextMonthKey(monthKey), dueDay);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function toTitle(value: string): string {
  if (!value) return '-';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function pickRandomIds(source: string[], count: number): string[] {
  const list = [...source];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, count);
}

function validateRoomDraft(draft: RoomDraft, options?: { requireAmountPaid?: boolean }): RoomDraftErrors {
  const errors: RoomDraftErrors = {};

  if (!draft.roomLabel.trim()) {
    errors.roomLabel = 'Room name/number is required.';
  }

  const rentValue = Number(draft.rentAmount);
  if (!Number.isFinite(rentValue) || rentValue <= 0) {
    errors.rentAmount = 'Rent must be greater than 0.';
  }

  const phone = draft.tenantPhone.trim();
  if (phone && !/^[0-9+()\-\s]{7,20}$/.test(phone)) {
    errors.tenantPhone = 'Enter a valid phone number.';
  }

  const amountRaw = draft.amountPaid.trim();
  const amountValue = Number(amountRaw);
  if (options?.requireAmountPaid) {
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      errors.amountPaid = 'Amount paid must be greater than 0.';
    }
  } else if (amountRaw && (!Number.isFinite(amountValue) || amountValue <= 0)) {
    errors.amountPaid = 'Amount should be greater than 0.';
  }

  return errors;
}

function firstErrorMessage(errors: RoomDraftErrors): string | null {
  if (errors.roomLabel) return errors.roomLabel;
  if (errors.rentAmount) return errors.rentAmount;
  if (errors.tenantPhone) return errors.tenantPhone;
  if (errors.amountPaid) return errors.amountPaid;
  return null;
}

export default function BuildingDetails({
  token,
  buildingId,
  availableBuildings,
  onSelectBuilding,
  onBack,
  onBuildingUpdated,
}: BuildingDetailsProps) {
  const [monthKey, setMonthKey] = useState('');
  const [building, setBuilding] = useState<BuildingSummary | null>(null);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RoomDraft>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'not_applicable'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

  const [loading, setLoading] = useState(true);
  const [savingRoomId, setSavingRoomId] = useState('');
  const [error, setError] = useState('');

  const [generateCount, setGenerateCount] = useState('');
  const [generateFloorNumber, setGenerateFloorNumber] = useState('');
  const [generateRent, setGenerateRent] = useState('');
  const [generating, setGenerating] = useState(false);

  const [historyRoom, setHistoryRoom] = useState<RoomRecord | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingSold, setUpdatingSold] = useState(false);
  const [sendingAlerts, setSendingAlerts] = useState(false);
  const [activeFloorNumber, setActiveFloorNumber] = useState<number | null>(null);
  const [selectedExplorerRoomId, setSelectedExplorerRoomId] = useState<string | null>(null);
  const isBuildingSold = Boolean(building?.isSold);

  const loadBuilding = async (targetMonth?: string) => {
    try {
      setLoading(true);
      setError('');
      const response = await getApartmentBuildingDetails(buildingId, token, targetMonth);
      setMonthKey(response.monthKey);
      setBuilding(response.building || null);
      setRooms(Array.isArray(response.rooms) ? response.rooms : []);

      const nextDrafts: Record<string, RoomDraft> = {};
      (response.rooms || []).forEach((room) => {
        nextDrafts[room.id] = toDraft(room);
      });
      setDrafts(nextDrafts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load building details.');
      setBuilding(null);
      setRooms([]);
      setDrafts({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !buildingId) return;
    void loadBuilding();
  }, [token, buildingId]);

  const filteredRooms = useMemo(() => {
    const text = search.trim().toLowerCase();
    return rooms.filter((room) => {
      const status = room.currentMonthPayment?.status || 'not_applicable';
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!text) return true;
      return [room.roomLabel, room.tenantName, room.tenantPhone].join(' ').toLowerCase().includes(text);
    });
  }, [rooms, search, statusFilter]);

  const filteredRoomIds = useMemo(() => filteredRooms.map((room) => room.id), [filteredRooms]);
  const selectedCount = selectedRoomIds.length;
  const allFilteredSelected =
    filteredRoomIds.length > 0 && filteredRoomIds.every((roomId) => selectedRoomIds.includes(roomId));

  const groupedFilteredRooms = useMemo(() => {
    const grouped = new Map<number, RoomRecord[]>();
    filteredRooms.forEach((room) => {
      const floor = Number(room.floorNumber || 1);
      const floorRooms = grouped.get(floor) || [];
      floorRooms.push(room);
      grouped.set(floor, floorRooms);
    });
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  }, [filteredRooms]);

  const filteredPaidCount = filteredRooms.filter((room) => room.currentMonthPayment?.status === 'paid').length;
  const filteredPendingCount = filteredRooms.filter((room) => room.currentMonthPayment?.status === 'unpaid').length;
  const filteredNotApplicableCount = filteredRooms.filter(
    (room) => room.currentMonthPayment?.status === 'not_applicable'
  ).length;

  const explorerFloorSummaries = useMemo(() => {
    const grouped = new Map<number, RoomRecord[]>();
    filteredRooms.forEach((room) => {
      const floor = Number(room.floorNumber || 1);
      const floorRooms = grouped.get(floor) || [];
      floorRooms.push(room);
      grouped.set(floor, floorRooms);
    });
    return Array.from(grouped.entries())
      .map(([floorNumber, floorRooms]) => {
        const occupiedCount = floorRooms.filter((room) => {
          const draft = drafts[room.id] || toDraft(room);
          return Boolean(draft.tenantName.trim() || draft.tenantPhone.trim());
        }).length;
        const availableCount = floorRooms.length - occupiedCount;
        return {
          floorNumber,
          rooms: floorRooms,
          totalUnits: floorRooms.length,
          occupiedCount,
          availableCount,
        };
      })
      .sort((a, b) => b.floorNumber - a.floorNumber);
  }, [drafts, filteredRooms]);

  const activeFloorRooms = useMemo(
    () => explorerFloorSummaries.find((item) => item.floorNumber === activeFloorNumber)?.rooms || [],
    [activeFloorNumber, explorerFloorSummaries]
  );

  const selectedExplorerRoom = useMemo(
    () =>
      (selectedExplorerRoomId
        ? rooms.find((room) => room.id === selectedExplorerRoomId) || null
        : null),
    [rooms, selectedExplorerRoomId]
  );

  const selectedExplorerDraft = useMemo(
    () => (selectedExplorerRoom ? drafts[selectedExplorerRoom.id] || toDraft(selectedExplorerRoom) : null),
    [drafts, selectedExplorerRoom]
  );

  const selectedExplorerStatus = useMemo(() => {
    if (!selectedExplorerRoom || !selectedExplorerDraft) return null;
    return Boolean(selectedExplorerDraft.tenantName.trim() || selectedExplorerDraft.tenantPhone.trim())
      ? 'occupied'
      : 'available';
  }, [selectedExplorerDraft, selectedExplorerRoom]);

  useEffect(() => {
    const existingIds = new Set(rooms.map((room) => room.id));
    setSelectedRoomIds((prev) => prev.filter((roomId) => existingIds.has(roomId)));
  }, [rooms]);

  useEffect(() => {
    if (explorerFloorSummaries.length === 0) {
      setActiveFloorNumber(null);
      return;
    }
    setActiveFloorNumber((current) => {
      if (current && explorerFloorSummaries.some((floor) => floor.floorNumber === current)) {
        return current;
      }
      return explorerFloorSummaries[0].floorNumber;
    });
  }, [explorerFloorSummaries]);

  useEffect(() => {
    if (activeFloorRooms.length === 0) {
      setSelectedExplorerRoomId(null);
      return;
    }
    setSelectedExplorerRoomId((current) => {
      if (current && activeFloorRooms.some((room) => room.id === current)) {
        return current;
      }
      return activeFloorRooms[0].id;
    });
  }, [activeFloorRooms]);

  const toggleRoomSelection = (roomId: string, checked: boolean) => {
    setSelectedRoomIds((prev) => {
      if (checked) {
        return uniqueIds([...prev, roomId]);
      }
      return prev.filter((id) => id !== roomId);
    });
  };

  const selectAllFilteredRooms = () => {
    setSelectedRoomIds((prev) => uniqueIds([...prev, ...filteredRoomIds]));
  };

  const clearFilteredSelection = () => {
    const filteredSet = new Set(filteredRoomIds);
    setSelectedRoomIds((prev) => prev.filter((id) => !filteredSet.has(id)));
  };

  const clearAllSelection = () => {
    setSelectedRoomIds([]);
  };

  const selectRandomRooms = () => {
    if (filteredRoomIds.length === 0) {
      toast.error('No rooms available in current filter.');
      return;
    }

    const suggested = Math.min(5, filteredRoomIds.length);
    const input = window.prompt(
      `How many random rooms do you want to select? (1-${filteredRoomIds.length})`,
      String(suggested)
    );
    if (input === null) return;

    const count = Number(input.trim());
    if (!Number.isInteger(count) || count <= 0 || count > filteredRoomIds.length) {
      toast.error(`Enter a whole number between 1 and ${filteredRoomIds.length}.`);
      return;
    }

    const randomIds = pickRandomIds(filteredRoomIds, count);
    setSelectedRoomIds((prev) => uniqueIds([...prev, ...randomIds]));
    toast.success(`${randomIds.length} random room(s) selected.`);
  };

  const updateDraft = (roomId: string, patch: Partial<RoomDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [roomId]: (() => {
        const room = rooms.find((item) => item.id === roomId);
        const baseDraft: RoomDraft =
          prev[roomId] ||
          (room
            ? toDraft(room)
            : {
                roomLabel: '',
                rentAmount: '',
                tenantName: '',
                tenantPhone: '',
                tenantJoinedOn: '',
                dueDate: '',
                paidDate: '',
                amountPaid: '',
                paymentMethod: 'cash' as PaymentMethod,
              });

        const nextDraft: RoomDraft = {
          ...baseDraft,
          ...patch,
        };

        const hasTenantInfo = Boolean(
          nextDraft.tenantName.trim() || nextDraft.tenantPhone.trim()
        );
        if (!baseDraft.tenantJoinedOn && !nextDraft.tenantJoinedOn && hasTenantInfo) {
          nextDraft.tenantJoinedOn = todayIso();
        }
        if (!hasTenantInfo && !room?.tenantJoinedOn) {
          nextDraft.tenantJoinedOn = '';
        }

        return nextDraft;
      })(),
    }));
  };

  const saveRoom = async (room: RoomRecord) => {
    if (isBuildingSold) {
      toast.error('Building is marked as sold. Room updates are locked.');
      return;
    }
    const draft = drafts[room.id] || toDraft(room);
    const normalizedRoomLabel = draft.roomLabel.trim() || room.roomLabel;
    const parsedRent = Number(draft.rentAmount);
    const fallbackRent = Number(room.rentAmount || 0);
    const normalizedRentAmount =
      Number.isFinite(parsedRent) && parsedRent > 0
        ? parsedRent
        : Number.isFinite(fallbackRent) && fallbackRent > 0
          ? fallbackRent
          : 0;
    const normalizedDraft: RoomDraft = {
      ...draft,
      roomLabel: normalizedRoomLabel,
      rentAmount: normalizedRentAmount > 0 ? String(normalizedRentAmount) : '',
    };
    const validation = validateRoomDraft(normalizedDraft);
    const errorMessage = firstErrorMessage(validation);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }
    const rentAmount = Number(normalizedDraft.rentAmount);

    try {
      setSavingRoomId(room.id);
      const hasTenantInfo = Boolean(
        normalizedDraft.tenantName.trim() || normalizedDraft.tenantPhone.trim()
      );
      const roomPayload: UpdateRoomPayload = {
        roomLabel: normalizedDraft.roomLabel.trim(),
        rentAmount,
        tenantName: normalizedDraft.tenantName.trim(),
        tenantPhone: normalizedDraft.tenantPhone.trim(),
      };
      if (room.tenantJoinedOn) {
        roomPayload.tenantJoinedOn = room.tenantJoinedOn;
      } else if (hasTenantInfo && normalizedDraft.tenantJoinedOn) {
        roomPayload.tenantJoinedOn = normalizedDraft.tenantJoinedOn;
      }
      await updateApartmentRoom(
        room.id,
        roomPayload,
        token
      );
      toast.success(`${normalizedDraft.roomLabel} updated.`);
      await loadBuilding();
      await onBuildingUpdated();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Unable to update room.');
    } finally {
      setSavingRoomId('');
    }
  };

  const resetTenantDraft = (room: RoomRecord) => {
    const confirmed = window.confirm(
      `Reset tenant details for ${room.roomLabel}? You can enter fresh details and save again.`
    );
    if (!confirmed) return;
    updateDraft(room.id, {
      tenantName: '',
      tenantPhone: '',
      tenantJoinedOn: '',
    });
    toast.success(`Tenant details reset for ${room.roomLabel}.`);
  };

  const runPendingAction = async () => {
    if (!pendingAction) return;
    if (isBuildingSold) {
      toast.error('Building is marked as sold. Room updates are locked.');
      setPendingAction(null);
      return;
    }

    const targetRooms = rooms.filter((item) => pendingAction.roomIds.includes(item.id));
    if (targetRooms.length === 0) {
      setPendingAction(null);
      return;
    }

    const activeMonth = monthKey || todayIso().slice(0, 7);

    try {
      setConfirming(true);
      let successCount = 0;
      let failedCount = 0;
      let firstFailureMessage = '';
      let firstSuccessNextDueDate = '';

      for (const room of targetRooms) {
        const draft = drafts[room.id] || toDraft(room);

        try {
          if (pendingAction.type === 'paid') {
            const paymentValidation = validateRoomDraft(draft, { requireAmountPaid: true });
            if (paymentValidation.amountPaid) {
              throw new Error(`${room.roomLabel}: ${paymentValidation.amountPaid}`);
            }

            const amountPaid = Number(draft.amountPaid);
            const paidResponse = await markRoomPaid(
              room.id,
              {
                monthKey: activeMonth,
                amountPaid,
                paymentMethod: draft.paymentMethod,
              },
              token
            );
            if (!firstSuccessNextDueDate) {
              const nextDueDate = getNextDueDate(
                activeMonth,
                paidResponse.payment?.dueDate || room.currentMonthPayment?.dueDate || draft.dueDate,
                room.tenantJoinedOn || draft.tenantJoinedOn
              );
              firstSuccessNextDueDate = nextDueDate || '';
            }
          } else {
            await markRoomUnpaid(
              room.id,
              {
                monthKey: activeMonth,
              },
              token
            );
          }

          successCount += 1;
        } catch (roomError) {
          failedCount += 1;
          if (!firstFailureMessage) {
            firstFailureMessage =
              roomError instanceof Error ? roomError.message : `Failed for ${room.roomLabel}`;
          }
        }
      }

      if (failedCount === 0) {
        if (pendingAction.scope === 'floor') {
          if (pendingAction.type === 'paid') {
            toast.success(
              `Updated ${successCount} room(s) on floor ${pendingAction.floorNumber} as paid. Next month dues were auto-created.`
            );
          } else {
            toast.success(
              `Updated ${successCount} room(s) on floor ${pendingAction.floorNumber} as ${pendingAction.type}.`
            );
          }
        } else {
          const label = targetRooms[0]?.roomLabel || 'Room';
          if (pendingAction.type === 'paid') {
            toast.success(
              firstSuccessNextDueDate
                ? `${label} marked as paid. Next due date: ${firstSuccessNextDueDate}.`
                : `${label} marked as paid. Next month due date is auto-set.`
            );
          } else {
            toast.success(`${label} marked as ${pendingAction.type}.`);
          }
        }
      } else {
        if (successCount > 0) {
          toast.success(`Updated ${successCount} room(s) successfully.`);
        }
        toast.error(`${failedCount} room(s) failed. ${firstFailureMessage}`);
      }

      setPendingAction(null);
      const shouldJumpToNextMonth = pendingAction.type === 'paid' && successCount > 0;
      const nextMonthToLoad = shouldJumpToNextMonth ? getNextMonthKey(activeMonth) : undefined;
      await loadBuilding(nextMonthToLoad);
      await onBuildingUpdated();
    } catch (actionError) {
      toast.error(actionError instanceof Error ? actionError.message : 'Unable to update rent status.');
    } finally {
      setConfirming(false);
    }
  };

  const runPendingDelete = async () => {
    if (!pendingDelete || pendingDelete.roomIds.length === 0) {
      setPendingDelete(null);
      return;
    }
    if (isBuildingSold) {
      toast.error('Building is marked as sold. Room updates are locked.');
      setPendingDelete(null);
      return;
    }

    try {
      setDeleting(true);
      if (pendingDelete.roomIds.length === 1) {
        await deleteApartmentRoom(pendingDelete.roomIds[0], token);
      } else {
        await deleteApartmentRoomsBulk(pendingDelete.roomIds, token);
      }

      const deletedCount = pendingDelete.roomIds.length;
      toast.success(`${deletedCount} room(s) deleted successfully.`);
      setPendingDelete(null);
      setSelectedRoomIds((prev) => prev.filter((id) => !pendingDelete.roomIds.includes(id)));
      await loadBuilding();
      await onBuildingUpdated();
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Unable to delete room(s).');
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerateRooms = async () => {
    if (isBuildingSold) {
      toast.error('Building is marked as sold. Room updates are locked.');
      return;
    }
    const count = Number(generateCount);
    const floorNumber = Number(generateFloorNumber);
    const defaultRent = Number(generateRent);

    if (!Number.isInteger(count) || count <= 0) return toast.error('Room count must be greater than 0.');
    if (!Number.isInteger(floorNumber) || floorNumber <= 0) return toast.error('Floor number must be greater than 0.');
    if (!Number.isFinite(defaultRent) || defaultRent <= 0) return toast.error('Default rent must be greater than 0.');

    try {
      setGenerating(true);
      await generateBuildingRooms(
        buildingId,
        {
          count,
          floorNumber,
          defaultRent,
        },
        token
      );
      setGenerateCount('');
      toast.success(`${count} room(s) generated on floor ${floorNumber}.`);
      await loadBuilding();
      await onBuildingUpdated();
    } catch (generateError) {
      toast.error(generateError instanceof Error ? generateError.message : 'Unable to generate rooms.');
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleSold = async () => {
    if (!building) return;

    const nextSold = !building.isSold;
    let soldNote: string | null = null;

    if (nextSold) {
      const input = window.prompt(
        'Optional sold note (e.g. buyer name, closing date):',
        building.soldNote || ''
      );
      soldNote = input === null ? building.soldNote || null : input.trim() || null;
    }

    try {
      setUpdatingSold(true);
      await updateApartmentBuildingSold(
        buildingId,
        {
          isSold: nextSold,
          soldNote,
        },
        token
      );
      toast.success(nextSold ? 'Building marked as sold.' : 'Sold mark removed.');
      await loadBuilding();
      await onBuildingUpdated();
    } catch (soldError) {
      toast.error(soldError instanceof Error ? soldError.message : 'Unable to update sold status.');
    } finally {
      setUpdatingSold(false);
    }
  };

  const handleSendRentAlert = async () => {
    const defaultMessage = `Rent alert from {app}: Please pay rent for {month} by {dueDate}. If not paid on time, penalty will be added.`;
    const input = window.prompt(
      'Enter SMS message. You can use {app}, {month}, {room}, {tenant}, {dueDate}, {amount}, {penalty}:',
      defaultMessage
    );
    if (input === null) return;

    const message = input.trim();
    if (!message) {
      toast.error('SMS message is required.');
      return;
    }

    try {
      setSendingAlerts(true);
      const response = await sendApartmentRentAlert(
        buildingId,
        {
          monthKey: monthKey || undefined,
          message,
          includeOnlyUnpaid: true,
        },
        token
      );
      if (response.failedCount > 0) {
        toast.warning(
          `SMS sent to ${response.deliveredCount} room(s), failed for ${response.failedCount} room(s).`
        );
      } else {
        toast.success(`SMS sent to ${response.deliveredCount} room(s).`);
      }
    } catch (alertError) {
      toast.error(alertError instanceof Error ? alertError.message : 'Unable to send SMS alerts.');
    } finally {
      setSendingAlerts(false);
    }
  };

  const selectedExplorerOwner =
    selectedExplorerDraft && selectedExplorerDraft.tenantName.trim()
      ? selectedExplorerDraft.tenantName.trim()
      : 'Unassigned';
  const selectedExplorerRent = Number(
    selectedExplorerDraft?.rentAmount || selectedExplorerRoom?.rentAmount || 0
  );
  const selectedExplorerJoinedOn = formatDateDisplay(
    selectedExplorerDraft?.tenantJoinedOn || selectedExplorerRoom?.tenantJoinedOn || null
  );
  const selectedExplorerPenalty = Number(
    selectedExplorerRoom?.currentMonthPayment?.penaltyAmount ?? 0
  );
  const selectedExplorerPaidDate = formatDateDisplay(
    selectedExplorerDraft?.paidDate || selectedExplorerRoom?.currentMonthPayment?.paidDate || null
  );
  const selectedExplorerDueDate = formatDateDisplay(
    getDueDateForMonth(
      monthKey || todayIso().slice(0, 7),
      selectedExplorerRoom?.currentMonthPayment?.dueDate || selectedExplorerDraft?.dueDate || null,
      selectedExplorerRoom?.tenantJoinedOn || selectedExplorerDraft?.tenantJoinedOn || null
    )
  );
  const selectedExplorerAmountPaid = Number(
    selectedExplorerDraft?.amountPaid || selectedExplorerRoom?.currentMonthPayment?.amountPaid || 0
  );
  const selectedExplorerNextDueDate = formatDateDisplay(
    getNextDueDate(
      monthKey || todayIso().slice(0, 7),
      selectedExplorerRoom?.currentMonthPayment?.dueDate || selectedExplorerDraft?.dueDate || null,
      selectedExplorerRoom?.tenantJoinedOn || selectedExplorerDraft?.tenantJoinedOn || null
    )
  );

  return (
    <div className="space-y-4">
      <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Property Management</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Building Explorer</h2>
            <p className="mt-1 text-sm text-slate-600">
              Visual overview of buildings, floors, and unit availability
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  isBuildingSold
                    ? 'border-amber-300 bg-amber-100 text-amber-800'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                Status: {isBuildingSold ? 'Sold' : 'Active'}
              </span>
            </div>
            {isBuildingSold ? (
              <p className="mt-1 text-xs font-medium text-amber-700">
                Building marked as sold. Room edits and deletes are locked.
              </p>
            ) : null}
          </div>
          <div className="w-full max-w-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Project</p>
            <select
              value={buildingId}
              onChange={(event) => onSelectBuilding(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            >
              {availableBuildings.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
          <div className="h-[520px] animate-pulse rounded-2xl border border-slate-200 bg-white" />
          <div className="h-[520px] animate-pulse rounded-2xl border border-slate-200 bg-white" />
          <div className="h-[520px] animate-pulse rounded-2xl border border-slate-200 bg-white" />
        </div>
      ) : null}

      {!loading ? (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Buildings</h3>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {availableBuildings.length}
                </span>
              </div>
              <div className="space-y-2">
                {availableBuildings.map((item) => {
                  const isActive = item.id === buildingId;
                  const unitsPerFloor =
                    item.totalFloors > 0
                      ? item.totalRooms % item.totalFloors === 0
                        ? String(item.totalRooms / item.totalFloors)
                        : (item.totalRooms / item.totalFloors).toFixed(1)
                      : '-';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectBuilding(item.id)}
                      className={`w-full rounded-xl border p-3 text-left transition-all duration-200 ${
                        isActive
                          ? 'border-slate-900 bg-slate-100 shadow-sm'
                          : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow-md'
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <span>Floors: {item.totalFloors}</span>
                        <span>Units/Floor: {unitsPerFloor}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Floors</h3>
              {explorerFloorSummaries.length === 0 ? (
                <p className="text-sm text-slate-500">No units found on this floor</p>
              ) : (
                <div className="space-y-2">
                  {explorerFloorSummaries.map((floor) => (
                    <button
                      key={floor.floorNumber}
                      type="button"
                      onClick={() => setActiveFloorNumber(floor.floorNumber)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition-all duration-200 ${
                        floor.floorNumber === activeFloorNumber
                          ? 'border-blue-600 bg-blue-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">Floor {floor.floorNumber}</p>
                        <span className="text-xs text-slate-600">{floor.totalUnits} units</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                          Available {floor.availableCount}
                        </span>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">
                          Occupied {floor.occupiedCount}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Actions</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={onBack}>
                  Back
                </Button>
                <Button variant="outline" onClick={() => void loadBuilding()} disabled={loading}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleSendRentAlert()}
                  disabled={sendingAlerts || rooms.length === 0}
                >
                  <BellRing className="mr-2 h-4 w-4" />
                  Alerts
                </Button>
                <Button
                  variant={building?.isSold ? 'outline' : 'default'}
                  onClick={() => void handleToggleSold()}
                  disabled={updatingSold}
                >
                  {building?.isSold ? 'Remove Sold' : 'Mark Sold'}
                </Button>
              </div>
              <div className="mt-3 grid gap-2">
                <Input
                  type="number"
                  min={1}
                  value={generateFloorNumber}
                  onChange={(event) => setGenerateFloorNumber(event.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Floor number"
                  disabled={isBuildingSold}
                  className="h-10 bg-white"
                />
                <Input
                  type="number"
                  min={1}
                  value={generateCount}
                  onChange={(event) => setGenerateCount(event.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Units to add"
                  disabled={isBuildingSold}
                  className="h-10 bg-white"
                />
                <Input
                  type="number"
                  min={1}
                  value={generateRent}
                  onChange={(event) => setGenerateRent(event.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="Default rent"
                  disabled={isBuildingSold}
                  className="h-10 bg-white"
                />
                <Button onClick={() => void handleGenerateRooms()} disabled={generating || isBuildingSold}>
                  <PlusSquare className="mr-2 h-4 w-4" />
                  {generating ? 'Adding...' : 'Add Units'}
                </Button>
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Unit Availability</h3>
                <p className="text-sm text-slate-600">
                  Floor {activeFloorNumber ?? '-'} | {activeFloorRooms.length} units
                </p>
              </div>
              <div className="grid w-full gap-2 sm:max-w-lg sm:grid-cols-[minmax(0,1fr)_180px]">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search unit / owner / phone"
                  className="h-10 bg-white"
                />
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as 'all' | 'paid' | 'unpaid' | 'not_applicable')
                  }
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">All payment status</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Pending</option>
                  <option value="not_applicable">Not Applicable</option>
                </select>
              </div>
            </div>

            {activeFloorRooms.length === 0 ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
                No units found on this floor
              </div>
            ) : (
              <div
                key={`floor-grid-${activeFloorNumber}`}
                className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 transition-all duration-200"
              >
                {activeFloorRooms.map((room) => {
                  const draft = drafts[room.id] || toDraft(room);
                  const isOccupied = Boolean(draft.tenantName.trim() || draft.tenantPhone.trim());
                  const paymentStatus = room.currentMonthPayment?.status || 'not_applicable';
                  const isActive = room.id === selectedExplorerRoomId;
                  return (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => setSelectedExplorerRoomId(room.id)}
                      className={`rounded-2xl border p-4 text-left transition-all duration-200 ${
                        isOccupied ? 'border-red-200 bg-red-50/80' : 'border-emerald-200 bg-emerald-50/80'
                      } ${
                        isActive
                          ? 'ring-2 ring-blue-600 ring-offset-1 shadow-md'
                          : 'hover:-translate-y-0.5 hover:shadow-md'
                      }`}
                    >
                      <p className="text-xl font-bold text-slate-900">{draft.roomLabel.trim() || room.roomLabel}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs font-semibold">
                        <span className={`h-2.5 w-2.5 rounded-full ${isOccupied ? 'bg-red-600' : 'bg-emerald-600'}`} />
                        <span className={isOccupied ? 'text-red-700' : 'text-emerald-700'}>
                          {isOccupied ? 'Occupied' : 'Available'}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-700">Rent: {formatCurrency(Number(draft.rentAmount || room.rentAmount || 0))}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Payment: {paymentStatus === 'paid' ? 'Paid' : paymentStatus === 'unpaid' ? 'Pending' : 'Not Applicable'}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="self-start rounded-2xl border border-slate-200 bg-white p-5 xl:sticky xl:top-24">
            <h3 className="text-lg font-semibold text-slate-900">Property File</h3>
            {!selectedExplorerRoom || !selectedExplorerDraft ? (
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
                Select a unit to view ownership and payment details.
              </p>
            ) : (
              <>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-3xl font-bold text-slate-900">
                    {selectedExplorerDraft.roomLabel.trim() || selectedExplorerRoom.roomLabel}
                  </p>
                  <Badge
                    className={
                      selectedExplorerStatus === 'occupied'
                        ? 'border-red-200 bg-red-100 text-red-700'
                        : 'border-emerald-200 bg-emerald-100 text-emerald-700'
                    }
                  >
                    {selectedExplorerStatus === 'occupied' ? 'Occupied' : 'Available'}
                  </Badge>
                </div>

                <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-slate-500">Owner name</span>
                    <span className="font-medium text-slate-900">{selectedExplorerOwner}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-slate-500">Rent amount</span>
                    <span className="font-medium text-slate-900">{formatCurrency(selectedExplorerRent)}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-slate-500">Date of join</span>
                    <span className="font-medium text-slate-900">{selectedExplorerJoinedOn}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-slate-500">Late fee</span>
                    <span className="font-medium text-slate-900">{formatCurrency(selectedExplorerPenalty)}</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  <Input
                    value={selectedExplorerDraft.tenantName}
                    onChange={(event) =>
                      selectedExplorerRoom
                        ? updateDraft(selectedExplorerRoom.id, { tenantName: event.target.value })
                        : null
                    }
                    placeholder="Owner / tenant name"
                    className="h-10 bg-white"
                  />
                  <Input
                    value={selectedExplorerDraft.tenantPhone}
                    onChange={(event) =>
                      selectedExplorerRoom
                        ? updateDraft(selectedExplorerRoom.id, { tenantPhone: event.target.value })
                        : null
                    }
                    placeholder="Phone"
                    className="h-10 bg-white"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={selectedExplorerDraft.rentAmount}
                    onChange={(event) =>
                      selectedExplorerRoom
                        ? updateDraft(selectedExplorerRoom.id, {
                            rentAmount: event.target.value.replace(/[^0-9.]/g, ''),
                          })
                        : null
                    }
                    placeholder="Monthly rent"
                    className="h-10 bg-white"
                  />
                  <div className="grid gap-1">
                    <p className="text-xs font-medium text-slate-500">Due date</p>
                    <Input
                      type="date"
                      value={selectedExplorerDueDate === '-' ? '' : selectedExplorerDueDate}
                      readOnly
                      disabled
                      className="h-10 bg-white"
                    />
                    <p className="text-[11px] text-slate-500">
                      Auto: same day every month from join date.
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={selectedExplorerDraft.amountPaid}
                    onChange={(event) =>
                      selectedExplorerRoom
                        ? updateDraft(selectedExplorerRoom.id, {
                            amountPaid: event.target.value.replace(/[^0-9.]/g, ''),
                          })
                        : null
                    }
                    placeholder="Amount paid"
                    className="h-10 bg-white"
                  />
                  <select
                    value={selectedExplorerDraft.paymentMethod}
                    onChange={(event) =>
                      selectedExplorerRoom
                        ? updateDraft(selectedExplorerRoom.id, {
                            paymentMethod: event.target.value as PaymentMethod,
                          })
                        : null
                    }
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank">Bank</option>
                  </select>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <p>Paid Date: {selectedExplorerPaidDate}</p>
                  <p className="mt-1">Amount Paid: {formatCurrency(selectedExplorerAmountPaid)}</p>
                  <p className="mt-1">
                    Next Due Date:{' '}
                    {selectedExplorerRoom?.currentMonthPayment?.status === 'paid'
                      ? selectedExplorerNextDueDate
                      : '-'}
                  </p>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void saveRoom(selectedExplorerRoom)}
                    disabled={savingRoomId === selectedExplorerRoom.id || isBuildingSold}
                  >
                    {savingRoomId === selectedExplorerRoom.id ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resetTenantDraft(selectedExplorerRoom)}
                    disabled={savingRoomId === selectedExplorerRoom.id || isBuildingSold}
                  >
                    Reset Tenant
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      setPendingAction({
                        type: 'paid',
                        scope: 'room',
                        roomId: selectedExplorerRoom.id,
                        roomLabel: selectedExplorerRoom.roomLabel,
                        roomIds: [selectedExplorerRoom.id],
                      })
                    }
                    disabled={
                      confirming ||
                      isBuildingSold ||
                      selectedExplorerRoom.currentMonthPayment?.status === 'not_applicable'
                    }
                  >
                    Mark Paid
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      setPendingAction({
                        type: 'unpaid',
                        scope: 'room',
                        roomId: selectedExplorerRoom.id,
                        roomLabel: selectedExplorerRoom.roomLabel,
                        roomIds: [selectedExplorerRoom.id],
                      })
                    }
                    disabled={
                      confirming ||
                      isBuildingSold ||
                      selectedExplorerRoom.currentMonthPayment?.status === 'not_applicable'
                    }
                  >
                    Mark Unpaid
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setHistoryRoom(selectedExplorerRoom)}>
                    <History className="mr-2 h-4 w-4" />
                    History
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      setPendingDelete({
                        scope: 'room',
                        roomLabel: selectedExplorerRoom.roomLabel,
                        roomIds: [selectedExplorerRoom.id],
                      })
                    }
                    disabled={deleting || isBuildingSold}
                  >
                    Delete
                  </Button>
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}

      <div className="hidden zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Building Dashboard</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{building?.name || 'Building'}</h2>
            <p className="mt-1 text-sm text-slate-600">{building?.address || '-'}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">
                Type: {toTitle(building?.type || '')}
              </span>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                Month: {monthKey || '-'}
              </span>
              {building?.isSold ? (
                <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">
                  Status: Sold
                </span>
              ) : (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                  Status: Active
                </span>
              )}
            </div>
            {building?.isSold && building?.soldNote ? (
              <p className="mt-2 text-xs font-medium text-amber-700">Sold Note: {building.soldNote}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onBack}>
              Back To Buildings
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleSendRentAlert()}
              disabled={sendingAlerts || rooms.length === 0}
            >
              <BellRing className="mr-2 h-4 w-4" />
              {sendingAlerts ? 'Sending SMS...' : 'Send Rent SMS'}
            </Button>
            <Button
              variant={building?.isSold ? 'outline' : 'default'}
              onClick={() => void handleToggleSold()}
              disabled={updatingSold}
            >
              {updatingSold
                ? 'Updating...'
                : building?.isSold
                  ? 'Remove Sold Mark'
                  : 'Mark Building Sold'}
            </Button>
            <Button variant="outline" onClick={() => void loadBuilding()} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Total Floors" value={String(building?.totalFloors ?? 0)} />
          <StatCard label="Total Rooms" value={String(building?.totalRooms ?? 0)} />
          <StatCard label="Paid Rooms" value={String(building?.paidThisMonth ?? 0)} className="border-emerald-200 bg-emerald-50 text-emerald-800" />
          <StatCard label="Pending Rooms" value={String(building?.pendingThisMonth ?? 0)} className="border-red-200 bg-red-50 text-red-800" />
          <StatCard label="Collected" value={formatCurrency(building?.totalCollectedThisMonth ?? 0)} className="border-blue-200 bg-blue-50 text-blue-800" />
          <StatCard label="Pending Amount" value={formatCurrency(building?.totalPendingAmount ?? 0)} className="border-amber-200 bg-amber-50 text-amber-800" />
        </div>
      </div>

      <div className="hidden zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="grid gap-3 md:grid-cols-[1fr_170px]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search room / tenant / phone"
              className="h-11 bg-white"
            />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'all' | 'paid' | 'unpaid' | 'not_applicable')
              }
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Pending</option>
              <option value="not_applicable">Not Applicable</option>
            </select>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setViewMode('cards')}
              className={
                viewMode === 'cards'
                  ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800 hover:text-white'
                  : ''
              }
            >
              <LayoutGrid className="mr-2 h-4 w-4" />
              Cards
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setViewMode('table')}
              className={
                viewMode === 'table'
                  ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800 hover:text-white'
                  : ''
              }
            >
              <Table2 className="mr-2 h-4 w-4" />
              Compact Table
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[110px_120px_140px_auto]">
            <Input
              type="number"
              min={1}
              value={generateFloorNumber}
              onChange={(event) => setGenerateFloorNumber(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Floor"
              disabled={isBuildingSold}
              className="h-11 bg-white"
            />
            <Input
              type="number"
              min={1}
              value={generateCount}
              onChange={(event) => setGenerateCount(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Rooms"
              disabled={isBuildingSold}
              className="h-11 bg-white"
            />
            <Input
              type="number"
              min={1}
              value={generateRent}
              onChange={(event) => setGenerateRent(event.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="Default rent"
              disabled={isBuildingSold}
              className="h-11 bg-white"
            />
            <Button onClick={() => void handleGenerateRooms()} disabled={generating || isBuildingSold}>
              <PlusSquare className="mr-2 h-4 w-4" />
              {generating ? 'Adding...' : 'Add Rooms'}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">
            Filtered Rooms: {filteredRooms.length}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
            Paid: {filteredPaidCount}
          </span>
          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 font-semibold text-red-700">
            Pending: {filteredPendingCount}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
            N/A: {filteredNotApplicableCount}
          </span>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
            Selected: {selectedCount}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={selectAllFilteredRooms}
            disabled={filteredRoomIds.length === 0 || allFilteredSelected}
          >
            Select All
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={selectRandomRooms}
            disabled={filteredRoomIds.length === 0}
          >
            <Shuffle className="mr-2 h-4 w-4" />
            Select Random
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clearFilteredSelection}
            disabled={filteredRoomIds.length === 0}
          >
            Clear Filter Selection
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clearAllSelection}
            disabled={selectedCount === 0}
          >
            Clear All Selection
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() =>
              setPendingDelete({
                scope: 'selection',
                roomIds: selectedRoomIds,
              })
            }
            disabled={selectedCount === 0 || deleting || isBuildingSold}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Selected
          </Button>
        </div>
      </div>

      <div className="hidden">
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p> : null}
      </div>

      <div className="hidden">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`room-skeleton-${index}`} className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : null}
      </div>

      <div className="hidden">
        {!loading && filteredRooms.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No rooms found for the selected filter.</div>
        ) : null}
      </div>

      {!loading ? (
        <div className="hidden space-y-4">
          {groupedFilteredRooms.map(([floorNumber, floorRooms]) => {
            const applicableFloorRooms = floorRooms.filter(
              (room) => room.currentMonthPayment?.status !== 'not_applicable'
            );
            const floorPaid = applicableFloorRooms.filter(
              (room) => room.currentMonthPayment?.status === 'paid'
            ).length;
            const floorPending = applicableFloorRooms.filter(
              (room) => room.currentMonthPayment?.status === 'unpaid'
            ).length;
            const floorNotApplicable = floorRooms.length - applicableFloorRooms.length;
            return (
              <section key={`floor-${floorNumber}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="sticky top-20 z-10 -mx-4 -mt-4 mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
                  <h3 className="text-base font-semibold text-slate-900">Floor {floorNumber}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">
                        Rooms: {floorRooms.length}
                      </span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                        Paid: {floorPaid}
                      </span>
                      <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 font-semibold text-red-700">
                        Pending: {floorPending}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                        N/A: {floorNotApplicable}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPendingAction({
                          type: 'paid',
                          scope: 'floor',
                          floorNumber,
                          roomIds: applicableFloorRooms.map((item) => item.id),
                        })
                      }
                      disabled={confirming || isBuildingSold || applicableFloorRooms.length === 0}
                    >
                      Mark Floor Paid
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setPendingAction({
                          type: 'unpaid',
                          scope: 'floor',
                          floorNumber,
                          roomIds: applicableFloorRooms.map((item) => item.id),
                        })
                      }
                      disabled={confirming || isBuildingSold || applicableFloorRooms.length === 0}
                    >
                      Mark Floor Unpaid
                    </Button>
                  </div>
                </div>

                {viewMode === 'cards' ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {floorRooms.map((room) => {
                      const draft = drafts[room.id] || toDraft(room);
                      const fieldErrors = validateRoomDraft(draft);
                      const status = room.currentMonthPayment?.status || 'not_applicable';
                      const autoDueDate = getDueDateForMonth(
                        monthKey || todayIso().slice(0, 7),
                        room.currentMonthPayment?.dueDate || draft.dueDate || null,
                        room.tenantJoinedOn || draft.tenantJoinedOn || null
                      );
                      const isNotApplicable = status === 'not_applicable';
                      const hasTenant = Boolean((draft.tenantName || '').trim() || (draft.tenantPhone || '').trim());
                      const penaltyAmount = Number(room.currentMonthPayment?.penaltyAmount ?? 0);
                      const dueAmount = status === 'unpaid'
                        ? Math.max(
                            Number(draft.rentAmount || room.rentAmount || 0) +
                              penaltyAmount -
                              Number(room.currentMonthPayment?.amountPaid ?? 0),
                            0
                          )
                        : 0;
                      const cardToneClass =
                        status === 'paid'
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : status === 'unpaid'
                            ? 'border-red-200 bg-red-50/40'
                            : 'border-slate-200 bg-slate-50';

                      return (
                        <article
                          key={room.id}
                          className={`rounded-2xl border p-4 shadow-sm ${cardToneClass}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 space-y-2">
                              <Input
                                value={draft.roomLabel}
                                onChange={(event) => updateDraft(room.id, { roomLabel: event.target.value })}
                                placeholder="Room name/number"
                                className={`h-10 bg-white ${fieldErrors.roomLabel ? 'border-red-300' : ''}`}
                              />
                              {fieldErrors.roomLabel ? (
                                <p className="text-[11px] font-medium text-red-600">{fieldErrors.roomLabel}</p>
                              ) : null}

                              <Input
                                type="number"
                                min={1}
                                value={draft.rentAmount}
                                onChange={(event) =>
                                  updateDraft(room.id, {
                                    rentAmount: event.target.value.replace(/[^0-9.]/g, ''),
                                  })
                                }
                                placeholder="Monthly rent"
                                className={`h-10 bg-white ${fieldErrors.rentAmount ? 'border-red-300' : ''}`}
                              />
                              {fieldErrors.rentAmount ? (
                                <p className="text-[11px] font-medium text-red-600">{fieldErrors.rentAmount}</p>
                              ) : null}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Badge
                                className={
                                  status === 'paid'
                                    ? 'bg-emerald-600 text-white'
                                    : status === 'unpaid'
                                      ? 'bg-red-600 text-white'
                                      : 'bg-slate-600 text-white'
                                }
                              >
                                {status === 'paid'
                                  ? 'Paid'
                                  : status === 'unpaid'
                                    ? 'Pending'
                                    : 'Not Applicable'}
                              </Badge>
                              <Badge
                                className={
                                  hasTenant
                                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border border-red-200 bg-red-50 text-red-700'
                                }
                              >
                                {hasTenant ? 'Occupied' : 'Available'}
                              </Badge>
                              <label className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={selectedRoomIds.includes(room.id)}
                                  onChange={(event) => toggleRoomSelection(room.id, event.target.checked)}
                                />
                                Select
                              </label>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2">
                            <Input
                              value={draft.tenantName}
                              onChange={(event) => updateDraft(room.id, { tenantName: event.target.value })}
                              placeholder="Tenant name (optional)"
                              className="h-10 bg-white"
                            />
                            <Input
                              value={draft.tenantPhone}
                              onChange={(event) => updateDraft(room.id, { tenantPhone: event.target.value })}
                              placeholder="Tenant phone (optional)"
                              className={`h-10 bg-white ${fieldErrors.tenantPhone ? 'border-red-300' : ''}`}
                            />
                            <Input
                              type="date"
                              value={draft.tenantJoinedOn}
                              onChange={(event) => updateDraft(room.id, { tenantJoinedOn: event.target.value })}
                              disabled={Boolean(room.tenantJoinedOn)}
                              className="h-10 bg-white"
                            />
                            {room.tenantJoinedOn ? (
                              <p className="text-[11px] font-medium text-slate-500">
                                Join date locked: {room.tenantJoinedOn}. It can only be set once.
                              </p>
                            ) : null}
                            {fieldErrors.tenantPhone ? (
                              <p className="text-[11px] font-medium text-red-600">{fieldErrors.tenantPhone}</p>
                            ) : null}
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <Input
                              type="date"
                              value={autoDueDate}
                              readOnly
                              disabled
                              className="h-10 bg-white"
                            />
                            <Input
                              type="date"
                              value={draft.paidDate}
                              onChange={(event) => updateDraft(room.id, { paidDate: event.target.value })}
                              className="h-10 bg-white"
                            />
                            <Input
                              type="number"
                              min={1}
                              value={draft.amountPaid}
                              onChange={(event) =>
                                updateDraft(room.id, {
                                  amountPaid: event.target.value.replace(/[^0-9.]/g, ''),
                                })
                              }
                              placeholder="Amount paid"
                              className={`h-10 bg-white ${fieldErrors.amountPaid ? 'border-red-300' : ''}`}
                            />
                            <select
                              value={draft.paymentMethod}
                              onChange={(event) =>
                                updateDraft(room.id, { paymentMethod: event.target.value as PaymentMethod })
                              }
                              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                            >
                              <option value="cash">Cash</option>
                              <option value="upi">UPI</option>
                              <option value="bank">Bank</option>
                            </select>
                          </div>
                          {fieldErrors.amountPaid ? (
                            <p className="mt-2 text-[11px] font-medium text-red-600">{fieldErrors.amountPaid}</p>
                          ) : null}

                          <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                            {isNotApplicable ? (
                              <div className="font-medium text-slate-600">
                                Rent tracking will start from the tenant joined date.
                              </div>
                            ) : (
                              <>
                                Due: {room.currentMonthPayment?.dueDate || '-'} | Paid:{' '}
                                {room.currentMonthPayment?.paidDate || '-'}
                                {penaltyAmount > 0 ? (
                                  <div className="mt-1 text-amber-700">Penalty: {formatCurrency(penaltyAmount)}</div>
                                ) : null}
                                <div
                                  className={`mt-1 font-semibold ${
                                    dueAmount > 0 ? 'text-red-700' : 'text-emerald-700'
                                  }`}
                                >
                                  {dueAmount > 0 ? `Pending: ${formatCurrency(dueAmount)}` : 'No pending amount'}
                                </div>
                              </>
                            )}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void saveRoom(room)}
                                disabled={savingRoomId === room.id || isBuildingSold}
                              >
                                {savingRoomId === room.id ? 'Saving...' : 'Save'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => resetTenantDraft(room)}
                                disabled={savingRoomId === room.id || isBuildingSold}
                              >
                                Reset Tenant
                              </Button>
                            <Button
                              size="sm"
                              onClick={() =>
                                setPendingAction({
                                  type: 'paid',
                                  scope: 'room',
                                  roomId: room.id,
                                  roomLabel: room.roomLabel,
                                  roomIds: [room.id],
                                })
                              }
                              disabled={confirming || isBuildingSold || isNotApplicable}
                            >
                              Mark Paid
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                setPendingAction({
                                  type: 'unpaid',
                                  scope: 'room',
                                  roomId: room.id,
                                  roomLabel: room.roomLabel,
                                  roomIds: [room.id],
                                })
                              }
                              disabled={confirming || isBuildingSold || isNotApplicable}
                            >
                              Mark Unpaid
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setHistoryRoom(room)}>
                              <History className="mr-2 h-4 w-4" />
                              View History
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                setPendingDelete({
                                  scope: 'room',
                                  roomLabel: room.roomLabel,
                                  roomIds: [room.id],
                                })
                              }
                              disabled={deleting || isBuildingSold}
                            >
                              Delete
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <Table className="min-w-[1240px]">
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead className="w-[70px]">Select</TableHead>
                          <TableHead>Room</TableHead>
                          <TableHead>Rent</TableHead>
                          <TableHead>Tenant</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Joined On</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Paid Date</TableHead>
                          <TableHead>Paid Amount</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {floorRooms.map((room) => {
                          const draft = drafts[room.id] || toDraft(room);
                          const fieldErrors = validateRoomDraft(draft);
                          const status = room.currentMonthPayment?.status || 'not_applicable';
                          const autoDueDate = getDueDateForMonth(
                            monthKey || todayIso().slice(0, 7),
                            room.currentMonthPayment?.dueDate || draft.dueDate || null,
                            room.tenantJoinedOn || draft.tenantJoinedOn || null
                          );
                          const isNotApplicable = status === 'not_applicable';
                          const hasTenant = Boolean((draft.tenantName || '').trim() || (draft.tenantPhone || '').trim());
                          const penaltyAmount = Number(room.currentMonthPayment?.penaltyAmount ?? 0);
                          return (
                            <TableRow key={room.id}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={selectedRoomIds.includes(room.id)}
                                  onChange={(event) => toggleRoomSelection(room.id, event.target.checked)}
                                />
                              </TableCell>
                              <TableCell className="max-w-[180px]">
                                <Input
                                  value={draft.roomLabel}
                                  onChange={(event) => updateDraft(room.id, { roomLabel: event.target.value })}
                                  className={`h-9 bg-white text-sm ${fieldErrors.roomLabel ? 'border-red-300' : ''}`}
                                />
                                {fieldErrors.roomLabel ? (
                                  <p className="mt-1 text-[11px] font-medium text-red-600">{fieldErrors.roomLabel}</p>
                                ) : null}
                              </TableCell>
                              <TableCell className="max-w-[130px]">
                                <Input
                                  type="number"
                                  min={1}
                                  value={draft.rentAmount}
                                  onChange={(event) =>
                                    updateDraft(room.id, { rentAmount: event.target.value.replace(/[^0-9.]/g, '') })
                                  }
                                  className={`h-9 bg-white text-sm ${fieldErrors.rentAmount ? 'border-red-300' : ''}`}
                                />
                                {fieldErrors.rentAmount ? (
                                  <p className="mt-1 text-[11px] font-medium text-red-600">{fieldErrors.rentAmount}</p>
                                ) : null}
                              </TableCell>
                              <TableCell className="max-w-[150px]">
                                <Input
                                  value={draft.tenantName}
                                  onChange={(event) => updateDraft(room.id, { tenantName: event.target.value })}
                                  className="h-9 bg-white text-sm"
                                />
                              </TableCell>
                              <TableCell className="max-w-[150px]">
                                <Input
                                  value={draft.tenantPhone}
                                  onChange={(event) => updateDraft(room.id, { tenantPhone: event.target.value })}
                                  className={`h-9 bg-white text-sm ${fieldErrors.tenantPhone ? 'border-red-300' : ''}`}
                                />
                                {fieldErrors.tenantPhone ? (
                                  <p className="mt-1 text-[11px] font-medium text-red-600">{fieldErrors.tenantPhone}</p>
                                ) : null}
                              </TableCell>
                              <TableCell className="max-w-[150px]">
                                <Input
                                  type="date"
                                  value={draft.tenantJoinedOn}
                                  onChange={(event) => updateDraft(room.id, { tenantJoinedOn: event.target.value })}
                                  disabled={Boolean(room.tenantJoinedOn)}
                                  className="h-9 bg-white text-sm"
                                />
                                {room.tenantJoinedOn ? (
                                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                                    Locked: {room.tenantJoinedOn}
                                  </p>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <Badge
                                    className={
                                      status === 'paid'
                                        ? 'bg-emerald-600 text-white'
                                        : status === 'unpaid'
                                          ? 'bg-red-600 text-white'
                                          : 'bg-slate-600 text-white'
                                    }
                                  >
                                    {status === 'paid'
                                      ? 'Paid'
                                      : status === 'unpaid'
                                        ? 'Pending'
                                        : 'Not Applicable'}
                                  </Badge>
                                  <p className={`text-[11px] font-semibold ${hasTenant ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {hasTenant ? 'Occupied' : 'Available'}
                                  </p>
                                  {penaltyAmount > 0 ? (
                                    <p className="text-[11px] font-semibold text-amber-700">
                                      Penalty: {formatCurrency(penaltyAmount)}
                                    </p>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[140px]">
                                <Input
                                  type="date"
                                  value={autoDueDate}
                                  readOnly
                                  disabled
                                  className="h-9 bg-white text-sm"
                                />
                              </TableCell>
                              <TableCell className="max-w-[140px]">
                                <Input
                                  type="date"
                                  value={draft.paidDate}
                                  onChange={(event) => updateDraft(room.id, { paidDate: event.target.value })}
                                  className="h-9 bg-white text-sm"
                                />
                              </TableCell>
                              <TableCell className="max-w-[140px]">
                                <Input
                                  type="number"
                                  min={1}
                                  value={draft.amountPaid}
                                  onChange={(event) =>
                                    updateDraft(room.id, { amountPaid: event.target.value.replace(/[^0-9.]/g, '') })
                                  }
                                  className={`h-9 bg-white text-sm ${fieldErrors.amountPaid ? 'border-red-300' : ''}`}
                                />
                                {fieldErrors.amountPaid ? (
                                  <p className="mt-1 text-[11px] font-medium text-red-600">{fieldErrors.amountPaid}</p>
                                ) : null}
                              </TableCell>
                              <TableCell className="max-w-[120px]">
                                <select
                                  value={draft.paymentMethod}
                                  onChange={(event) =>
                                    updateDraft(room.id, { paymentMethod: event.target.value as PaymentMethod })
                                  }
                                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
                                >
                                  <option value="cash">Cash</option>
                                  <option value="upi">UPI</option>
                                  <option value="bank">Bank</option>
                                </select>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex flex-wrap justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-2"
                                    onClick={() => void saveRoom(room)}
                                    disabled={savingRoomId === room.id || isBuildingSold}
                                  >
                                    {savingRoomId === room.id ? 'Saving...' : 'Save'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-2"
                                    onClick={() => resetTenantDraft(room)}
                                    disabled={savingRoomId === room.id || isBuildingSold}
                                  >
                                    Reset Tenant
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-8 px-2"
                                    onClick={() =>
                                      setPendingAction({
                                        type: 'paid',
                                        scope: 'room',
                                        roomId: room.id,
                                        roomLabel: room.roomLabel,
                                        roomIds: [room.id],
                                      })
                                    }
                                    disabled={confirming || isBuildingSold || isNotApplicable}
                                  >
                                    Paid
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-8 px-2"
                                    onClick={() =>
                                      setPendingAction({
                                        type: 'unpaid',
                                        scope: 'room',
                                        roomId: room.id,
                                        roomLabel: room.roomLabel,
                                        roomIds: [room.id],
                                      })
                                    }
                                    disabled={confirming || isBuildingSold || isNotApplicable}
                                  >
                                    Unpaid
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-2"
                                    onClick={() => setHistoryRoom(room)}
                                  >
                                    <History className="mr-1 h-3.5 w-3.5" />
                                    History
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-8 px-2"
                                    onClick={() =>
                                      setPendingDelete({
                                        scope: 'room',
                                        roomLabel: room.roomLabel,
                                        roomIds: [room.id],
                                      })
                                    }
                                    disabled={deleting || isBuildingSold}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => (!open ? setPendingAction(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.scope === 'floor'
                ? pendingAction?.type === 'paid'
                  ? `Mark Floor ${pendingAction.floorNumber} As Paid?`
                  : `Mark Floor ${pendingAction.floorNumber} As Unpaid?`
                : pendingAction?.type === 'paid'
                  ? 'Mark As Paid?'
                  : 'Mark As Unpaid?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.scope === 'floor'
                ? pendingAction?.type === 'paid'
                  ? `This will mark ${pendingAction.roomIds.length} room(s) on floor ${pendingAction.floorNumber} as paid for ${monthKey}.`
                  : `This will mark ${pendingAction.roomIds.length} room(s) on floor ${pendingAction.floorNumber} as unpaid for ${monthKey}.`
                : pendingAction?.type === 'paid'
                  ? `Confirm payment for ${pendingAction?.roomLabel} for ${monthKey}.`
                  : `Confirm pending status for ${pendingAction?.roomLabel} for ${monthKey}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runPendingAction()} disabled={confirming || isBuildingSold}>
              {confirming ? 'Updating...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => (!open ? setPendingDelete(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.scope === 'selection' ? 'Delete Selected Rooms?' : 'Delete Room?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.scope === 'selection'
                ? `This will permanently delete ${pendingDelete.roomIds.length} selected room(s) and related monthly rent entries.`
                : `This will permanently delete room ${pendingDelete?.roomLabel || ''} and related monthly rent entries.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void runPendingDelete()}
              disabled={deleting || isBuildingSold}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RoomHistoryModal
        open={Boolean(historyRoom)}
        roomId={historyRoom?.id || ''}
        roomLabel={historyRoom?.roomLabel || ''}
        token={token}
        onOpenChange={(open) => {
          if (!open) setHistoryRoom(null);
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 p-3 ${className}`}>
      <p className="text-xs uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
