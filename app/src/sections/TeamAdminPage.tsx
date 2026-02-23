import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TeamDeskSkeleton } from '@/components/loading/PageSkeletons';
import { apiRequest } from '@/lib/http';
import type { AuthUser } from '@/lib/session';

interface TeamDeskProps {
  token: string;
  user: AuthUser | null;
}

type InteractionStatus = 'New' | 'Contacted' | 'Scheduled' | 'Completed';

interface WorkflowRequest {
  id: number;
  referenceId: string;
  requestType: 'buy' | 'sell' | 'rent';
  requesterName: string;
  requesterPhone: string;
  city: string;
  locality: string;
  propertyType: string;
  needHelp: boolean;
  helpType: string | null;
  preferredCallTime: string | null;
  assistedListing: boolean;
  interactionStatus: InteractionStatus;
  listingStatus: 'Pending' | 'Approved' | 'Rejected' | 'Sold' | 'Rented';
  details: Record<string, unknown>;
  assignedToUserId?: number | null;
  assignedTaskType?: 'call_user' | 'add_property' | 'handle_query' | null;
  assignedTaskQuery?: string;
  createdAt: string;
}

const interactionOptions: InteractionStatus[] = ['New', 'Contacted', 'Scheduled', 'Completed'];
const TEAM_DESK_REFRESH_MS = 30000;

function formatDate(iso: string): string {
  if (!iso) return '-';
  const dt = new Date(iso);
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTaskLabel(taskType?: 'call_user' | 'add_property' | 'handle_query' | null): string {
  if (taskType === 'add_property') return 'Add Property';
  if (taskType === 'handle_query') return 'Handle Query';
  if (taskType === 'call_user') return 'Call User';
  return 'General Follow-up';
}

export default function TeamAdminPage({ token, user }: TeamDeskProps) {
  const [requests, setRequests] = useState<WorkflowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | InteractionStatus>('all');
  const [propertyFilter, setPropertyFilter] = useState<'Any' | 'Plot' | 'Villa' | 'Flat / Apartment' | 'Commercial'>('Any');
  const [prioritizeMine, setPrioritizeMine] = useState(true);
  const [onlyMine, setOnlyMine] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [detailsPatch, setDetailsPatch] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState('');
  const fetchInFlightRef = useRef(false);

  const fetchQueue = useCallback(async (showLoader = true) => {
    if (!token || !user || (user.role !== 'team_member' && user.role !== 'admin')) {
      return;
    }

    if (fetchInFlightRef.current) {
      return;
    }

    fetchInFlightRef.current = true;
    if (showLoader) {
      setLoading(true);
      setError('');
    }

    try {
      const queryParams = new URLSearchParams();
      queryParams.set('type', 'all');
      if (statusFilter !== 'all') {
        queryParams.set('interactionStatus', statusFilter);
      }

      const response = await apiRequest<{ requests: WorkflowRequest[] }>(
        `/workflow/team/requests?${queryParams.toString()}`,
        {},
        token
      );
      setRequests(response.requests || []);
      setLastSyncAt(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch (queueError) {
      if (showLoader) {
        setError(queueError instanceof Error ? queueError.message : 'Unable to load team queue');
      }
    } finally {
      fetchInFlightRef.current = false;
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [statusFilter, token, user]);

  useEffect(() => {
    void fetchQueue(true);
  }, [fetchQueue]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void fetchQueue(false);
    }, TEAM_DESK_REFRESH_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void fetchQueue(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchQueue]);

  const filteredRequests = useMemo(() => {
    const mineUserId = user?.id ?? null;
    const filtered = requests.filter((item) => {
      if (propertyFilter !== 'Any' && item.propertyType !== propertyFilter) {
        return false;
      }
      if (
        onlyMine &&
        user?.role === 'team_member' &&
        item.assignedToUserId !== mineUserId
      ) {
        return false;
      }
      return true;
    });

    if (!prioritizeMine || !mineUserId) {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      const aMine = a.assignedToUserId === mineUserId ? 0 : 1;
      const bMine = b.assignedToUserId === mineUserId ? 0 : 1;
      if (aMine !== bMine) {
        return aMine - bMine;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [onlyMine, prioritizeMine, propertyFilter, requests, user?.id, user?.role]);

  const myAssignedCount = useMemo(
    () => requests.filter((item) => item.assignedToUserId === user?.id).length,
    [requests, user?.id]
  );

  const byType = useMemo(
    () => ({
      buyers: filteredRequests.filter((item) => item.requestType === 'buy'),
      sells: filteredRequests.filter((item) => item.requestType === 'sell'),
      rents: filteredRequests.filter((item) => item.requestType === 'rent'),
      assisted: filteredRequests.filter((item) => item.assistedListing),
    }),
    [filteredRequests]
  );
  const assistedCount = useMemo(
    () => requests.filter((item) => item.assistedListing).length,
    [requests]
  );
  const pendingApprovalCount = useMemo(
    () => requests.filter((item) => item.requestType !== 'buy' && item.listingStatus === 'Pending').length,
    [requests]
  );

  const updateRequest = async (
    id: number,
    options: {
      interactionStatus?: InteractionStatus;
      note?: string;
      detailsPatch?: Record<string, unknown>;
      assignToSelf?: boolean;
    }
  ) => {
    try {
      await apiRequest(
        `/workflow/team/requests/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            interactionStatus: options.interactionStatus,
            internalNote: options.note || '',
            detailsPatch: options.detailsPatch,
            assignToSelf: options.assignToSelf || false,
          }),
        },
        token
      );

      setMessage(`Request ${id} updated`);
      setNotes((prev) => ({ ...prev, [id]: '' }));
      setDetailsPatch((prev) => ({ ...prev, [id]: '' }));
      await fetchQueue(true);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update request');
    }
  };

  if (!user || (user.role !== 'team_member' && user.role !== 'admin')) {
    return (
      <section className="min-h-screen pt-28 pb-16 text-slate-900">
        <div className="page-container">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            Team access required.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen pt-28 pb-16 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="zdt-panel-hero rounded-3xl border border-white/20 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Team Operations Desk</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Buyer/Seller/Rent Workflow Assistance</h1>
          <p className="mt-2 text-sm text-white/85">
            Update interaction statuses, add internal notes, and complete assisted listing details on behalf of users.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        {message && (
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            {message}
          </p>
        )}

        {loading && requests.length === 0 ? (
          <TeamDeskSkeleton />
        ) : (
          <>
            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                    Queue: {requests.length}
                  </span>
                  <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                    My Assigned: {myAssignedCount}
                  </span>
                  <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                    Assisted: {assistedCount}
                  </span>
                  <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                    Pending Approval: {pendingApprovalCount}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5">
                    <span className="text-xs text-slate-600">My Assigned First</span>
                    <Switch
                      checked={prioritizeMine}
                      onCheckedChange={setPrioritizeMine}
                    />
                  </div>
                  {user.role === 'team_member' && (
                    <div className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5">
                      <span className="text-xs text-slate-600">Only My Assigned</span>
                      <Switch
                        checked={onlyMine}
                        onCheckedChange={setOnlyMine}
                      />
                    </div>
                  )}
                  {lastSyncAt && (
                    <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                      Last Sync: {lastSyncAt}
                    </span>
                  )}
                  <Button variant="outline" onClick={() => void fetchQueue(true)} disabled={loading}>
                    {loading ? 'Loading...' : 'Refresh Now'}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | InteractionStatus)}>
                <SelectTrigger className="h-10 bg-white text-slate-900">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-white text-slate-900">
                  <SelectItem value="all">Status: All</SelectItem>
                  {interactionOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={propertyFilter}
                onValueChange={(value) =>
                  setPropertyFilter(value as 'Any' | 'Plot' | 'Villa' | 'Flat / Apartment' | 'Commercial')
                }
              >
                <SelectTrigger className="h-10 bg-white text-slate-900">
                  <SelectValue placeholder="Property Type" />
                </SelectTrigger>
                <SelectContent className="bg-white text-slate-900">
                  <SelectItem value="Any">Property Type: Any</SelectItem>
                  <SelectItem value="Plot">Plot</SelectItem>
                  <SelectItem value="Villa">Villa</SelectItem>
                  <SelectItem value="Flat / Apartment">Flat / Apartment</SelectItem>
                  <SelectItem value="Commercial">Commercial</SelectItem>
                </SelectContent>
              </Select>
              </div>
            </div>

            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
              <Tabs defaultValue="buyers">
                <TabsList className="h-10 w-full justify-start overflow-x-auto bg-slate-100 p-1">
                  <TabsTrigger value="buyers">Buyer Requests</TabsTrigger>
                  <TabsTrigger value="sell">Sell Listings</TabsTrigger>
                  <TabsTrigger value="rent">Rent Listings</TabsTrigger>
                  <TabsTrigger value="assisted">Assisted Listings</TabsTrigger>
                </TabsList>

            <TabsContent value="buyers" className="mt-4 space-y-3">
              {byType.buyers.length === 0 && <p className="text-sm text-slate-600">No buyer requests found.</p>}
              {byType.buyers.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">{item.requesterName}</p>
                    <span className="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-700">
                      {item.referenceId}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    {item.city}, {item.locality || '-'} | {item.propertyType}
                  </p>
                  <p className="text-xs text-slate-500">Created: {formatDate(item.createdAt)}</p>
                  <p className="text-xs text-slate-500">
                    Assigned: {item.assignedToUserId === user.id ? 'You' : item.assignedToUserId ? `Team #${item.assignedToUserId}` : 'Unassigned'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Work: {formatTaskLabel(item.assignedTaskType)}
                    {item.assignedTaskQuery ? ` | Query: ${item.assignedTaskQuery}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`tel:${item.requesterPhone}`}
                      className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-white"
                    >
                      <PhoneCall className="mr-2 h-4 w-4" />
                      Call User
                    </a>
                    <Button variant="outline" onClick={() => updateRequest(item.id, { assignToSelf: true })}>
                      Assign To Me
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      value={item.interactionStatus}
                      onValueChange={(value) =>
                        updateRequest(item.id, { interactionStatus: value as InteractionStatus })
                      }
                    >
                      <SelectTrigger className="h-10 bg-white text-slate-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white text-slate-900">
                        {interactionOptions.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        value={notes[item.id] || ''}
                        onChange={(event) =>
                          setNotes((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                        placeholder="Internal note"
                        className="h-10 bg-white"
                      />
                      <Button
                        variant="outline"
                        onClick={() => updateRequest(item.id, { note: notes[item.id] || '' })}
                      >
                        Add Note
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </TabsContent>

            <TabsContent value="sell" className="mt-4 space-y-3">
              {byType.sells.length === 0 && <p className="text-sm text-slate-600">No sell listings found.</p>}
              {byType.sells.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">
                      {item.requesterName} - {item.propertyType}
                    </p>
                    <span className="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-700">
                      {item.referenceId}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    {item.city}, {item.locality || '-'} | Listing Status: {item.listingStatus}
                  </p>
                  <p className="text-xs text-slate-500">Created: {formatDate(item.createdAt)}</p>
                  <p className="text-xs text-slate-500">
                    Assigned: {item.assignedToUserId === user.id ? 'You' : item.assignedToUserId ? `Team #${item.assignedToUserId}` : 'Unassigned'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Work: {formatTaskLabel(item.assignedTaskType)}
                    {item.assignedTaskQuery ? ` | Query: ${item.assignedTaskQuery}` : ''}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      value={item.interactionStatus}
                      onValueChange={(value) =>
                        updateRequest(item.id, { interactionStatus: value as InteractionStatus })
                      }
                    >
                      <SelectTrigger className="h-10 bg-white text-slate-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white text-slate-900">
                        {interactionOptions.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        value={notes[item.id] || ''}
                        onChange={(event) =>
                          setNotes((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                        placeholder="Internal note"
                        className="h-10 bg-white"
                      />
                      <Button
                        variant="outline"
                        onClick={() => updateRequest(item.id, { note: notes[item.id] || '' })}
                      >
                        Add Note
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </TabsContent>

            <TabsContent value="rent" className="mt-4 space-y-3">
              {byType.rents.length === 0 && <p className="text-sm text-slate-600">No rent listings found.</p>}
              {byType.rents.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">
                      {item.requesterName} - {item.propertyType}
                    </p>
                    <span className="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-700">
                      {item.referenceId}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    {item.city}, {item.locality || '-'} | Listing Status: {item.listingStatus}
                  </p>
                  <p className="text-xs text-slate-500">Created: {formatDate(item.createdAt)}</p>
                  <p className="text-xs text-slate-500">
                    Assigned: {item.assignedToUserId === user.id ? 'You' : item.assignedToUserId ? `Team #${item.assignedToUserId}` : 'Unassigned'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Work: {formatTaskLabel(item.assignedTaskType)}
                    {item.assignedTaskQuery ? ` | Query: ${item.assignedTaskQuery}` : ''}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      value={item.interactionStatus}
                      onValueChange={(value) =>
                        updateRequest(item.id, { interactionStatus: value as InteractionStatus })
                      }
                    >
                      <SelectTrigger className="h-10 bg-white text-slate-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white text-slate-900">
                        {interactionOptions.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        value={notes[item.id] || ''}
                        onChange={(event) =>
                          setNotes((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                        placeholder="Internal note"
                        className="h-10 bg-white"
                      />
                      <Button
                        variant="outline"
                        onClick={() => updateRequest(item.id, { note: notes[item.id] || '' })}
                      >
                        Add Note
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </TabsContent>

            <TabsContent value="assisted" className="mt-4 space-y-3">
              {byType.assisted.length === 0 && (
                <p className="text-sm text-slate-600">No assisted listing requests found.</p>
              )}
              {byType.assisted.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">
                      {item.requesterName} ({item.requestType.toUpperCase()})
                    </p>
                    <span className="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-700">
                      {item.referenceId}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    Help Type: {item.helpType || '-'} | Preferred Call: {item.preferredCallTime || '-'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Assigned: {item.assignedToUserId === user.id ? 'You' : item.assignedToUserId ? `Team #${item.assignedToUserId}` : 'Unassigned'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Work: {formatTaskLabel(item.assignedTaskType)}
                    {item.assignedTaskQuery ? ` | Query: ${item.assignedTaskQuery}` : ''}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      value={item.interactionStatus}
                      onValueChange={(value) =>
                        updateRequest(item.id, { interactionStatus: value as InteractionStatus })
                      }
                    >
                      <SelectTrigger className="h-10 bg-white text-slate-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white text-slate-900">
                        {interactionOptions.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        value={notes[item.id] || ''}
                        onChange={(event) =>
                          setNotes((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                        placeholder="Internal note"
                        className="h-10 bg-white"
                      />
                      <Button
                        variant="outline"
                        onClick={() => updateRequest(item.id, { note: notes[item.id] || '' })}
                      >
                        Add Note
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={detailsPatch[item.id] || ''}
                      onChange={(event) =>
                        setDetailsPatch((prev) => ({ ...prev, [item.id]: event.target.value }))
                      }
                      placeholder="Add assisted listing detail (e.g. plotArea=2400)"
                      className="h-10 bg-white"
                    />
                    <Button
                      onClick={() => {
                        const raw = (detailsPatch[item.id] || '').trim();
                        if (!raw) return;

                        const [key, ...rest] = raw.split('=');
                        const value = rest.join('=').trim();
                        if (!key.trim() || !value) return;

                        updateRequest(item.id, {
                          detailsPatch: {
                            [key.trim()]: value,
                          },
                        });
                      }}
                    >
                      Save Details
                    </Button>
                  </div>
                </article>
              ))}
            </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
