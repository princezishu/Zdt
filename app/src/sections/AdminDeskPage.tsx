import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminDeskSkeleton } from '@/components/loading/PageSkeletons';
import { apiRequest } from '@/lib/http';
import type { AuthUser } from '@/lib/session';
import MainAdminPromotionsPanel from '@/sections/admin/MainAdminPromotionsPanel';
import SupportContributionsPanel from '@/sections/admin/SupportContributionsPanel';

interface AdminDeskPageProps {
  token: string;
  user: AuthUser | null;
  onOpenLayoutUnits?: () => void;
}

interface OverviewResponse {
  requests: {
    total: number;
    buy: number;
    sell: number;
    rent: number;
    assisted: number;
    pendingApproval: number;
  };
  team: {
    totalMembers: number;
    activeMembers: number;
  };
  adminSeats: {
    used: number;
    max: number;
  };
  careers: {
    pending: number;
  };
  dashboard?: {
    propertiesAddedToday: number;
    propertiesAddedThisWeek: number;
    assistedListingsCount: number;
    activeHelpRequests: number;
    userSubmittedToday: number;
    teamAddedToday: number;
  };
  teamPerformance?: Array<{
    id: number;
    name: string;
    calls_handled: number;
    assisted_users: number;
    listings_added_for_users: number;
    notes_added: number;
  }>;
  adminPerformance?: Array<{
    id: number;
    name: string;
    listing_decisions: number;
    fake_removed: number;
    featured_updates: number;
  }>;
  listingsPerDay?: Array<{
    day: string;
    total: number;
  }>;
}

interface WorkflowRequest {
  id: number;
  referenceId: string;
  requestType: 'buy' | 'sell' | 'rent';
  requesterName: string;
  requesterPhone: string;
  city: string;
  locality: string;
  propertyType: string;
  assistedListing: boolean;
  interactionStatus: 'New' | 'Contacted' | 'Scheduled' | 'Completed';
  listingStatus: 'Pending' | 'Approved' | 'Rejected' | 'Sold' | 'Rented';
  isFeatured?: boolean;
  internalNotes: string;
  assignedToUserId?: number | null;
  assignedTaskType?: 'call_user' | 'add_property' | 'handle_query' | null;
  assignedTaskQuery?: string;
  assignedAt?: string | null;
}

interface TeamMember {
  id: number;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  deactivatedUntil?: string | null;
}

interface PlatformUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: 'user' | 'team_member' | 'admin' | 'owner' | 'agent' | 'builder';
  isMainAdmin: boolean;
  isActive: boolean;
  deactivatedUntil?: string | null;
  activeSessions?: number;
}

interface CareerApplication {
  id: number;
  referenceId: string;
  fullName: string;
  phone: string;
  email: string;
  city: string;
  position: 'admin' | 'team_member';
  registrationNumber: string;
  securityQuestionOne: string;
  securityQuestionTwo: string;
  aadhaarMasked?: string | null;
  panMasked?: string | null;
  teamSpecialization?: string | null;
  teamPreferredShift?: string | null;
  experience?: string;
  whyHire: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Auto-Rejected';
}

interface CareerReviewResponse {
  message: string;
  status: string;
  account?: {
    email: string;
    role: string;
    temporaryPassword?: string;
    forcePasswordReset?: boolean;
  };
}

interface ResetPasswordResponse {
  message: string;
  temporaryPassword: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

interface ActivityLogEntry {
  id: number;
  actorUserId: number | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string;
  actionKey: string;
  entityType: string;
  entityId: number | null;
  requestReference: string | null;
  createdAt: string;
}

const adminStatusOptions: Array<'Approved' | 'Rejected' | 'Sold' | 'Rented'> = [
  'Approved',
  'Rejected',
  'Sold',
  'Rented',
];
const DASHBOARD_REFRESH_MS = 30000;

export default function AdminDeskPage({ token, user, onOpenLayoutUnits }: AdminDeskPageProps) {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [requests, setRequests] = useState<WorkflowRequest[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [applications, setApplications] = useState<CareerApplication[]>([]);
  const [activityEntries, setActivityEntries] = useState<ActivityLogEntry[]>([]);
  const [listingNotes, setListingNotes] = useState<Record<number, string>>({});
  const [assignTargets, setAssignTargets] = useState<Record<number, string>>({});
  const [assignTaskTypes, setAssignTaskTypes] = useState<Record<number, 'call_user' | 'add_property' | 'handle_query'>>({});
  const [assignTaskQueries, setAssignTaskQueries] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState('');
  const [ownerPromoteId, setOwnerPromoteId] = useState('');
  const [ownerPromoteStatus, setOwnerPromoteStatus] = useState('');
  const [platformUserQuery, setPlatformUserQuery] = useState('');
  const refreshInFlightRef = useRef(false);

  const pendingListings = useMemo(
    () => requests.filter((item) => item.requestType !== 'buy' && item.listingStatus === 'Pending'),
    [requests]
  );
  const liveApprovedListings = useMemo(
    () => requests.filter((item) => item.requestType !== 'buy' && item.listingStatus === 'Approved').length,
    [requests]
  );
  const referralQueue = useMemo(
    () =>
      requests
        .filter((item) => item.interactionStatus !== 'Completed')
        .slice(0, 20),
    [requests]
  );
  const activeTeamMembers = useMemo(
    () => teamMembers.filter((member) => member.isActive),
    [teamMembers]
  );

  const refresh = useCallback(async (showLoader = true) => {
    if (!token || !user || user.role !== 'admin') {
      return;
    }

    if (refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;

    if (showLoader) {
      setLoading(true);
      setError('');
    }

    try {
      const [overviewRes, queueRes, teamRes, usersRes] = await Promise.all([
        apiRequest<OverviewResponse>('/workflow/admin/overview', {}, token),
        apiRequest<{ requests: WorkflowRequest[] }>('/workflow/team/requests?type=all', {}, token),
        apiRequest<{ teamMembers: TeamMember[] }>('/workflow/admin/team-members', {}, token),
        apiRequest<{ users: PlatformUser[] }>('/workflow/admin/platform-users', {}, token),
      ]);

      setOverview(overviewRes);
      setRequests(queueRes.requests || []);
      setTeamMembers(teamRes.teamMembers || []);
      setPlatformUsers(usersRes.users || []);
      setLastSyncAt(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );

      if (user.isMainAdmin) {
        const [careersRes, activityRes] = await Promise.all([
          apiRequest<{ applications: CareerApplication[] }>(
            '/workflow/main/career-applications?status=Pending',
            {},
            token
          ),
          apiRequest<{ entries: ActivityLogEntry[] }>('/workflow/main/activity-log?limit=120', {}, token),
        ]);
        setApplications(careersRes.applications || []);
        setActivityEntries(activityRes.entries || []);
      } else {
        setApplications([]);
        setActivityEntries([]);
      }
    } catch (loadError) {
      if (showLoader) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load admin dashboard');
      }
    } finally {
      refreshInFlightRef.current = false;
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [token, user]);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void refresh(false);
    }, DASHBOARD_REFRESH_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void refresh(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refresh]);

  const updateListingStatus = async (
    requestId: number,
    status: 'Approved' | 'Rejected' | 'Sold' | 'Rented'
  ) => {
    try {
      await apiRequest(
        `/workflow/admin/requests/${requestId}/listing-status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            listingStatus: status,
            note: listingNotes[requestId] || '',
          }),
        },
        token
      );
      setActionMessage(`Listing ${requestId} updated to ${status}`);
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update listing status');
    }
  };

  const removeFakeListing = async (requestId: number) => {
    try {
      await apiRequest(
        `/workflow/admin/requests/${requestId}/flag`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            remove: true,
            isFake: true,
            note: listingNotes[requestId] || 'Removed by admin as fake listing.',
          }),
        },
        token
      );
      setActionMessage(`Listing ${requestId} removed`);
      await refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove listing');
    }
  };

  const assignRequestToTeamMember = async (requestId: number) => {
    const selected = assignTargets[requestId];
    const teamMemberId = Number(selected);
    const assignmentType = assignTaskTypes[requestId] || 'call_user';
    const assignmentQuery = (assignTaskQueries[requestId] || '').trim();
    if (!Number.isInteger(teamMemberId) || teamMemberId <= 0) {
      setError('Select a team member before referring the request.');
      return;
    }
    if (assignmentType === 'handle_query' && !assignmentQuery) {
      setError('Enter query/instruction when task type is Handle Query.');
      return;
    }

    const assignee = activeTeamMembers.find((member) => member.id === teamMemberId);
    const taskLabel =
      assignmentType === 'add_property'
        ? 'Add Property'
        : assignmentType === 'handle_query'
          ? 'Handle Query'
          : 'Call User';

    try {
      await apiRequest(
        `/workflow/admin/requests/${requestId}/assign-team`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            teamMemberId,
            assignmentType,
            assignmentQuery,
            note: listingNotes[requestId] || '',
          }),
        },
        token
      );
      setActionMessage(
        `Request ${requestId} referred to ${assignee?.name || `team member #${teamMemberId}`} for ${taskLabel}.`
      );
      await refresh();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'Unable to refer request');
    }
  };

  const toggleFeaturedListing = async (item: WorkflowRequest) => {
    try {
      await apiRequest(
        `/workflow/admin/requests/${item.id}/featured`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            isFeatured: !item.isFeatured,
            note: !item.isFeatured
              ? 'Featured by main admin'
              : 'Removed from featured by main admin',
          }),
        },
        token
      );
      setActionMessage(
        `Listing ${item.id} ${item.isFeatured ? 'removed from featured' : 'marked as featured'}`
      );
      await refresh();
    } catch (featureError) {
      setError(featureError instanceof Error ? featureError.message : 'Unable to update featured status');
    }
  };

  const toggleTeamMember = async (memberId: number, isActive: boolean) => {
    try {
      await apiRequest(
        `/workflow/admin/team-members/${memberId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: !isActive }),
        },
        token
      );
      setActionMessage(
        isActive
          ? `Team member ${memberId} temporarily deactivated for 3 days.`
          : `Team member ${memberId} activated.`
      );
      await refresh();
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : 'Unable to update team member');
    }
  };

  const reviewCareerApplication = async (applicationId: number, decision: 'approve' | 'reject') => {
    try {
      const response = await apiRequest<CareerReviewResponse>(
        `/workflow/main/career-applications/${applicationId}/review`,
        {
          method: 'PATCH',
          body: JSON.stringify({ decision }),
        },
        token
      );

      if (response.account?.temporaryPassword) {
        setActionMessage(
          `Account created for ${response.account.email}. Temporary password: ${response.account.temporaryPassword}`
        );
      } else if (response.account?.email) {
        setActionMessage(
          `Account created for ${response.account.email}. User can now login with registered password, reference ID, and registration number.`
        );
      } else {
        setActionMessage(response.message);
      }

      await refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Unable to review application');
    }
  };

  const togglePlatformUser = async (member: PlatformUser) => {
    try {
      await apiRequest(
        `/workflow/admin/platform-users/${member.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: !member.isActive }),
        },
        token
      );
      setActionMessage(
        `${member.name} is now ${
          member.isActive ? 'temporarily deactivated for 3 days' : 'activated'
        }.`
      );
      await refresh();
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : 'Unable to update user');
    }
  };

  const revokeUserSessions = async (member: PlatformUser) => {
    try {
      const response = await apiRequest<{ revokedCount: number }>(
        `/workflow/admin/platform-users/${member.id}/revoke-sessions`,
        {
          method: 'POST',
        },
        token
      );
      setActionMessage(
        `${member.name} logged out from ${response.revokedCount} active session(s).`
      );
      await refresh();
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : 'Unable to revoke sessions');
    }
  };

  const promoteToAdmin = async (member: PlatformUser) => {
    try {
      await apiRequest(
        `/workflow/main/promote-team/${member.id}`,
        {
          method: 'POST',
          body: JSON.stringify({ note: 'Promoted by main admin' }),
        },
        token
      );
      setActionMessage(`${member.name} promoted to admin.`);
      await refresh();
    } catch (promoteError) {
      setError(promoteError instanceof Error ? promoteError.message : 'Unable to promote user');
    }
  };

  const resetUserPassword = async (member: PlatformUser) => {
    try {
      const response = await apiRequest<ResetPasswordResponse>(
        `/workflow/main/accounts/${member.id}/reset-password`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
        token
      );
      setActionMessage(
        `${response.user.email} password reset. Temporary password: ${response.temporaryPassword}`
      );
      await refresh();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset password');
    }
  };

  const runEmergencySessionRevoke = async () => {
    try {
      const response = await apiRequest<{ summary: { revokedSessions: number } }>(
        '/workflow/main/system/emergency-control',
        {
          method: 'POST',
          body: JSON.stringify({
            disableAdmins: false,
            disableTeam: false,
            revokeAllSessions: true,
          }),
        },
        token
      );
      setActionMessage(`Emergency session revoke done. Revoked: ${response.summary.revokedSessions}`);
      await refresh();
    } catch (emergencyError) {
      setError(emergencyError instanceof Error ? emergencyError.message : 'Emergency control failed');
    }
  };

  const handlePromoteOwner = async () => {
    const id = Number(ownerPromoteId);
    if (!Number.isFinite(id) || id <= 0) {
      setOwnerPromoteStatus('Enter a valid user ID.');
      return;
    }
    try {
      await apiRequest(`/api/admin/promote-owner/${id}`, { method: 'PUT' }, token);
      setOwnerPromoteStatus(`User ${id} promoted to owner.`);
      setOwnerPromoteId('');
      window.dispatchEvent(new CustomEvent('zdt:auth-refresh'));
    } catch (error) {
      setOwnerPromoteStatus(error instanceof Error ? error.message : 'Unable to promote user.');
    }
  };

  const promoteToOwner = async (member: PlatformUser) => {
    try {
      await apiRequest(`/api/admin/promote-owner/${member.id}`, { method: 'PUT' }, token);
      setActionMessage(`${member.name} promoted to owner.`);
      window.dispatchEvent(new CustomEvent('zdt:auth-refresh'));
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to promote to owner.');
    }
  };

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

  if (loading && !overview && requests.length === 0 && teamMembers.length === 0 && !error) {
    return (
      <section className="min-h-screen pt-28 pb-16 text-slate-900">
        <div className="page-container zdt-page-stack">
          <div className="zdt-panel-hero rounded-3xl border border-white/20 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-2xl">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Admin Control</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Admin Platform Command</h1>
            <p className="mt-2 text-sm text-white/85">
              Approve listings, remove fake inventory, manage team members, and track company workflow health.
            </p>
          </div>
          <AdminDeskSkeleton />
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen pt-28 pb-16 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="zdt-panel-hero rounded-3xl border border-white/20 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Admin Control</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Admin Platform Command</h1>
          <p className="mt-2 text-sm text-white/85">
            Approve listings, remove fake inventory, manage team members, and track company workflow health.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        {actionMessage && (
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            {actionMessage}
          </p>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Owner Role Toggle</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Promote a user to Owner instantly.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={ownerPromoteId}
                onChange={(event) => setOwnerPromoteId(event.target.value)}
                placeholder="User ID"
                className="h-10 w-32"
              />
              <Button onClick={handlePromoteOwner}>Promote</Button>
            </div>
          </div>
          {ownerPromoteStatus && (
            <p className="mt-3 text-xs text-slate-600">{ownerPromoteStatus}</p>
          )}
        </div>

        <div className="flex justify-end">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700">
              Live Approved: {liveApprovedListings}
            </span>
            <span className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700">
              Pending: {overview?.requests.pendingApproval ?? 0}
            </span>
            {lastSyncAt && (
              <span className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs text-slate-600">
                Last Sync: {lastSyncAt}
              </span>
            )}
            {user.isMainAdmin && (
              <Button variant="destructive" onClick={runEmergencySessionRevoke}>
                Emergency Revoke Sessions
              </Button>
            )}
            <Button variant="outline" onClick={onOpenLayoutUnits} disabled={!onOpenLayoutUnits}>
              Property Management: Layout & Units
            </Button>
            <Button variant="outline" onClick={() => void refresh(true)} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh Now'}
            </Button>
          </div>
        </div>

        {overview && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Total Requests</p>
              <p className="mt-1 text-2xl font-semibold">{overview.requests.total}</p>
            </div>
            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Added Today</p>
              <p className="mt-1 text-2xl font-semibold">
                {overview.dashboard?.propertiesAddedToday ?? 0}
              </p>
            </div>
            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Added This Week</p>
              <p className="mt-1 text-2xl font-semibold">
                {overview.dashboard?.propertiesAddedThisWeek ?? 0}
              </p>
            </div>
            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Pending Approval</p>
              <p className="mt-1 text-2xl font-semibold">{overview.requests.pendingApproval}</p>
            </div>
            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Active Help Requests</p>
              <p className="mt-1 text-2xl font-semibold">
                {overview.dashboard?.activeHelpRequests ?? 0}
              </p>
            </div>
            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Active Team Members</p>
              <p className="mt-1 text-2xl font-semibold">{overview.team.activeMembers}</p>
            </div>
            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Admin Seats</p>
              <p className="mt-1 text-2xl font-semibold">
                {overview.adminSeats.used}/{overview.adminSeats.max}
              </p>
            </div>
          </div>
        )}

        <MainAdminPromotionsPanel
          token={token}
          user={user}
          onActionMessage={(message) => setActionMessage(message)}
          onActionError={(message) => setError(message)}
        />

        <SupportContributionsPanel
          token={token}
          user={user}
          onActionMessage={(message) => setActionMessage(message)}
          onActionError={(message) => setError(message)}
        />

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold">Pending Listing Approvals</h2>
          {pendingListings.length === 0 && (
            <p className="text-sm text-slate-600">No pending sell/rent listings right now.</p>
          )}

          {pendingListings.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">
                  {item.requesterName} - {item.requestType.toUpperCase()} - {item.propertyType}
                </p>
                <span className="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-700">
                  {item.referenceId}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                {item.locality}, {item.city} | Phone: {item.requesterPhone}
              </p>
              <p className="text-xs text-slate-600">
                Featured: {item.isFeatured ? 'Yes' : 'No'}
              </p>
              <p className="text-xs text-slate-600">
                Assigned Team: {(
                  teamMembers.find((member) => member.id === item.assignedToUserId)?.name
                ) || 'Unassigned'}
              </p>
              <p className="text-xs text-slate-600">
                Assigned Work:{' '}
                {item.assignedTaskType === 'add_property'
                  ? 'Add Property'
                  : item.assignedTaskType === 'handle_query'
                    ? 'Handle Query'
                    : item.assignedTaskType === 'call_user'
                      ? 'Call User'
                      : 'Not set'}
                {item.assignedTaskQuery ? ` | Query: ${item.assignedTaskQuery}` : ''}
              </p>
              <Input
                value={listingNotes[item.id] || ''}
                onChange={(event) =>
                  setListingNotes((prev) => ({ ...prev, [item.id]: event.target.value }))
                }
                placeholder="Internal note (optional)"
                className="h-10 bg-white"
              />
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select
                  value={
                    assignTargets[item.id] ??
                    (item.assignedToUserId ? String(item.assignedToUserId) : '')
                  }
                  onChange={(event) =>
                    setAssignTargets((prev) => ({ ...prev, [item.id]: event.target.value }))
                  }
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="">Refer to team member...</option>
                  {activeTeamMembers.map((member) => (
                    <option key={member.id} value={String(member.id)}>
                      {member.name} ({member.email})
                    </option>
                  ))}
                </select>
                <select
                  value={assignTaskTypes[item.id] || item.assignedTaskType || 'call_user'}
                  onChange={(event) =>
                    setAssignTaskTypes((prev) => ({
                      ...prev,
                      [item.id]: event.target.value as 'call_user' | 'add_property' | 'handle_query',
                    }))
                  }
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="call_user">Work: Call User</option>
                  <option value="add_property">Work: Add Property</option>
                  <option value="handle_query">Work: Handle Query</option>
                </select>
                <Button
                  variant="outline"
                  onClick={() => assignRequestToTeamMember(item.id)}
                >
                  Refer To Team
                </Button>
              </div>
              <Input
                value={assignTaskQueries[item.id] ?? item.assignedTaskQuery ?? ''}
                onChange={(event) =>
                  setAssignTaskQueries((prev) => ({ ...prev, [item.id]: event.target.value }))
                }
                placeholder="Work query/instruction (required for Handle Query)"
                className="h-10 bg-white"
              />
              <div className="flex flex-wrap gap-2">
                {adminStatusOptions.map((status) => (
                  <Button
                    key={status}
                    variant="outline"
                    onClick={() => updateListingStatus(item.id, status)}
                  >
                    {status}
                  </Button>
                ))}
                {user.isMainAdmin && (
                  <Button variant="outline" onClick={() => toggleFeaturedListing(item)}>
                    {item.isFeatured ? 'Unfeature' : 'Mark Featured'}
                  </Button>
                )}
                <Button variant="destructive" onClick={() => removeFakeListing(item.id)}>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Remove Fake
                </Button>
              </div>
            </article>
          ))}
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold">Request Referral Desk</h2>
          <p className="text-sm text-slate-600">
            Admin can refer any user request to any active team member for calling and follow-up.
          </p>

          {referralQueue.length === 0 && (
            <p className="text-sm text-slate-600">No active requests to refer.</p>
          )}

          {referralQueue.map((item) => (
            <article key={`ref-${item.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">
                  {item.requesterName} - {item.requestType.toUpperCase()} - {item.propertyType}
                </p>
                <span className="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-700">
                  {item.referenceId}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                {item.locality}, {item.city} |{' '}
                <a className="font-medium text-slate-700 underline" href={`tel:${item.requesterPhone}`}>
                  {item.requesterPhone}
                </a>
              </p>
              <p className="text-xs text-slate-600">
                Interaction: {item.interactionStatus} | Assigned Team: {(
                  teamMembers.find((member) => member.id === item.assignedToUserId)?.name
                ) || 'Unassigned'}
              </p>
              <p className="text-xs text-slate-600">
                Assigned Work:{' '}
                {item.assignedTaskType === 'add_property'
                  ? 'Add Property'
                  : item.assignedTaskType === 'handle_query'
                    ? 'Handle Query'
                    : item.assignedTaskType === 'call_user'
                      ? 'Call User'
                      : 'Not set'}
                {item.assignedTaskQuery ? ` | Query: ${item.assignedTaskQuery}` : ''}
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select
                  value={
                    assignTargets[item.id] ??
                    (item.assignedToUserId ? String(item.assignedToUserId) : '')
                  }
                  onChange={(event) =>
                    setAssignTargets((prev) => ({ ...prev, [item.id]: event.target.value }))
                  }
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="">Refer to team member...</option>
                  {activeTeamMembers.map((member) => (
                    <option key={member.id} value={String(member.id)}>
                      {member.name} ({member.email})
                    </option>
                  ))}
                </select>
                <select
                  value={assignTaskTypes[item.id] || item.assignedTaskType || 'call_user'}
                  onChange={(event) =>
                    setAssignTaskTypes((prev) => ({
                      ...prev,
                      [item.id]: event.target.value as 'call_user' | 'add_property' | 'handle_query',
                    }))
                  }
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="call_user">Work: Call User</option>
                  <option value="add_property">Work: Add Property</option>
                  <option value="handle_query">Work: Handle Query</option>
                </select>
                <Button
                  variant="outline"
                  onClick={() => assignRequestToTeamMember(item.id)}
                >
                  Refer To Team
                </Button>
              </div>
              <Input
                value={assignTaskQueries[item.id] ?? item.assignedTaskQuery ?? ''}
                onChange={(event) =>
                  setAssignTaskQueries((prev) => ({ ...prev, [item.id]: event.target.value }))
                }
                placeholder="Work query/instruction (required for Handle Query)"
                className="h-10 bg-white"
              />
            </article>
          ))}
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold">Manage Team Members</h2>
          {!user.isMainAdmin && (
            <p className="text-sm text-slate-600">
              Main admin can activate/deactivate team accounts. You can still monitor team performance.
            </p>
          )}
          {teamMembers.length === 0 && <p className="text-sm text-slate-600">No team members found.</p>}

          {teamMembers.map((member) => (
            <article key={member.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{member.name}</p>
                  <p className="text-sm text-slate-600">
                    {member.email} | {member.phone || 'No phone'}
                  </p>
                  {!member.isActive && (
                    <p className="mt-1 text-xs font-semibold text-amber-700">
                      {member.deactivatedUntil
                        ? `Temporarily deactivated until ${new Date(member.deactivatedUntil).toLocaleString('en-IN')}`
                        : 'Deactivated'}
                    </p>
                  )}
                </div>
                <Button
                  variant={member.isActive ? 'outline' : 'default'}
                  onClick={() => toggleTeamMember(member.id, member.isActive)}
                  disabled={!user.isMainAdmin}
                >
                  {member.isActive ? 'Deactivate (3 days)' : 'Activate'}
                </Button>
              </div>
            </article>
          ))}
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold">Team Performance (Last 7 Days)</h2>
          {(overview?.teamPerformance || []).length === 0 && (
            <p className="text-sm text-slate-600">No team activity yet.</p>
          )}
          {(overview?.teamPerformance || []).map((member) => (
            <article key={member.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">{member.name}</p>
              <p className="mt-1 text-sm text-slate-700">
                Calls Handled: {member.calls_handled} | Assisted Users: {member.assisted_users}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Listings Added For Users: {member.listings_added_for_users} | Notes: {member.notes_added}
              </p>
            </article>
          ))}
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold">Admin Performance (Last 7 Days)</h2>
          {(overview?.adminPerformance || []).length === 0 && (
            <p className="text-sm text-slate-600">No admin activity yet.</p>
          )}
          {(overview?.adminPerformance || []).map((member) => (
            <article key={member.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">{member.name}</p>
              <p className="mt-1 text-sm text-slate-700">
                Listing Decisions: {member.listing_decisions} | Fake Removed: {member.fake_removed} |
                Featured Updates: {member.featured_updates}
              </p>
            </article>
          ))}
        </div>

        {user.isMainAdmin && (
          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-lg font-semibold">Full Activity Log</h2>
            {activityEntries.length === 0 && (
              <p className="text-sm text-slate-600">No activity logs found.</p>
            )}
            {activityEntries.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {entry.actionKey} ({entry.actorRole || 'system'})
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Actor: {entry.actorName || 'System'} | Entity: {entry.entityType}
                  {entry.entityId ? ` #${entry.entityId}` : ''} | Ref: {entry.requestReference || '-'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(entry.createdAt).toLocaleString('en-IN')}
                </p>
              </article>
            ))}
          </div>
        )}

        {user.isMainAdmin && (
          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-lg font-semibold">Platform Users</h2>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={platformUserQuery}
                onChange={(event) => setPlatformUserQuery(event.target.value)}
                placeholder="Search users by name or email..."
                className="h-10 w-full sm:w-[280px]"
              />
            </div>

            {platformUsers.length === 0 && (
              <p className="text-sm text-slate-600">No users found.</p>
            )}

            {platformUsers
              .filter((member) => {
                const text = platformUserQuery.trim().toLowerCase();
                if (!text) return true;
                return `${member.name} ${member.email}`.toLowerCase().includes(text);
              })
              .map((member) => (
              <article key={member.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {member.name}
                      {member.isMainAdmin ? ' (Main Admin)' : ''}
                    </p>
                    <p className="text-sm text-slate-600">
                      {member.email} | {member.role} | Active devices: {member.activeSessions ?? 0}
                    </p>
                    {!member.isActive && (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        {member.deactivatedUntil
                          ? `Temporarily deactivated until ${new Date(member.deactivatedUntil).toLocaleString('en-IN')}`
                          : 'Deactivated'}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {member.role === 'team_member' && (
                      <Button
                        variant="outline"
                        onClick={() => promoteToAdmin(member)}
                      >
                        Promote To Admin
                      </Button>
                    )}
                    {member.role !== 'owner' && !member.isMainAdmin && (
                      <Button
                        variant="outline"
                        onClick={() => promoteToOwner(member)}
                      >
                        Promote To Owner
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => revokeUserSessions(member)}
                      disabled={member.id === user.id}
                    >
                      Force Logout
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => resetUserPassword(member)}
                    >
                      Reset Password
                    </Button>
                    <Button
                      variant={member.isActive ? 'outline' : 'default'}
                      onClick={() => togglePlatformUser(member)}
                      disabled={member.id === user.id || member.isMainAdmin}
                    >
                      {member.isActive ? 'Deactivate (3 days)' : 'Activate'}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {user.isMainAdmin && (
          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="h-4 w-4 text-blue-700" />
              Career Applications
            </h2>

            {applications.length === 0 && (
              <p className="text-sm text-slate-600">No pending applications.</p>
            )}

            {applications.map((application) => (
              <article key={application.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    {application.fullName} ({application.position === 'admin' ? 'Admin' : 'Team Member'})
                  </p>
                  <span className="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-700">
                    {application.referenceId}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {application.email} | {application.phone} | {application.city}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Registration Number: {application.registrationNumber}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Security Q1: {application.securityQuestionOne}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Security Q2: {application.securityQuestionTwo}
                </p>
                {application.position === 'admin' && (
                  <p className="mt-1 text-sm text-slate-700">
                    Aadhaar: {application.aadhaarMasked || '-'} | PAN: {application.panMasked || '-'}
                  </p>
                )}
                {application.position === 'team_member' && (
                  <p className="mt-1 text-sm text-slate-700">
                    Specialization: {application.teamSpecialization || '-'} | Preferred Shift:{' '}
                    {application.teamPreferredShift || '-'}
                  </p>
                )}
                {application.experience && (
                  <p className="mt-1 text-sm text-slate-700">Experience: {application.experience}</p>
                )}
                <p className="mt-2 text-sm text-slate-700">{application.whyHire}</p>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => reviewCareerApplication(application.id, 'approve')}>Approve</Button>
                  <Button
                    variant="outline"
                    onClick={() => reviewCareerApplication(application.id, 'reject')}
                  >
                    Reject
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
