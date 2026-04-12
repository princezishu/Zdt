import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  BellRing,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Coins,
  FileText,
  Gift,
  Image as ImageIcon,
  KeyRound,
  LockKeyhole,
  MonitorSmartphone,
  ShieldCheck,
  Trash2,
  Upload,
  UserCircle2,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ProfileSkeleton } from '@/components/loading/PageSkeletons';
import ImageCropDialog from '@/components/media/ImageCropDialog';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import { apiRequest } from '@/lib/http';
import { parseApiUser, type AuthUser } from '@/lib/session';
import {
  clearManagedLinkHint,
  getManagedAccessToken,
  isSupabaseConfigured,
} from '@/lib/supabase';

type GovtStatus = 'Not Submitted' | 'Pending Verification' | 'Verified' | 'Rejected';
type ProfilePropertyType = 'Any' | 'Plot' | 'Villa' | 'Flat / Apartment' | 'Commercial';

type ProfilePreferences = {
  budgetRange: string;
  preferredLocation: string;
  propertyType: ProfilePropertyType;
  facingDirection: string;
  furnishedPreference: string;
  language: string;
};

interface ProfilePayload {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: 'user' | 'team_member' | 'admin';
  isMainAdmin: boolean;
  isActive: boolean;
  deactivatedUntil: string | null;
  memberSince: string;
  lastLoginAt: string | null;
  basicInfo: {
    city: string;
    state: string;
    country: string;
    profilePhotoUrl: string;
    emailVerified: boolean;
    phoneVerified: boolean;
  };
  optionalGovernmentVerification: {
    trustScore: number;
    verifiedUserBadge: boolean;
    documents: Record<
      'aadhaar' | 'pan' | 'passport' | 'drivingLicense' | 'addressProof',
      { status: GovtStatus; maskedValue: string }
    >;
  };
  security: {
    twoFactorEnabled: boolean;
    passwordLastChangedAt: string | null;
    activeDevices: number;
    sessions: Array<{
      id: number;
      deviceId: string;
      userAgent: string;
      ipAddress: string;
      createdAt: string;
      lastSeenAt: string;
    }>;
    loginActivity: Array<{
      id: number;
      actionKey: string;
      entityType?: string;
      requestReference?: string | null;
      createdAt: string;
    }>;
  };
  activitySummary: {
    totalActions: number;
    propertiesApproved: number;
    propertiesRejected: number;
    editsMade: number;
    usersHandled: number;
    lastActionAt: string | null;
  };
  myActivity: {
    buyer: {
      savedProperties: number;
      recentlyViewed: number;
      inquiryHistory: number;
      propertyVisitRequests: number;
      purchaseRequestsStatus: number;
    };
    seller: {
      totalPropertiesAdded: number;
      pendingApproval: number;
      approvedListings: number;
      soldProperties: number;
      totalViews: number;
      totalClicks: number;
      totalSavedLiked: number;
      totalInquiries: number;
      totalChatInquiries: number;
      totalVisitRequests: number;
    };
    teamMember: {
      propertiesAddedToday: number;
      totalAssistedListings: number;
      approvalRequestsSent: number;
    };
  };
  analyticsAndPerformance: {
    monthlyListingStats: Array<{ month: string; total: number }>;
    monthlyViewsStats: Array<{ month: string; total: number }>;
    monthlyClicksStats: Array<{ month: string; total: number }>;
    inquiryConversionRate: number;
    clickThroughRate: number;
    saveRate: number;
    earningsOrCommissionOverview: string;
    viewsGraphLabel: string;
    summaryLabel: string;
  };
  preferences: ProfilePreferences;
  communicationCenter: {
    emailUpdates: boolean;
    propertyAlerts: boolean;
    adminAnnouncements: boolean;
  };
}

interface ProfilePageProps {
  token: string;
  user: AuthUser | null;
  onBackHome: () => void;
  onLogout: () => void;
  onOpenWallet?: () => void;
  onOpenReferrals?: () => void;
  onSessionUpdated: (payload: { token: string; user: AuthUser }) => void;
}

type MainAdminMediaCategory = 'new_project' | 'construction_done';
type MainAdminMediaType = 'image' | 'video';

interface MainAdminProfileMediaItem {
  id: number;
  category: MainAdminMediaCategory;
  mediaType: MainAdminMediaType;
  mimeType: string;
  mediaUrl: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

const MAIN_ADMIN_MEDIA_IMAGE_LIMIT_BYTES = 6 * 1024 * 1024;
const MAIN_ADMIN_MEDIA_VIDEO_LIMIT_BYTES = 30 * 1024 * 1024;
const PROFILE_LANGUAGE_OPTIONS = [
  { value: 'en-IN', label: 'English' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'te-IN', label: 'Telugu' },
  { value: 'ta-IN', label: 'Tamil' },
  { value: 'kn-IN', label: 'Kannada' },
  { value: 'mr-IN', label: 'Marathi' },
  { value: 'bn-IN', label: 'Bengali' },
  { value: 'gu-IN', label: 'Gujarati' },
] as const;

function formatDate(value: string | null): string {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function prettyActionName(value: string): string {
  return value
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusChipClasses(status: GovtStatus): string {
  if (status === 'Verified') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (status === 'Pending Verification') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (status === 'Rejected') return 'border-red-300 bg-red-50 text-red-700';
  return 'border-slate-300 bg-slate-50 text-slate-700';
}

function roleLabel(role: ProfilePayload['role'], isMainAdmin: boolean): string {
  if (isMainAdmin) return 'Main Admin';
  if (role === 'admin') return 'Admin';
  if (role === 'team_member') return 'Team Member';
  return 'User';
}

function formatEmployeeId(profile: ProfilePayload): string {
  const prefix = profile.isMainAdmin
    ? 'SADM'
    : profile.role === 'admin'
      ? 'ADM'
      : profile.role === 'team_member'
        ? 'TEAM'
        : 'USR';
  return `${prefix}-${String(profile.id).padStart(6, '0')}`;
}

function resolveAccountStatus(profile: ProfilePayload): { label: string; helper: string } {
  if (!profile.isActive) {
    return { label: 'Suspended', helper: 'Account is disabled' };
  }

  if (profile.deactivatedUntil) {
    const until = new Date(profile.deactivatedUntil);
    if (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()) {
      return {
        label: 'Temporarily Deactivated',
        helper: `Until ${formatDate(profile.deactivatedUntil)}`,
      };
    }
  }

  return { label: 'Active', helper: 'All access enabled' };
}

function mainAdminMediaCategoryLabel(category: MainAdminMediaCategory): string {
  return category === 'new_project' ? 'New Project' : 'Construction Done';
}

function formatLanguageLabel(value: string): string {
  const match = PROFILE_LANGUAGE_OPTIONS.find(
    (option) => option.value.toLowerCase() === value.trim().toLowerCase()
  );
  return match?.label || value;
}

export default function ProfilePage({
  token,
  user,
  onBackHome,
  onLogout,
  onOpenWallet,
  onOpenReferrals,
  onSessionUpdated,
}: ProfilePageProps) {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [pendingPhotoDataUrl, setPendingPhotoDataUrl] = useState('');
  const [pendingPhotoBytes, setPendingPhotoBytes] = useState(0);
  const [photoCropOpen, setPhotoCropOpen] = useState(false);
  const [photoCropSrc, setPhotoCropSrc] = useState('');

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [propertyAlerts, setPropertyAlerts] = useState(true);
  const [adminAnnouncements, setAdminAnnouncements] = useState(true);
  const [preferredLanguage, setPreferredLanguage] = useState('');

  const [aadhaar, setAadhaar] = useState('');
  const [pan, setPan] = useState('');
  const [passport, setPassport] = useState('');
  const [drivingLicense, setDrivingLicense] = useState('');
  const [addressProof, setAddressProof] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deactivateConfirm, setDeactivateConfirm] = useState('');
  const [isLinkingManagedAuth, setIsLinkingManagedAuth] = useState(false);

  const [mainAdminMediaItems, setMainAdminMediaItems] = useState<MainAdminProfileMediaItem[]>([]);
  const [mainAdminMediaLoading, setMainAdminMediaLoading] = useState(false);
  const [mainAdminMediaCategory, setMainAdminMediaCategory] =
    useState<MainAdminMediaCategory>('new_project');
  const [mainAdminMediaTitle, setMainAdminMediaTitle] = useState('');
  const [mainAdminMediaDescription, setMainAdminMediaDescription] = useState('');
  const [pendingMainAdminMediaDataUrl, setPendingMainAdminMediaDataUrl] = useState('');
  const [pendingMainAdminMediaType, setPendingMainAdminMediaType] =
    useState<MainAdminMediaType | null>(null);
  const [pendingMainAdminMediaFileName, setPendingMainAdminMediaFileName] = useState('');
  const [mainAdminMediaDeletingId, setMainAdminMediaDeletingId] = useState<number | null>(null);

  const syncForm = useCallback((next: ProfilePayload) => {
    setProfile(next);
    setName(next.name || '');
    setPhone(next.phone || '');
    setCity(next.basicInfo.city || '');
    setState(next.basicInfo.state || '');
    setCountry(next.basicInfo.country || '');
    setTwoFactorEnabled(next.security.twoFactorEnabled);
    setEmailUpdates(next.communicationCenter.emailUpdates);
    setPropertyAlerts(next.communicationCenter.propertyAlerts);
    setAdminAnnouncements(next.communicationCenter.adminAnnouncements);
    setPreferredLanguage(next.preferences.language || '');
    setAadhaar('');
    setPan('');
    setPassport('');
    setDrivingLicense('');
    setAddressProof('');
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiRequest<{ profile: ProfilePayload }>('/auth/profile', {}, token);
      syncForm(response.profile);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load profile');
    } finally {
      setLoading(false);
    }
  }, [token, syncForm]);

  const loadMainAdminMedia = useCallback(async () => {
    setMainAdminMediaLoading(true);
    try {
      const response = await apiRequest<{ items: MainAdminProfileMediaItem[] }>(
        '/auth/profile/main-admin-media',
        {},
        token
      );
      setMainAdminMediaItems(Array.isArray(response.items) ? response.items : []);
    } catch (loadError) {
      setMainAdminMediaItems([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load admin project/construction media'
      );
    } finally {
      setMainAdminMediaLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void loadProfile();
  }, [token, loadProfile]);

  useEffect(() => {
    if (profile?.role !== 'admin') {
      setMainAdminMediaItems([]);
      setMainAdminMediaLoading(false);
      return;
    }
    void loadMainAdminMedia();
  }, [profile?.role, loadMainAdminMedia]);

  useEffect(() => {
    return () => {
      if (photoCropSrc.startsWith('blob:')) {
        URL.revokeObjectURL(photoCropSrc);
      }
    };
  }, [photoCropSrc]);

  const patchProfile = async (section: string, payload: Record<string, unknown>, success: string) => {
    setSaving(section);
    setError('');
    setMessage('');
    try {
      const response = await apiRequest<{ profile: ProfilePayload }>(
        '/auth/profile',
        { method: 'PATCH', body: JSON.stringify(payload) },
        token
      );
      syncForm(response.profile);
      setMessage(success);
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : 'Unable to update profile');
    } finally {
      setSaving('');
    }
  };

  const uploadProfilePhoto = async () => {
    if (!pendingPhotoDataUrl) return;

    setSaving('photo');
    setError('');
    setMessage('');

    try {
      if (pendingPhotoBytes > 500 * 1024) {
        throw new Error('Photo is still too large after compression. Please choose a smaller image.');
      }

      const response = await apiRequest<{ profile: ProfilePayload }>(
        '/auth/profile/photo-upload',
        { method: 'POST', body: JSON.stringify({ dataUrl: pendingPhotoDataUrl }) },
        token
      );

      syncForm(response.profile);
      setPendingPhotoDataUrl('');
      setPendingPhotoBytes(0);
      setMessage('Profile photo updated.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload profile photo');
    } finally {
      setSaving('');
    }
  };

  const changePassword = async () => {
    setError('');
    setMessage('');
    if (!currentPassword || !newPassword) {
      setError('Current password and new password are required.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    setSaving('password');
    try {
      await apiRequest(
        '/auth/change-password',
        { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) },
        token
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password changed successfully.');
      await loadProfile();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Unable to change password');
    } finally {
      setSaving('');
    }
  };

  const logoutOtherDevices = async () => {
    setSaving('logout-devices');
    setError('');
    setMessage('');
    try {
      const response = await apiRequest<{ revokedCount: number }>(
        '/auth/logout-all',
        { method: 'POST', body: JSON.stringify({ keepCurrent: true }) },
        token
      );
      setMessage(`Logged out from ${response.revokedCount} other device(s).`);
      await loadProfile();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Unable to logout other devices');
    } finally {
      setSaving('');
    }
  };

  const logoutAllDevices = async () => {
    setSaving('logout-all');
    setError('');
    setMessage('');
    try {
      await apiRequest(
        '/auth/logout-all',
        { method: 'POST', body: JSON.stringify({ keepCurrent: false }) },
        token
      );
      onLogout();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Unable to logout all devices');
    } finally {
      setSaving('');
    }
  };

  const linkManagedAuthSession = async () => {
    if (!user || user.role !== 'user') {
      return;
    }

    const managedToken = String(await getManagedAccessToken()).trim();
    if (!managedToken) {
      setError('No active Supabase session was found in this browser. Sign in with Supabase first, then try linking again.');
      return;
    }

    setIsLinkingManagedAuth(true);
    setError('');
    setMessage('');
    try {
      const linkResponse = await apiRequest<{ provider?: string | null; user?: unknown }>(
        '/auth/managed/link',
        {
          method: 'POST',
          headers: {
            'X-Managed-Auth-Token': managedToken,
          },
        },
        token
      );

      let linkedUser: AuthUser | null = null;
      try {
        const response = await apiRequest<{ user: unknown }>('/auth/me', {}, managedToken);
        linkedUser = parseApiUser(response.user);
      } catch {
        const fallbackUser = parseApiUser(linkResponse.user);
        linkedUser = fallbackUser
          ? {
              ...fallbackUser,
              authStrategy: 'managed',
              managedAuthProvider:
                linkResponse.provider || fallbackUser.managedAuthProvider || 'supabase',
            }
          : null;
      }

      if (!linkedUser) {
        throw new Error('Managed auth was linked, but the new session could not be loaded. Sign in again.');
      }

      clearManagedLinkHint();
      onSessionUpdated({ token: managedToken, user: linkedUser });
      setMessage('Supabase sign-in linked successfully.');
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'Unable to link managed auth');
    } finally {
      setIsLinkingManagedAuth(false);
    }
  };

  const deactivateAccount = async () => {
    if (!profile) return;
    if (profile.isMainAdmin) {
      setError('Main admin account cannot be deactivated from this screen.');
      return;
    }
    if (deactivateConfirm.trim().toUpperCase() !== 'DEACTIVATE') {
      setError('Type DEACTIVATE to confirm account deactivation.');
      return;
    }

    setSaving('deactivate');
    setError('');
    try {
      await apiRequest(
        '/auth/deactivate',
        { method: 'POST', body: JSON.stringify({ confirmation: 'DEACTIVATE' }) },
        token
      );
      onLogout();
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : 'Unable to deactivate account');
    } finally {
      setSaving('');
    }
  };

  const onSelectMainAdminMediaFile = (file: File | null) => {
    if (!file) {
      return;
    }

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      setError('Please choose an image or video file.');
      return;
    }

    const maxSize = isImage
      ? MAIN_ADMIN_MEDIA_IMAGE_LIMIT_BYTES
      : MAIN_ADMIN_MEDIA_VIDEO_LIMIT_BYTES;
    if (file.size > maxSize) {
      setError(
        `${isImage ? 'Image' : 'Video'} too large. Maximum size is ${Math.round(
          maxSize / (1024 * 1024)
        )} MB.`
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setError('Unable to read selected file.');
        return;
      }
      setPendingMainAdminMediaDataUrl(reader.result);
      setPendingMainAdminMediaType(isVideo ? 'video' : 'image');
      setPendingMainAdminMediaFileName(file.name || '');
      setError('');
      setMessage('');
    };
    reader.onerror = () => {
      setError('Unable to read selected file.');
    };
    reader.readAsDataURL(file);
  };

  const uploadMainAdminMedia = async () => {
    if (profile?.role !== 'admin') return;
    if (!pendingMainAdminMediaDataUrl || !pendingMainAdminMediaType) {
      setError('Select a photo or video to upload.');
      return;
    }

    setSaving('main-admin-media');
    setError('');
    setMessage('');
    try {
      const response = await apiRequest<{ item: MainAdminProfileMediaItem }>(
        '/auth/profile/main-admin-media',
        {
          method: 'POST',
          body: JSON.stringify({
            category: mainAdminMediaCategory,
            title: mainAdminMediaTitle,
            description: mainAdminMediaDescription,
            dataUrl: pendingMainAdminMediaDataUrl,
          }),
        },
        token
      );
      setMainAdminMediaItems((prev) => [response.item, ...prev.filter((item) => item.id !== response.item.id)]);
      setPendingMainAdminMediaDataUrl('');
      setPendingMainAdminMediaType(null);
      setPendingMainAdminMediaFileName('');
      setMainAdminMediaTitle('');
      setMainAdminMediaDescription('');
      setMessage('Project/construction media uploaded.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload media');
    } finally {
      setSaving('');
    }
  };

  const deleteMainAdminMedia = async (mediaId: number) => {
    if (profile?.role !== 'admin') return;

    setMainAdminMediaDeletingId(mediaId);
    setError('');
    setMessage('');
    try {
      await apiRequest(
        `/auth/profile/main-admin-media/${mediaId}`,
        {
          method: 'DELETE',
        },
        token
      );
      setMainAdminMediaItems((prev) => prev.filter((item) => item.id !== mediaId));
      setMessage('Media item deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete media item');
    } finally {
      setMainAdminMediaDeletingId(null);
    }
  };

  if (!user) {
    return (
      <section className="min-h-screen pb-16 pt-28">
        <div className="page-container rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
          Login required.
        </div>
      </section>
    );
  }

  if (loading) return <ProfileSkeleton />;

  if (!profile) {
    return (
      <section className="min-h-screen pb-16 pt-28">
        <div className="page-container rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
          {error || 'Profile unavailable'}
        </div>
      </section>
    );
  }

  const label = roleLabel(profile.role, profile.isMainAdmin);
  const idLabel = formatEmployeeId(profile);
  const accountStatus = resolveAccountStatus(profile);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
  const browserLanguage = typeof navigator !== 'undefined' ? navigator.language || 'en' : 'en';
  const activeLanguageLabel = preferredLanguage
    ? formatLanguageLabel(preferredLanguage)
    : `Browser default (${browserLanguage})`;
  const canLinkManagedAuth =
    Boolean(user.role === 'user' && !user.isMainAdmin) && isSupabaseConfigured();
  const isManagedLinked = Boolean(user.authStrategy === 'managed' || user.managedAuthProvider);
  const managedAuthLabel = user.managedAuthProvider
    ? user.managedAuthProvider.replace(/\b\w/g, (char) => char.toUpperCase())
    : 'Supabase';

  const docs = profile.optionalGovernmentVerification.documents;
  const documents = [
    { key: 'Aadhaar', ...docs.aadhaar },
    { key: 'PAN', ...docs.pan },
    { key: 'Passport', ...docs.passport },
    { key: 'Driving License', ...docs.drivingLicense },
    { key: 'Address Proof', ...docs.addressProof },
  ];

  const verificationCount = documents.filter((doc) => doc.status === 'Verified').length;
  const verificationProgress =
    documents.length > 0 ? Math.round((verificationCount / documents.length) * 100) : 0;

  const assignedRegion =
    [profile.basicInfo.city, profile.basicInfo.state].filter(Boolean).join(', ') ||
    profile.basicInfo.country ||
    '-';

  const accountType =
    profile.role === 'admin' || profile.role === 'team_member' ? 'Internal' : 'External';

  const department = profile.isMainAdmin
    ? 'Administration'
    : profile.role === 'admin'
      ? 'Admin'
      : profile.role === 'team_member'
        ? 'Support'
        : 'Customer';

  const designation = profile.isMainAdmin
    ? 'Super Admin'
    : profile.role === 'admin'
      ? 'Admin'
      : profile.role === 'team_member'
        ? 'Team Member'
        : 'User';

  const reportingTo = profile.isMainAdmin ? '-' : 'Main Admin';
  const workShift = profile.role === 'team_member' ? 'As Assigned' : 'Flexible';
  const showAdvancedProfileSections = profile.isMainAdmin;

  const professionalItems = [
    { label: 'Department', value: department },
    { label: 'Designation', value: designation },
    { label: 'Work shift / availability', value: workShift },
    { label: 'Assigned city / region', value: assignedRegion },
    { label: 'Reporting to', value: reportingTo },
    { label: 'Account type', value: accountType },
  ];

  const isMain = profile.isMainAdmin;
  const isAdmin = profile.role === 'admin';
  const moduleAccess = [
    { key: 'user_mgmt', label: 'User management', allowed: isMain || isAdmin },
    { key: 'property_approval', label: 'Property approval', allowed: isMain || isAdmin },
    { key: 'reports', label: 'Reports & analytics', allowed: isMain || isAdmin },
    { key: 'content', label: 'Content control', allowed: isMain },
    { key: 'payments', label: 'Payments', allowed: isMain },
  ];

  const activityCards = [
    { label: 'Total actions', value: String(profile.activitySummary.totalActions) },
    { label: 'Properties approved', value: String(profile.activitySummary.propertiesApproved) },
    { label: 'Properties rejected', value: String(profile.activitySummary.propertiesRejected) },
    { label: 'Edits made', value: String(profile.activitySummary.editsMade) },
    { label: 'Users handled', value: String(profile.activitySummary.usersHandled) },
    { label: 'Last action', value: formatDate(profile.activitySummary.lastActionAt) },
  ];

  return (
    <section className="relative min-h-screen overflow-hidden pb-16 pt-24 text-slate-900">
      <div className="pointer-events-none absolute inset-0 section-glow opacity-95" />
      <div className="pointer-events-none absolute inset-0 futuristic-grid opacity-20" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-24 h-[320px] w-[320px] rounded-full bg-blue-400/15 blur-3xl" />

      <div className="page-container relative z-10 zdt-page-stack space-y-4">
        <div className="zdt-panel-hero rounded-3xl border border-white/20 bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-700 p-6 text-white">
          <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr] lg:items-start">
            <div className="flex items-start gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/30 bg-white/15">
                {profile.basicInfo.profilePhotoUrl ? (
                  <img
                    src={profile.basicInfo.profilePhotoUrl}
                    alt={profile.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserCircle2 className="h-10 w-10 text-white/90" aria-hidden="true" />
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-100">ZDT Realty Profile</p>
                <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{profile.name}</h1>
                <p className="mt-1 text-sm text-cyan-50/95">
                  {label}
                  {profile.isMainAdmin ? ' | Super Admin' : ''}
                </p>
                <p className="mt-1 text-xs text-cyan-100/90">
                  {idLabel} | Joined {formatDate(profile.memberSince)} | Last login {formatDate(profile.lastLoginAt)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Email {profile.basicInfo.emailVerified ? 'Verified' : 'Unverified'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Phone {profile.basicInfo.phoneVerified ? 'OTP Verified' : 'Not Verified'}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs"
                    title={accountStatus.helper}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {accountStatus.label}
                  </span>
                </div>
                {onOpenWallet || onOpenReferrals ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {onOpenWallet ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={onOpenWallet}
                        className="bg-white/15 text-white hover:bg-white/25"
                      >
                        <Coins className="mr-2 h-4 w-4" />
                        Dalal Coin Wallet
                      </Button>
                    ) : null}
                    {onOpenReferrals ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={onOpenReferrals}
                        className="bg-white/15 text-white hover:bg-white/25"
                      >
                        <Gift className="mr-2 h-4 w-4" />
                        Referral Rewards
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/20 bg-white/10 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/90">Active Sessions</p>
                <p className="mt-1 text-2xl font-semibold">{profile.security.activeDevices}</p>
              </div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/90">Total Actions</p>
                <p className="mt-1 text-2xl font-semibold">{profile.activitySummary.totalActions}</p>
              </div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/90">Approved</p>
                <p className="mt-1 text-2xl font-semibold">{profile.activitySummary.propertiesApproved}</p>
              </div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/90">Rejected</p>
                <p className="mt-1 text-2xl font-semibold">{profile.activitySummary.propertiesRejected}</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        )}

        <div className={showAdvancedProfileSections ? 'grid gap-4 xl:grid-cols-[1.75fr_1fr]' : 'grid gap-4'}>
          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <UserCircle2 className="h-5 w-5 text-blue-700" />
              Basic Information
            </h2>
            <p className="mt-1 text-sm text-slate-600">Keep your profile accurate and verified.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" />
              <Input value={profile.email} disabled placeholder="Email (verified)" />
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Mobile number" />
              <LgdLocationInput
                value={city}
                onChange={setCity}
                placeholder="City"
                suggestKind="india"
                indiaValueField="village"
              />
              <LgdLocationInput
                value={state}
                onChange={setState}
                placeholder="State"
                suggestKind="state"
                indiaValueField="state"
              />
              <Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Country" />
              <Input value={idLabel} disabled placeholder="Employee/Admin ID" />
              <div className="sm:col-span-2">
                <LgdLocationAccuracyNote />
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Upload Profile Photo</p>
              <p className="mt-1 text-sm text-slate-600">
                Upload a photo (we will auto-compress).
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  type="file"
                  accept="image/*"
                  className="h-11 bg-white"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    event.target.value = '';
                    if (!file) {
                      return;
                    }

                    if (!file.type.startsWith('image/')) {
                      setError('Please select an image file.');
                      return;
                    }

                    setError('');
                    setMessage('');
                    setPendingPhotoDataUrl('');
                    setPendingPhotoBytes(0);
                    setPhotoCropSrc(URL.createObjectURL(file));
                    setPhotoCropOpen(true);
                  }}
                />
                <Button
                  variant="outline"
                  onClick={uploadProfilePhoto}
                  disabled={saving === 'photo' || !pendingPhotoDataUrl}
                  className="h-11"
                >
                  {saving === 'photo' ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
              {pendingPhotoDataUrl ? (
                <div className="mt-3 flex items-center gap-3">
                  <img
                    src={pendingPhotoDataUrl}
                    alt="New profile preview"
                    className="h-16 w-16 rounded-2xl border border-slate-200 object-cover"
                  />
                  <p className="text-xs text-slate-500">
                    Preview only. Click Upload to save.
                  </p>
                </div>
              ) : null}

              <ImageCropDialog
                open={photoCropOpen}
                title="Crop Profile Photo"
                description="Drag to position and zoom to fit (square)."
                src={photoCropSrc}
                aspect={1}
                outputOptions={{ maxSide: 512, mimeType: 'image/webp', quality: 0.86 }}
                maxBytes={500 * 1024}
                onCancel={() => {
                  setPhotoCropOpen(false);
                  setPhotoCropSrc('');
                }}
                onCropped={(result) => {
                  setPendingPhotoDataUrl(result.dataUrl);
                  setPendingPhotoBytes(result.bytes);
                  setPhotoCropOpen(false);
                  setPhotoCropSrc('');
                }}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  patchProfile(
                    'basic',
                    { name, phone, city, state, country },
                    'Basic information updated.'
                  )
                }
                disabled={saving === 'basic'}
              >
                {saving === 'basic' ? 'Saving...' : 'Save Basic Info'}
              </Button>
            </div>
          </div>

          {showAdvancedProfileSections && (
            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
                <BriefcaseBusiness className="h-5 w-5 text-blue-700" />
                Professional Details
              </h2>
              <p className="mt-1 text-sm text-slate-600">Role-based professional view (read-only).</p>

              <div className="mt-4 grid gap-3">
                {professionalItems.map((item) => (
                  <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{item.value || '-'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={showAdvancedProfileSections ? 'grid gap-4 xl:grid-cols-3' : 'grid gap-4 xl:grid-cols-2'}>
          {showAdvancedProfileSections && (
            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
                <ShieldCheck className="h-5 w-5 text-blue-700" />
                Access & Permissions
              </h2>
              <p className="mt-1 text-sm text-slate-600">Read-only role-based permissions.</p>

              <div className="mt-4 space-y-2">
                {moduleAccess.map((module) => (
                  <label
                    key={module.key}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    <span>{module.label}</span>
                    <input
                      type="checkbox"
                      checked={module.allowed}
                      disabled
                      readOnly
                      className="h-4 w-4 accent-blue-700"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Permission History</p>
                <p className="mt-1 text-sm text-slate-700">
                  Role-based (system default). No manual overrides yet.
                </p>
              </div>
            </div>
          )}

          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <LockKeyhole className="h-5 w-5 text-blue-700" />
              Security Information
            </h2>

            <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Password last changed:</span>{' '}
                {formatDate(profile.security.passwordLastChangedAt)}
              </p>
              <p>
                <span className="font-semibold">2FA status:</span>{' '}
                {profile.security.twoFactorEnabled ? 'ON' : 'OFF'}
              </p>
              <p>
                <span className="font-semibold">OTP enabled:</span>{' '}
                {profile.basicInfo.phoneVerified ? 'Yes (phone verified)' : 'No'}
              </p>
              <p>
                <span className="font-semibold">Active sessions:</span> {profile.security.activeDevices}
              </p>
              <p>
                <span className="font-semibold">Last login:</span> {formatDate(profile.lastLoginAt)}
              </p>
            </div>

            {canLinkManagedAuth ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p>
                  <span className="font-semibold">Managed sign-in:</span>{' '}
                  {isManagedLinked ? `Linked to ${managedAuthLabel}` : 'Not linked yet'}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {isManagedLinked
                    ? 'This account can now be accessed with the managed provider.'
                    : 'Link a live Supabase session in this browser to finish migrating this account.'}
                </p>
                {!isManagedLinked ? (
                  <Button
                    variant="outline"
                    onClick={linkManagedAuthSession}
                    disabled={isLinkingManagedAuth}
                    className="mt-3"
                  >
                    <BadgeCheck className="mr-2 h-4 w-4" />
                    {isLinkingManagedAuth ? 'Linking...' : 'Link Current Supabase Session'}
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Enable / Disable 2FA</span>
                <Switch checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} />
              </div>
              <Button
                onClick={() =>
                  patchProfile('security', { twoFactorEnabled }, 'Security settings updated.')
                }
                disabled={saving === 'security'}
              >
                {saving === 'security' ? 'Saving...' : 'Save Security'}
              </Button>

              <div className="grid gap-2">
                <Button
                  variant="outline"
                  onClick={logoutOtherDevices}
                  disabled={saving === 'logout-devices'}
                >
                  <MonitorSmartphone className="mr-2 h-4 w-4" />
                  {saving === 'logout-devices' ? 'Processing...' : 'Logout Other Devices'}
                </Button>
                <Button variant="outline" onClick={logoutAllDevices} disabled={saving === 'logout-all'}>
                  <MonitorSmartphone className="mr-2 h-4 w-4" />
                  {saving === 'logout-all' ? 'Processing...' : 'Logout All Devices'}
                </Button>
              </div>

              <div className="grid gap-2 pt-1">
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="Current password"
                />
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="New password"
                />
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm new password"
                />
                <Button variant="outline" onClick={changePassword} disabled={saving === 'password'}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  {saving === 'password' ? 'Updating...' : 'Change Password'}
                </Button>
              </div>
            </div>
          </div>

          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <BellRing className="h-5 w-5 text-blue-700" />
              Notifications & Preferences
            </h2>
            <p className="mt-1 text-sm text-slate-600">Choose how you receive platform alerts.</p>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Email notifications</span>
                <Switch checked={emailUpdates} onCheckedChange={setEmailUpdates} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>SMS alerts</span>
                <Switch checked={propertyAlerts} onCheckedChange={setPropertyAlerts} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Admin announcements</span>
                <Switch checked={adminAnnouncements} onCheckedChange={setAdminAnnouncements} />
              </div>

              <label className="grid gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.14em] text-slate-500">Language</span>
                <select
                  value={preferredLanguage || 'browser'}
                  onChange={(event) =>
                    setPreferredLanguage(event.target.value === 'browser' ? '' : event.target.value)
                  }
                  className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none ring-blue-300 focus:ring"
                >
                  <option value="browser">Browser default ({browserLanguage})</option>
                  {PROFILE_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p>
                  <span className="font-semibold">Language:</span> {activeLanguageLabel}
                </p>
                <p className="mt-1">
                  <span className="font-semibold">Time zone:</span> {tz}
                </p>
              </div>

              <Button
                onClick={() =>
                  patchProfile(
                    'notifications',
                    {
                      communication: { emailUpdates, propertyAlerts, adminAnnouncements },
                      preferences: { language: preferredLanguage },
                    },
                    'Notification preferences updated.'
                  )
                }
                disabled={saving === 'notifications'}
              >
                {saving === 'notifications' ? 'Saving...' : 'Save Notifications'}
              </Button>
            </div>
          </div>
        </div>

        {showAdvancedProfileSections && (
          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
                <ShieldCheck className="h-5 w-5 text-blue-700" />
                Activity Summary
              </h2>
              <p className="mt-1 text-sm text-slate-600">Shown as quick stats cards.</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activityCards.map((card) => (
                  <div key={card.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{card.label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{card.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
                <ClipboardList className="h-5 w-5 text-blue-700" />
                Audit & Logs
              </h2>
              <p className="mt-1 text-sm text-slate-600">Recent security and platform events.</p>

              <div className="mt-4 space-y-2">
                {(profile.security.loginActivity || []).slice(0, 10).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">{prettyActionName(item.actionKey)}</p>
                    <p className="mt-1 text-xs text-slate-600">{formatDate(item.createdAt)}</p>
                    {(item.entityType || item.requestReference) && (
                      <p className="mt-1 text-xs text-slate-700">
                        {item.entityType ? `Type: ${item.entityType}` : ''}
                        {item.entityType && item.requestReference ? ' | ' : ''}
                        {item.requestReference ? `Ref: ${item.requestReference}` : ''}
                      </p>
                    )}
                  </div>
                ))}

                {profile.security.loginActivity.length === 0 && (
                  <p className="text-sm text-slate-600">No audit entries found.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {profile.isMainAdmin && (
          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <Upload className="h-5 w-5 text-blue-700" />
              Admin Project & Construction Media
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Upload and manage photos/videos for new projects and completed construction updates.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.14em] text-slate-500">Category</span>
                <select
                  value={mainAdminMediaCategory}
                  onChange={(event) =>
                    setMainAdminMediaCategory(event.target.value as MainAdminMediaCategory)
                  }
                  className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none ring-blue-300 focus:ring"
                >
                  <option value="new_project">New Project</option>
                  <option value="construction_done">Construction Done</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.14em] text-slate-500">Title</span>
                <Input
                  value={mainAdminMediaTitle}
                  onChange={(event) => setMainAdminMediaTitle(event.target.value)}
                  placeholder="Project name / update title"
                />
              </label>

              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.14em] text-slate-500">Description</span>
                <textarea
                  value={mainAdminMediaDescription}
                  onChange={(event) => setMainAdminMediaDescription(event.target.value)}
                  placeholder="Short update details..."
                  rows={3}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-blue-300 focus:ring"
                />
              </label>

              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.14em] text-slate-500">Photo or Video</span>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/ogg"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    event.target.value = '';
                    onSelectMainAdminMediaFile(file);
                  }}
                  className="h-11 bg-white"
                />
              </label>
            </div>

            {pendingMainAdminMediaDataUrl ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="relative w-full overflow-hidden rounded-xl bg-slate-200" style={{ aspectRatio: '16 / 9' }}>
                  {pendingMainAdminMediaType === 'video' ? (
                    <video
                      src={pendingMainAdminMediaDataUrl}
                      controls
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <img
                      src={pendingMainAdminMediaDataUrl}
                      alt="Main admin media preview"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  Pending upload: {pendingMainAdminMediaFileName || 'Selected media'}
                </p>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                Supported: PNG/JPEG/WebP, MP4/WebM/OGG. Max 6MB image, 30MB video.
              </p>
              <Button onClick={uploadMainAdminMedia} disabled={saving === 'main-admin-media' || !pendingMainAdminMediaDataUrl}>
                {saving === 'main-admin-media' ? 'Uploading...' : 'Upload Media'}
              </Button>
            </div>

            <div className="mt-5 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Uploaded Media Items</p>
                <p className="text-xs text-slate-500">
                  {mainAdminMediaLoading ? 'Loading...' : `${mainAdminMediaItems.length} item(s)`}
                </p>
              </div>

              {mainAdminMediaLoading ? (
                <p className="mt-3 text-sm text-slate-600">Loading media items...</p>
              ) : mainAdminMediaItems.length === 0 ? (
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  No project/construction media uploaded yet.
                </p>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {mainAdminMediaItems.map((item) => (
                    <div key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="relative w-full overflow-hidden bg-slate-100" style={{ aspectRatio: '16 / 9' }}>
                        {item.mediaType === 'video' ? (
                          <video src={item.mediaUrl} controls className="h-full w-full object-cover" />
                        ) : (
                          <img src={item.mediaUrl} alt={item.title || 'Project media'} className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="space-y-2 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                            {mainAdminMediaCategoryLabel(item.category)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            {item.mediaType === 'video' ? (
                              <Video className="h-3 w-3" />
                            ) : (
                              <ImageIcon className="h-3 w-3" />
                            )}
                            {item.mediaType === 'video' ? 'Video' : 'Photo'}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">
                          {item.title || mainAdminMediaCategoryLabel(item.category)}
                        </p>
                        {item.description ? (
                          <p className="line-clamp-3 text-xs text-slate-600">{item.description}</p>
                        ) : null}
                        <p className="text-[11px] text-slate-500">Uploaded {formatDate(item.createdAt)}</p>
                        <Button
                          variant="outline"
                          onClick={() => deleteMainAdminMedia(item.id)}
                          disabled={mainAdminMediaDeletingId === item.id}
                          className="h-9 w-full"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {mainAdminMediaDeletingId === item.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className={showAdvancedProfileSections ? 'grid gap-4 xl:grid-cols-[1.35fr_1fr]' : 'grid gap-4'}>
          {showAdvancedProfileSections && (
            <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
                <FileText className="h-5 w-5 text-blue-700" />
                Documents (Optional & Secure)
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Government ID upload is optional. Admin can approve without it.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input value={aadhaar} onChange={(event) => setAadhaar(event.target.value)} placeholder="Aadhaar (optional)" />
                <Input value={pan} onChange={(event) => setPan(event.target.value.toUpperCase())} placeholder="PAN (optional)" />
                <Input value={passport} onChange={(event) => setPassport(event.target.value.toUpperCase())} placeholder="Passport (optional)" />
                <Input
                  value={drivingLicense}
                  onChange={(event) => setDrivingLicense(event.target.value.toUpperCase())}
                  placeholder="Driving License (optional)"
                />
                <Input
                  value={addressProof}
                  onChange={(event) => setAddressProof(event.target.value)}
                  placeholder="Address Proof (optional)"
                  className="sm:col-span-2"
                />
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {documents.map((doc) => (
                  <div key={doc.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{doc.key}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{doc.maskedValue || 'Not Submitted'}</p>
                    <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusChipClasses(doc.status)}`}>
                      {doc.status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  onClick={() =>
                    patchProfile(
                      'govt',
                      { governmentIds: { aadhaar, pan, passport, drivingLicense, addressProof } },
                      'Documents submitted.'
                    )
                  }
                  disabled={saving === 'govt'}
                >
                  {saving === 'govt' ? 'Submitting...' : 'Save Documents'}
                </Button>

                <div className="ml-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Verification progress</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {verificationProgress}% ({verificationCount}/{documents.length} verified)
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <AlertTriangle className="h-5 w-5 text-blue-700" />
              Account Status
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Status: <span className="font-semibold">{accountStatus.label}</span>
              {accountStatus.label === 'Temporarily Deactivated' ? ` (${accountStatus.helper})` : ''}
            </p>

            {!profile.isMainAdmin && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-700">Danger Zone</p>
                <p className="mt-1 text-sm text-red-700">
                  Type <span className="font-semibold">DEACTIVATE</span> to deactivate your account.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    value={deactivateConfirm}
                    onChange={(event) => setDeactivateConfirm(event.target.value)}
                    placeholder="Type DEACTIVATE"
                    className="w-full bg-white sm:w-[260px]"
                  />
                  <Button variant="outline" onClick={deactivateAccount} disabled={saving === 'deactivate'}>
                    {saving === 'deactivate' ? 'Processing...' : 'Deactivate Account'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onBackHome}>
            Back to Home
          </Button>
          <Button onClick={onLogout}>Logout</Button>
        </div>
      </div>
    </section>
  );
}
