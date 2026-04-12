import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Loader2, RefreshCcw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getGeoStates, type GeoStateItem } from '@/lib/geoApi';
import {
  adminApproveCreateGroupDealRequest,
  adminCreateGroupDeal,
  adminDownloadGroupDealJoinsCsv,
  adminGetGroupDealJoins,
  adminGetGroupDeals,
  adminGetGroupDealRequests,
  adminUpdateGroupDealRequest,
  adminUpdateGroupDeal,
  type GroupDealAdminCreatePayload,
  type GroupDealItem,
  type GroupDealJoinAdminItem,
  type GroupDealRequestItem,
  type GroupDealRequestStatus,
  type GroupDealStatus,
  type GroupDealType,
  type GroupDealUnitType,
} from '@/lib/groupDealsApi';

type StatusFilter = GroupDealStatus | 'ALL';
type RequestStatusFilter = GroupDealRequestStatus | 'ALL';

const STATUS_OPTIONS: GroupDealStatus[] = [
  'ACTIVE',
  'MIN_REACHED',
  'CONFIRMED',
  'FULL',
  'EXPIRED',
  'PAUSED',
  'CANCELLED',
];

const REQUEST_STATUS_OPTIONS: GroupDealRequestStatus[] = [
  'NEW',
  'APPROVED',
  'REJECTED',
  'AUTO_CREATED',
];

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN');
}

function formatPrice(value: number | null): string {
  if (!value || value <= 0) return '-';
  if (value >= 10000000) return `INR ${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `INR ${(value / 100000).toFixed(1)} L`;
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

interface EditableDealState {
  status: GroupDealStatus;
  finalGroupPrice: string;
  finalDiscountNote: string;
  bookingProcessSteps: string;
}

export default function AdminGroupDealsPage() {
  const [adminToken, setAdminToken] = useState('session');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchText, setSearchText] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<RequestStatusFilter>('NEW');
  const [requestSearchText, setRequestSearchText] = useState('');

  const [deals, setDeals] = useState<GroupDealItem[]>([]);
  const [requests, setRequests] = useState<GroupDealRequestItem[]>([]);
  const [editableRows, setEditableRows] = useState<Record<string, EditableDealState>>({});
  const [loading, setLoading] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [savingCode, setSavingCode] = useState('');
  const [requestActionId, setRequestActionId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [joiningDealCode, setJoiningDealCode] = useState('');
  const [joins, setJoins] = useState<GroupDealJoinAdminItem[]>([]);
  const [loadingJoins, setLoadingJoins] = useState(false);

  const [states, setStates] = useState<GeoStateItem[]>([]);
  const [createPayload, setCreatePayload] = useState<GroupDealAdminCreatePayload>({
    propertyId: null,
    projectName: '',
    builderName: '',
    builderVerified: false,
    stateCode: '',
    stateName: '',
    cityName: '',
    unitType: '2BHK',
    basePrice: null,
    dealType: 'CONFIRM_LATER',
    discountValue: null,
    minBuyers: 4,
    maxBuyers: null,
    validUntil: '',
    builderContactName: '',
    builderContactPhone: '',
    builderContactEmail: '',
    notes: '',
  });

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    const loadStates = async () => {
      try {
        const response = await getGeoStates({ limit: 200, offset: 0 });
        if (!active) return;
        setStates(Array.isArray(response.items) ? response.items : []);
      } catch {
        if (!active) return;
        setStates([]);
      }
    };
    void loadStates();
    return () => {
      active = false;
    };
  }, []);

  const selectedState = useMemo(
    () => states.find((state) => state.code === createPayload.stateCode) || null,
    [createPayload.stateCode, states]
  );

  const syncEditableRows = (items: GroupDealItem[]) => {
    const next: Record<string, EditableDealState> = {};
    items.forEach((item) => {
      next[item.dealCode] = {
        status: item.status,
        finalGroupPrice: item.finalGroupPrice ? String(item.finalGroupPrice) : '',
        finalDiscountNote: item.finalDiscountNote || '',
        bookingProcessSteps: item.bookingProcessSteps || '',
      };
    });
    setEditableRows(next);
  };

  const loadDeals = async () => {
    
    try {
      setLoading(true);
      setError('');
      setMessage('');
      const response = await adminGetGroupDeals(adminToken.trim(), {
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        q: searchText.trim() || undefined,
        page: 1,
        pageSize: 100,
      });
      setDeals(response.items || []);
      syncEditableRows(response.items || []);
    } catch (requestError) {
      setDeals([]);
      setError(requestError instanceof Error ? requestError.message : 'Could not load deals.');
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    
    try {
      setLoadingRequests(true);
      setError('');
      const response = await adminGetGroupDealRequests(adminToken.trim(), {
        status: requestStatusFilter === 'ALL' ? undefined : requestStatusFilter,
        q: requestSearchText.trim() || undefined,
        page: 1,
        pageSize: 100,
      });
      setRequests(Array.isArray(response.items) ? response.items : []);
    } catch (requestError) {
      setRequests([]);
      setError(requestError instanceof Error ? requestError.message : 'Could not load requests.');
    } finally {
      setLoadingRequests(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([loadDeals(), loadRequests()]);
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (!createPayload.projectName.trim()) {
      setError('Project name is required.');
      return;
    }
    if (!createPayload.builderName.trim()) {
      setError('Builder name is required.');
      return;
    }
    if (!createPayload.stateCode.trim() || !selectedState?.name) {
      setError('Select a valid state.');
      return;
    }
    if (!createPayload.cityName.trim()) {
      setError('City name is required.');
      return;
    }
    if (!createPayload.validUntil.trim()) {
      setError('Valid-until date and time is required.');
      return;
    }

    try {
      setCreating(true);
      setError('');
      setMessage('');
      await adminCreateGroupDeal(adminToken.trim(), {
        ...createPayload,
        stateCode: createPayload.stateCode.trim().toUpperCase(),
        stateName: selectedState.name,
      });
      setMessage('Group deal created.');
      setCreatePayload((prev) => ({
        ...prev,
        projectName: '',
        cityName: '',
        basePrice: null,
        discountValue: null,
        validUntil: '',
        notes: '',
      }));
      await loadDeals();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create group deal.');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveRow = async (deal: GroupDealItem) => {
    

    const editing = editableRows[deal.dealCode];
    if (!editing) return;

    try {
      setSavingCode(deal.dealCode);
      setError('');
      setMessage('');
      const response = await adminUpdateGroupDeal(adminToken.trim(), deal.dealCode, {
        status: editing.status,
        finalGroupPrice: editing.finalGroupPrice.trim() ? Number(editing.finalGroupPrice) : null,
        finalDiscountNote: editing.finalDiscountNote.trim(),
        bookingProcessSteps: editing.bookingProcessSteps.trim(),
      });

      setDeals((prev) =>
        prev.map((entry) => (entry.dealCode === deal.dealCode ? response.item : entry))
      );
      setMessage(`Updated ${deal.dealCode}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update deal.');
    } finally {
      setSavingCode('');
    }
  };

  const handleLoadJoins = async (dealCode: string) => {
    
    try {
      setLoadingJoins(true);
      setError('');
      const response = await adminGetGroupDealJoins(adminToken.trim(), dealCode);
      setJoiningDealCode(dealCode);
      setJoins(Array.isArray(response.items) ? response.items : []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load joined buyers.');
    } finally {
      setLoadingJoins(false);
    }
  };

  const handleExportJoins = async (dealCode: string) => {
    
    try {
      const blob = await adminDownloadGroupDealJoinsCsv(adminToken.trim(), dealCode);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${dealCode.toLowerCase()}-joined-buyers.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(`CSV exported for ${dealCode}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not export CSV.');
    }
  };

  const handleApproveCreateRequest = async (requestItem: GroupDealRequestItem) => {
    
    try {
      setRequestActionId(requestItem.id);
      setError('');
      setMessage('');
      const response = await adminApproveCreateGroupDealRequest(adminToken.trim(), requestItem.id, {
        minBuyers: 4,
        validDays: 14,
      });
      setMessage(response.message || 'Draft deal created.');
      await refreshAll();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create draft deal from request.');
    } finally {
      setRequestActionId(null);
    }
  };

  const handleRejectRequest = async (requestItem: GroupDealRequestItem) => {
    
    try {
      setRequestActionId(requestItem.id);
      setError('');
      setMessage('');
      await adminUpdateGroupDealRequest(adminToken.trim(), requestItem.id, {
        status: 'REJECTED',
        adminNote: 'Rejected by admin review.',
      });
      setMessage(`Rejected request #${requestItem.id}.`);
      await loadRequests();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not reject request.');
    } finally {
      setRequestActionId(null);
    }
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold sm:text-3xl">Admin: Group Deals</h1>
          <p className="mt-2 text-sm text-slate-600">
            Create deals, change status, confirm builder terms, and export joined buyers.
          </p>
        </div>

        {(error || message) && (
          <div
            className={`rounded-2xl border p-4 text-sm ${
              error
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {error ? <AlertCircle className="mr-2 inline h-4 w-4" /> : null}
            {error || message}
          </div>
        )}

        <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Create Group Deal</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 xl:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Admin Token</p>
              <Input
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                type="password"
                placeholder="Admin session is active"
                className="h-11 bg-white"
              />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">State</p>
              <select
                value={createPayload.stateCode}
                onChange={(event) =>
                  setCreatePayload((prev) => ({
                    ...prev,
                    stateCode: event.target.value,
                  }))
                }
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Select state</option>
                {states.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.name} ({state.code})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">City</p>
              <Input
                value={createPayload.cityName}
                onChange={(event) =>
                  setCreatePayload((prev) => ({
                    ...prev,
                    cityName: event.target.value,
                  }))
                }
                placeholder="City"
                className="h-11 bg-white"
              />
            </label>

            <label className="space-y-1 xl:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Project Name</p>
              <Input
                value={createPayload.projectName}
                onChange={(event) =>
                  setCreatePayload((prev) => ({
                    ...prev,
                    projectName: event.target.value,
                  }))
                }
                placeholder="Project name"
                className="h-11 bg-white"
              />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Property ID (optional)</p>
              <Input
                value={createPayload.propertyId ?? ''}
                onChange={(event) =>
                  setCreatePayload((prev) => ({
                    ...prev,
                    propertyId: event.target.value.trim() ? Number(event.target.value) : null,
                  }))
                }
                type="number"
                min={1}
                placeholder="Buy property ID"
                className="h-11 bg-white"
              />
            </label>

            <label className="space-y-1 xl:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Builder Name</p>
              <Input
                value={createPayload.builderName}
                onChange={(event) =>
                  setCreatePayload((prev) => ({
                    ...prev,
                    builderName: event.target.value,
                  }))
                }
                placeholder="Builder/developer name"
                className="h-11 bg-white"
              />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Unit Type</p>
              <select
                value={createPayload.unitType}
                onChange={(event) =>
                  setCreatePayload((prev) => ({
                    ...prev,
                    unitType: event.target.value as GroupDealUnitType,
                  }))
                }
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="2BHK">2BHK</option>
                <option value="3BHK">3BHK</option>
                <option value="SHOP">Shop</option>
                <option value="PLOT">Plot</option>
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Deal Type</p>
              <select
                value={createPayload.dealType}
                onChange={(event) =>
                  setCreatePayload((prev) => ({
                    ...prev,
                    dealType: event.target.value as GroupDealType,
                  }))
                }
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="FLAT_DISCOUNT">Flat discount</option>
                <option value="PERCENT_DISCOUNT">Percentage discount</option>
                <option value="CONFIRM_LATER">Builder confirms later</option>
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Base Price</p>
              <Input
                value={createPayload.basePrice ?? ''}
                onChange={(event) =>
                  setCreatePayload((prev) => ({
                    ...prev,
                    basePrice: event.target.value.trim() ? Number(event.target.value) : null,
                  }))
                }
                placeholder="INR"
                className="h-11 bg-white"
              />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Discount Value</p>
              <Input
                value={createPayload.discountValue ?? ''}
                onChange={(event) =>
                  setCreatePayload((prev) => ({
                    ...prev,
                    discountValue: event.target.value.trim() ? Number(event.target.value) : null,
                  }))
                }
                placeholder="INR or %"
                className="h-11 bg-white"
              />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Min Buyers</p>
              <Input
                value={createPayload.minBuyers}
                onChange={(event) =>
                  setCreatePayload((prev) => ({
                    ...prev,
                    minBuyers: Math.max(2, Number(event.target.value || 2)),
                  }))
                }
                type="number"
                min={2}
                className="h-11 bg-white"
              />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Max Buyers</p>
              <Input
                value={createPayload.maxBuyers ?? ''}
                onChange={(event) =>
                  setCreatePayload((prev) => ({
                    ...prev,
                    maxBuyers: event.target.value.trim() ? Number(event.target.value) : null,
                  }))
                }
                type="number"
                min={2}
                className="h-11 bg-white"
                placeholder="Optional"
              />
            </label>

            <label className="space-y-1 xl:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Valid Until</p>
              <Input
                value={createPayload.validUntil}
                onChange={(event) =>
                  setCreatePayload((prev) => ({
                    ...prev,
                    validUntil: event.target.value,
                  }))
                }
                type="datetime-local"
                className="h-11 bg-white"
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700 xl:col-span-2">
              <input
                type="checkbox"
                checked={Boolean(createPayload.builderVerified)}
                onChange={(event) =>
                  setCreatePayload((prev) => ({
                    ...prev,
                    builderVerified: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              Verified builder
            </label>
          </div>

          <div className="mt-4">
            <Button
              type="submit"
              className="bg-brand-primary text-white hover:bg-brand-primary-dark"
              disabled={creating}
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Deal'
              )}
            </Button>
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status Filter</p>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="ALL">All</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Search</p>
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Project, builder or deal code"
                className="h-11 min-w-[260px] bg-white"
              />
            </label>

            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={refreshAll}
              disabled={loading || loadingRequests}
            >
              {loading || loadingRequests ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1080px] divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.1em] text-slate-500">
                  <th className="py-2 pr-3">Deal</th>
                  <th className="py-2 pr-3">Project</th>
                  <th className="py-2 pr-3">Location</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Progress</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Builder Confirm</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deals.map((deal) => {
                  const editing = editableRows[deal.dealCode];
                  return (
                    <tr key={deal.dealCode}>
                      <td className="py-3 pr-3 font-semibold">{deal.dealCode}</td>
                      <td className="py-3 pr-3">
                        <p className="font-medium text-slate-900">{deal.projectName}</p>
                        <p className="text-xs text-slate-500">{deal.builderName}</p>
                      </td>
                      <td className="py-3 pr-3">
                        {deal.cityName}, {deal.stateCode}
                      </td>
                      <td className="py-3 pr-3">
                        <p>Base: {formatPrice(deal.basePrice)}</p>
                        <p className="text-xs text-slate-500">Final: {formatPrice(deal.finalGroupPrice)}</p>
                      </td>
                      <td className="py-3 pr-3">
                        {deal.joinedBuyers}/{deal.minBuyers}
                        {deal.maxBuyers ? ` (max ${deal.maxBuyers})` : ''}
                      </td>
                      <td className="py-3 pr-3">
                        <select
                          value={editing?.status || deal.status}
                          onChange={(event) =>
                            setEditableRows((prev) => ({
                              ...prev,
                              [deal.dealCode]: {
                                ...(prev[deal.dealCode] || {
                                  status: deal.status,
                                  finalGroupPrice: '',
                                  finalDiscountNote: '',
                                  bookingProcessSteps: '',
                                }),
                                status: event.target.value as GroupDealStatus,
                              },
                            }))
                          }
                          className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-3">
                        <Input
                          value={editing?.finalGroupPrice || ''}
                          onChange={(event) =>
                            setEditableRows((prev) => ({
                              ...prev,
                              [deal.dealCode]: {
                                ...(prev[deal.dealCode] || {
                                  status: deal.status,
                                  finalGroupPrice: '',
                                  finalDiscountNote: '',
                                  bookingProcessSteps: '',
                                }),
                                finalGroupPrice: event.target.value.replace(/[^\d.]/g, ''),
                              },
                            }))
                          }
                          placeholder="Final price"
                          className="mb-2 h-8 bg-white text-xs"
                        />
                        <Input
                          value={editing?.finalDiscountNote || ''}
                          onChange={(event) =>
                            setEditableRows((prev) => ({
                              ...prev,
                              [deal.dealCode]: {
                                ...(prev[deal.dealCode] || {
                                  status: deal.status,
                                  finalGroupPrice: '',
                                  finalDiscountNote: '',
                                  bookingProcessSteps: '',
                                }),
                                finalDiscountNote: event.target.value,
                              },
                            }))
                          }
                          placeholder="Discount note"
                          className="h-8 bg-white text-xs"
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-col gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 justify-start text-xs"
                            onClick={() => handleSaveRow(deal)}
                            disabled={savingCode === deal.dealCode}
                          >
                            {savingCode === deal.dealCode ? (
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 justify-start text-xs"
                            onClick={() => handleLoadJoins(deal.dealCode)}
                          >
                            <Users className="mr-2 h-3.5 w-3.5" />
                            View joins
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 justify-start text-xs"
                            onClick={() => handleExportJoins(deal.dealCode)}
                          >
                            <Download className="mr-2 h-3.5 w-3.5" />
                            Export CSV
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && deals.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-sm text-slate-500">
                      No deals found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Request Status</p>
              <select
                value={requestStatusFilter}
                onChange={(event) => setRequestStatusFilter(event.target.value as RequestStatusFilter)}
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="ALL">All</option>
                {REQUEST_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Request Search</p>
              <Input
                value={requestSearchText}
                onChange={(event) => setRequestSearchText(event.target.value)}
                placeholder="Requester, phone, email, property"
                className="h-11 min-w-[280px] bg-white"
              />
            </label>

            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={loadRequests}
              disabled={loadingRequests}
            >
              {loadingRequests ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Load Requests
            </Button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1180px] divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.1em] text-slate-500">
                  <th className="py-2 pr-3">Request</th>
                  <th className="py-2 pr-3">Property</th>
                  <th className="py-2 pr-3">Requester</th>
                  <th className="py-2 pr-3">Contact</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Draft Deal</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((requestItem) => {
                  const canCreateDraft =
                    requestItem.status === 'NEW' || requestItem.status === 'APPROVED';
                  const actionLoading = requestActionId === requestItem.id;

                  return (
                    <tr key={requestItem.id}>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-slate-900">#{requestItem.id}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(requestItem.createdAt)}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-medium text-slate-900">{requestItem.propertyTitle}</p>
                        <p className="text-xs text-slate-500">
                          {requestItem.companyName || '-'} ({requestItem.companyType || 'owner'}) | Listings:{' '}
                          {requestItem.companyPropertyCount}
                        </p>
                        {requestItem.groupDealPriority ? (
                          <p className="text-xs text-indigo-700">
                            Priority {requestItem.groupDealPriority}: {requestItem.groupDealPriorityLabel}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-3">{requestItem.fullName}</td>
                      <td className="py-3 pr-3">
                        <p>{requestItem.phone || '-'}</p>
                        <p className="text-xs text-slate-500">{requestItem.email || '-'}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-slate-800">{requestItem.status}</p>
                        {requestItem.requestNote ? (
                          <p className="mt-1 text-xs text-slate-500">{requestItem.requestNote}</p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-3">
                        {requestItem.createdDealCode ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                            {requestItem.createdDealCode}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">Not created</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-col gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 justify-start text-xs"
                            onClick={() => handleApproveCreateRequest(requestItem)}
                            disabled={!canCreateDraft || Boolean(requestItem.createdDealCode) || actionLoading}
                          >
                            {actionLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                            Approve + Create Draft
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 justify-start text-xs"
                            onClick={() => handleRejectRequest(requestItem)}
                            disabled={requestItem.status === 'REJECTED' || actionLoading}
                          >
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loadingRequests && requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                      No requests found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Joined Buyers {joiningDealCode ? `(${joiningDealCode})` : ''}</h2>
            {loadingJoins ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : null}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[900px] divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.1em] text-slate-500">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Phone</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {joins.map((join) => (
                  <tr key={join.id}>
                    <td className="py-2 pr-3">{join.fullName}</td>
                    <td className="py-2 pr-3">{join.phone || '-'}</td>
                    <td className="py-2 pr-3">{join.email || '-'}</td>
                    <td className="py-2 pr-3">{join.unitPreference}</td>
                    <td className="py-2 pr-3">{join.joinStatus}</td>
                    <td className="py-2 pr-3">{formatDateTime(join.createdAt)}</td>
                  </tr>
                ))}
                {!loadingJoins && joins.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-slate-500">
                      No joined buyers loaded.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

