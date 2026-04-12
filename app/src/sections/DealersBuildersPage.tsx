import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Code2,
  CreditCard,
  DoorOpen,
  DollarSign,
  FileDown,
  Image as ImageIcon,
  Inbox,
  Megaphone,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ImageCropDialog from '@/components/media/ImageCropDialog';
import { apiRequest } from '@/lib/http';
import { uploadImageFile } from '@/lib/mediaUploadApi';
import { parseApiUser, readOrCreateDeviceId, type AuthUser } from '@/lib/session';

type CompanyType = 'dealer' | 'builder';
type CompanyRole = 'owner' | 'member';
type ProjectStatus = 'pending' | 'approved';
type PortalSection = 'overview' | 'branding' | 'projects' | 'team';

const COMPANY_USER_LIMIT = 10;

type FeatureStatus = 'live' | 'coming-soon';

const PORTAL_NAV_ITEMS: Array<{
  id: PortalSection;
  label: string;
  description: string;
  icon: typeof BarChart3;
}> = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Company snapshot, live modules, and quick actions.',
    icon: BarChart3,
  },
  {
    id: 'branding',
    label: 'Branding',
    description: 'Logo, banners, and company presentation assets.',
    icon: Megaphone,
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'Create projects and track approvals from one place.',
    icon: Building2,
  },
  {
    id: 'team',
    label: 'Team',
    description: 'Invite staff, manage seats, and control access.',
    icon: Users,
  },
];

const DASHBOARD_MODULES: Array<{
  title: string;
  description: string;
  icon: typeof Plus;
  status: FeatureStatus;
}> = [
  {
    title: 'Add / Edit Projects',
    description: 'Create projects, update details, and publish with approvals.',
    icon: Plus,
    status: 'live',
  },
  {
    title: 'Add Towers / Blocks',
    description: 'Organize towers, phases, blocks and floors for large communities.',
    icon: Building2,
    status: 'coming-soon',
  },
  {
    title: 'Unit Inventory',
    description: 'Track availability: Available, Sold, Reserved.',
    icon: DoorOpen,
    status: 'coming-soon',
  },
  {
    title: 'Pricing & Offers',
    description: 'Control pricing, limited-time offers, and payment plans.',
    icon: DollarSign,
    status: 'coming-soon',
  },
  {
    title: 'Media Uploads',
    description: 'Upload images, videos, brochures, and floor plan PDFs.',
    icon: ImageIcon,
    status: 'coming-soon',
  },
  {
    title: 'Progress Updates',
    description: 'Add construction milestones and timeline updates.',
    icon: CalendarDays,
    status: 'coming-soon',
  },
  {
    title: 'Leads & Enquiries',
    description: 'Capture leads, track status, assign sales agents.',
    icon: Inbox,
    status: 'coming-soon',
  },
  {
    title: 'Sales Team Control',
    description: 'Role-based access for owner and team members.',
    icon: UserCog,
    status: 'live',
  },
];

const LISTING_TYPES = [
  'Apartments',
  'Villas',
  'Plots',
  'Commercial Spaces',
  'Under-Construction Projects',
  'Ready-to-Move Projects',
] as const;

const PROJECT_PAGE_INCLUDES = [
  'Floor plans',
  'Amenities',
  'Location map',
  'RERA details',
  'Payment plans',
  'Construction timeline',
] as const;

const LEAD_PIPELINE = ['New', 'Contacted', 'Site Visit', 'Closed'] as const;

const MARKETING_TOOLS = [
  { title: 'Featured Listings', description: 'Boost visibility on category pages and search.', icon: Megaphone },
  { title: 'Sponsored Projects', description: 'Top placement for premium projects and launches.', icon: ArrowRight },
  { title: 'Banner Ads', description: 'Home page banner slots for promotions.', icon: Megaphone },
  { title: 'Email + Notifications', description: 'Targeted promotions to relevant buyers.', icon: Inbox },
  { title: 'Social Cards', description: 'One-click social-media-ready project cards.', icon: ImageIcon },
  { title: 'Lead Export (CSV)', description: 'Download leads and share with your team.', icon: FileDown },
];

const COMPLIANCE_FEATURES = [
  { title: 'RERA-Ready Fields', description: 'Structured RERA project details and disclosures.', icon: ShieldCheck },
  { title: 'Document Upload', description: 'Upload approvals, plans and verification documents.', icon: FileDown },
  { title: 'Secure Data', description: 'Role-based access and secure data handling.', icon: ShieldCheck },
  { title: 'Verified Developer Badge', description: 'Earn trust with verification and badges.', icon: CheckCircle2 },
];

const SUBSCRIPTION_PLANS = [
  {
    name: 'Free',
    price: '₹0',
    description: 'Limited listings to get started.',
    features: ['Limited projects', 'Basic profile', 'Standard support'],
  },
  {
    name: 'Pro',
    price: '₹4,999/mo',
    description: 'Unlimited projects + promotions.',
    features: ['Unlimited projects', 'Lead tools', 'Featured boosts', 'Basic analytics'],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'Custom workflows + priority support.',
    features: ['Custom integrations', 'Dedicated support', 'Advanced analytics', 'Team training'],
  },
] as const;

const ADVANCED_LATER = [
  {
    title: 'API Access (Later Phase)',
    description: 'For large developers: sync inventory, pricing, and leads via API.',
    icon: Code2,
  },
  {
    title: 'ERP / CRM Integration (Later Phase)',
    description: 'Integrate your internal ERP/CRM for automated updates and reporting.',
    icon: Code2,
  },
  {
    title: 'AI Demand Heatmaps (Future)',
    description: 'Area-level demand signals, pricing bands, and launch timing insights.',
    icon: BarChart3,
  },
] as const;

const DEVELOPER_PAGE_SUMMARY = [
  'Explain why developers should join',
  'Show how they manage projects and teams',
  'Prove trust and compliance',
  'Push conversion: register or request a demo',
] as const;

interface CompanyInfo {
  id: number;
  code: string;
  name: string;
  type: CompanyType;
  logoUrl: string;
  maxUsers: number;
}

interface BuilderMeResponse {
  company: CompanyInfo | null;
  membership: { role: CompanyRole } | null;
  userCount: number;
  maxUsers: number;
}

interface CompanyUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  companyRole: CompanyRole;
  createdAt: string;
}

interface CompanyUsersResponse {
  users: CompanyUser[];
  userCount: number;
  maxUsers: number;
}

interface BuilderProject {
  id: number;
  publicProjectId?: number | null;
  title: string;
  city: string;
  location: string;
  description: string;
  details: Record<string, unknown>;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: number; name: string; email: string } | null;
}

interface CompanyProjectsResponse {
  projects: BuilderProject[];
}

interface CompanyBanner {
  id: number;
  imageUrl: string;
  title: string;
  subtitle: string;
  linkUrl: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface CompanyBannersResponse {
  banners: CompanyBanner[];
}

interface DealersBuildersPageProps {
  token: string;
  user: AuthUser | null;
  onAuthSuccess: (payload: { token: string; user: AuthUser }) => void;
  onLogout: () => void;
  initialAuthMode?: 'login' | 'register';
  workspaceMode?: boolean;
  onOpenCompanyLogin?: () => void;
  onOpenCompanyRegister?: () => void;
}

export default function DealersBuildersPage({
  token,
  user,
  onAuthSuccess,
  onLogout,
  initialAuthMode = 'login',
  workspaceMode = false,
  onOpenCompanyLogin,
  onOpenCompanyRegister,
}: DealersBuildersPageProps) {
  const isAuthenticated = Boolean(token && user);

  const [me, setMe] = useState<BuilderMeResponse | null>(null);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [projects, setProjects] = useState<BuilderProject[]>([]);
  const [banners, setBanners] = useState<CompanyBanner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingLogoDataUrl, setPendingLogoDataUrl] = useState('');
  const [pendingLogoBytes, setPendingLogoBytes] = useState(0);
  const [logoCropOpen, setLogoCropOpen] = useState(false);
  const [logoCropSrc, setLogoCropSrc] = useState('');

  const [pendingBannerDataUrl, setPendingBannerDataUrl] = useState('');
  const [pendingBannerBytes, setPendingBannerBytes] = useState(0);
  const [bannerCropOpen, setBannerCropOpen] = useState(false);
  const [bannerCropSrc, setBannerCropSrc] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>(initialAuthMode);
  const [portalSection, setPortalSection] = useState<PortalSection>('overview');

  const company = me?.company ?? null;
  const membership = me?.membership ?? null;
  const isOwner = membership?.role === 'owner';

  const title = useMemo(() => {
    if (!company) return 'Dealer/Builder Portal';
    return workspaceMode ? `${company.name} Workspace` : `${company.name} Portal`;
  }, [company, workspaceMode]);

  const clearBannerAfterDelay = () => {
    window.setTimeout(() => setMessage(''), 2500);
  };

  const loadAll = async () => {
    if (!token) {
      setMe(null);
      setUsers([]);
      setProjects([]);
      setBanners([]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const meResponse = await apiRequest<BuilderMeResponse>('/builder/me', {}, token);
      setMe(meResponse);

      if (!meResponse.company || !meResponse.membership) {
        setUsers([]);
        setProjects([]);
        setBanners([]);
        return;
      }

      const [projectsResponse, bannersResponse, usersResponse] = await Promise.all([
        apiRequest<CompanyProjectsResponse>('/builder/company/projects', {}, token),
        apiRequest<CompanyBannersResponse>('/builder/company/banners', {}, token),
        meResponse.membership.role === 'owner'
          ? apiRequest<CompanyUsersResponse>('/builder/company/users', {}, token)
          : Promise.resolve({ users: [], userCount: 0, maxUsers: meResponse.maxUsers }),
      ]);

      setProjects(projectsResponse.projects || []);
      setBanners(bannersResponse.banners || []);
      setUsers(usersResponse.users || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load dealer/builder portal');
      setMe(null);
      setUsers([]);
      setProjects([]);
      setBanners([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    return () => {
      if (logoCropSrc.startsWith('blob:')) {
        URL.revokeObjectURL(logoCropSrc);
      }
    };
  }, [logoCropSrc]);

  useEffect(() => {
    return () => {
      if (bannerCropSrc.startsWith('blob:')) {
        URL.revokeObjectURL(bannerCropSrc);
      }
    };
  }, [bannerCropSrc]);

  useEffect(() => {
    setAuthMode(initialAuthMode);
  }, [initialAuthMode]);

  useEffect(() => {
    setPortalSection('overview');
  }, [company?.id]);

  const uploadCompanyLogo = async () => {
    if (!token || !pendingLogoDataUrl) return;

    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (pendingLogoBytes > 600 * 1024) {
        throw new Error('Logo is still too large after compression. Please choose a smaller image.');
      }

      await apiRequest(
        '/builder/company/logo',
        { method: 'POST', body: JSON.stringify({ dataUrl: pendingLogoDataUrl }) },
        token
      );

      setPendingLogoDataUrl('');
      setPendingLogoBytes(0);
      setMessage('Company logo updated.');
      clearBannerAfterDelay();
      await loadAll();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload company logo');
    } finally {
      setLoading(false);
    }
  };

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginCompanyCode, setLoginCompanyCode] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [showOtpRecovery, setShowOtpRecovery] = useState(false);
  const [otpRecoveryEmail, setOtpRecoveryEmail] = useState('');
  const [otpRecoveryCode, setOtpRecoveryCode] = useState('');
  const [otpRecoverySent, setOtpRecoverySent] = useState(false);
  const [otpRecoveryDevCode, setOtpRecoveryDevCode] = useState('');
  const [otpRecoverySending, setOtpRecoverySending] = useState(false);
  const [otpRecoveryVerifying, setOtpRecoveryVerifying] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [companyType, setCompanyType] = useState<CompanyType>('builder');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [registerSubmitting, setRegisterSubmitting] = useState(false);

  const [workerName, setWorkerName] = useState('');
  const [workerEmail, setWorkerEmail] = useState('');
  const [workerPhone, setWorkerPhone] = useState('');
  const [workerPassword, setWorkerPassword] = useState('');
  const [workerSubmitting, setWorkerSubmitting] = useState(false);

  const [projectTitle, setProjectTitle] = useState('');
  const [projectCity, setProjectCity] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [projectImageUrl, setProjectImageUrl] = useState('');
  const [projectImageUploading, setProjectImageUploading] = useState(false);
  const [projectDescription, setProjectDescription] = useState('');
  const [projectSubmitting, setProjectSubmitting] = useState(false);

  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerSubtitle, setBannerSubtitle] = useState('');
  const [bannerLinkUrl, setBannerLinkUrl] = useState('');
  const [bannerSortOrder, setBannerSortOrder] = useState(100);
  const [bannerSubmitting, setBannerSubmitting] = useState(false);
  const [bannerActionId, setBannerActionId] = useState<number | null>(null);

  const openOtpRecoveryMode = () => {
    setShowOtpRecovery(true);
    setOtpRecoverySent(false);
    setOtpRecoveryCode('');
    setOtpRecoveryDevCode('');
    setOtpRecoveryEmail(loginEmail.trim());
    setError('');
    setMessage('');
  };

  const closeOtpRecoveryMode = () => {
    setShowOtpRecovery(false);
    setOtpRecoverySent(false);
    setOtpRecoveryCode('');
    setOtpRecoveryDevCode('');
  };

  const handleCompanyLogin = async () => {
    setError('');
    setMessage('');

    if (!loginEmail.trim() || !loginEmail.includes('@')) {
      setError('Valid email is required.');
      return;
    }
    if (!loginPassword.trim()) {
      setError('Password is required.');
      return;
    }
    if (!loginCompanyCode.trim()) {
      setError('Company register number is required.');
      return;
    }

    setLoginSubmitting(true);
    try {
      const response = await apiRequest<{ token: string; user: unknown }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
          companyCode: loginCompanyCode.trim().toUpperCase(),
          deviceId: readOrCreateDeviceId(),
        }),
      });

      const parsed = parseApiUser(response.user);
      if (!parsed) {
        throw new Error('Invalid user payload');
      }

      onAuthSuccess({ token: response.token, user: parsed });
      setLoginPassword('');
       setLoginCompanyCode('');
      setMessage('Logged in. Loading company...');
      clearBannerAfterDelay();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to login');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleRequestCompanyOtp = async () => {
    setError('');
    setMessage('');

    const email = otpRecoveryEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setError('Valid company email is required to send OTP.');
      return;
    }

    setOtpRecoverySending(true);
    try {
      const response = await apiRequest<{ message?: string; devOtp?: string }>(
        '/auth/company-access/request-otp',
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        }
      );
      setOtpRecoverySent(true);
      setOtpRecoveryDevCode(response.devOtp || '');
      setMessage(response.message || 'OTP sent to your company email.');
      clearBannerAfterDelay();
    } catch (otpError) {
      setError(otpError instanceof Error ? otpError.message : 'Unable to send OTP');
    } finally {
      setOtpRecoverySending(false);
    }
  };

  const handleVerifyCompanyOtp = async () => {
    setError('');
    setMessage('');

    const email = otpRecoveryEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setError('Valid company email is required.');
      return;
    }
    if (otpRecoveryCode.trim().length !== 6) {
      setError('Enter the 6-digit OTP.');
      return;
    }

    setOtpRecoveryVerifying(true);
    try {
      const response = await apiRequest<{ token: string; user: unknown; message?: string }>(
        '/auth/company-access/verify-otp',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            otp: otpRecoveryCode.trim(),
            deviceId: readOrCreateDeviceId(),
          }),
        }
      );

      const parsed = parseApiUser(response.user);
      if (!parsed) {
        throw new Error('Invalid user payload');
      }

      onAuthSuccess({ token: response.token, user: parsed });
      setLoginPassword('');
      setLoginCompanyCode('');
      setOtpRecoveryCode('');
      setOtpRecoveryDevCode('');
      setShowOtpRecovery(false);
      setMessage(response.message || 'OTP verified. Loading company...');
      clearBannerAfterDelay();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Unable to verify OTP');
    } finally {
      setOtpRecoveryVerifying(false);
    }
  };

  const handleRegisterCompany = async () => {
    setError('');
    setMessage('');

    if (!companyName.trim()) {
      setError('Company name is required.');
      return;
    }
    if (!ownerName.trim()) {
      setError('Owner name is required.');
      return;
    }
    if (!ownerEmail.trim() || !ownerEmail.includes('@')) {
      setError('Valid owner email is required.');
      return;
    }
    if (!ownerPhone.trim() || ownerPhone.trim().length < 8) {
      setError('Valid owner phone number is required.');
      return;
    }
    if (!ownerPassword.trim() || ownerPassword.trim().length < 8) {
      setError('Owner password must be at least 8 characters.');
      return;
    }

    setRegisterSubmitting(true);
    try {
      const response = await apiRequest<{ token: string; user: unknown; company: CompanyInfo }>(
        '/builder/register-company',
        {
          method: 'POST',
          body: JSON.stringify({
            companyName: companyName.trim(),
            companyType,
            ownerName: ownerName.trim(),
            ownerEmail: ownerEmail.trim(),
            ownerPhone: ownerPhone.trim(),
            ownerPassword: ownerPassword,
            deviceId: readOrCreateDeviceId(),
          }),
        }
      );
      setCompanyName('');
      setOwnerName('');
      setLoginEmail(ownerEmail.trim().toLowerCase());
      setOwnerEmail('');
      setOwnerPhone('');
      setOwnerPassword('');
      setLoginCompanyCode(String(response.company.code || '').trim().toUpperCase());
      setLoginPassword('');
      openLoginAuthView();
      setMessage(
        `Company created. Your company register number is ${response.company.code}. Use it on company login.`
      );
      clearBannerAfterDelay();
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : 'Unable to register company');
    } finally {
      setRegisterSubmitting(false);
    }
  };

  const handleAddWorker = async () => {
    if (!token) return;
    setError('');
    setMessage('');

    if (!workerName.trim()) {
      setError('Worker name is required.');
      return;
    }
    if (!workerEmail.trim() || !workerEmail.includes('@')) {
      setError('Valid worker email is required.');
      return;
    }
    if (!workerPassword.trim() || workerPassword.trim().length < 8) {
      setError('Worker password must be at least 8 characters.');
      return;
    }

    setWorkerSubmitting(true);
    try {
      await apiRequest('/builder/company/users', {
        method: 'POST',
        body: JSON.stringify({
          name: workerName.trim(),
          email: workerEmail.trim(),
          phone: workerPhone.trim(),
          password: workerPassword,
        }),
      }, token);

      setWorkerName('');
      setWorkerEmail('');
      setWorkerPhone('');
      setWorkerPassword('');
      setMessage('Worker added.');
      clearBannerAfterDelay();
      await loadAll();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Unable to add worker');
    } finally {
      setWorkerSubmitting(false);
    }
  };

  const handleRemoveWorker = async (workerId: number) => {
    if (!token) return;
    setError('');
    setMessage('');

    try {
      await apiRequest(`/builder/company/users/${workerId}`, { method: 'DELETE' }, token);
      setMessage('Worker removed from company.');
      clearBannerAfterDelay();
      await loadAll();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove worker');
    }
  };

  const handleCreateProject = async () => {
    if (!token) return;
    setError('');
    setMessage('');

    if (!projectTitle.trim()) {
      setError('Project title is required.');
      return;
    }

    setProjectSubmitting(true);
    try {
      await apiRequest(
        '/builder/company/projects',
        {
          method: 'POST',
          body: JSON.stringify({
            title: projectTitle.trim(),
            city: projectCity.trim(),
            location: projectLocation.trim(),
            description: projectDescription.trim(),
            details: projectImageUrl.trim()
              ? {
                  imageUrl: projectImageUrl.trim(),
                }
              : {},
          }),
        },
        token
      );

      setProjectTitle('');
      setProjectCity('');
      setProjectLocation('');
      setProjectImageUrl('');
      setProjectDescription('');
      setMessage(isOwner ? 'Project added.' : 'Project submitted for owner approval.');
      clearBannerAfterDelay();
      await loadAll();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to add project');
    } finally {
      setProjectSubmitting(false);
    }
  };

  const handleProjectImageSelection = async (file: File | null) => {
    if (!token || !file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }

    setProjectImageUploading(true);
    setError('');
    setMessage('');
    try {
      const response = await uploadImageFile(token, 'builder_project', file, {
        maxSide: 1800,
        mimeType: 'image/webp',
        quality: 0.9,
      });
      setProjectImageUrl(response.imageUrl);
      setMessage('Project image uploaded.');
      clearBannerAfterDelay();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload project image');
    } finally {
      setProjectImageUploading(false);
    }
  };

  const handleApproveProject = async (projectId: number) => {
    if (!token) return;
    setError('');
    setMessage('');

    try {
      await apiRequest(`/builder/company/projects/${projectId}/approve`, { method: 'PATCH' }, token);
      setMessage('Project approved.');
      clearBannerAfterDelay();
      await loadAll();
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'Unable to approve project');
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    if (!token) return;
    setError('');
    setMessage('');

    try {
      await apiRequest(`/builder/company/projects/${projectId}`, { method: 'DELETE' }, token);
      setMessage('Project removed.');
      clearBannerAfterDelay();
      await loadAll();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to remove project');
    }
  };

  const handleAddBanner = async () => {
    if (!token) return;
    setError('');
    setMessage('');

    if (!pendingBannerDataUrl) {
      setError('Please choose a banner image.');
      return;
    }

    setBannerSubmitting(true);
    try {
      if (pendingBannerBytes > 900 * 1024) {
        throw new Error('Banner is too large after compression. Please choose a smaller image.');
      }

      await apiRequest(
        '/builder/company/banners',
        {
          method: 'POST',
          body: JSON.stringify({
            dataUrl: pendingBannerDataUrl,
            title: bannerTitle.trim(),
            subtitle: bannerSubtitle.trim(),
            linkUrl: bannerLinkUrl.trim(),
            isActive: true,
            sortOrder: bannerSortOrder,
          }),
        },
        token
      );

      setPendingBannerDataUrl('');
      setPendingBannerBytes(0);
      setBannerTitle('');
      setBannerSubtitle('');
      setBannerLinkUrl('');
      setBannerSortOrder(100);
      setMessage('Banner added.');
      clearBannerAfterDelay();
      await loadAll();
    } catch (bannerError) {
      setError(bannerError instanceof Error ? bannerError.message : 'Unable to add banner');
    } finally {
      setBannerSubmitting(false);
    }
  };

  const toggleBannerActive = async (bannerId: number, nextActive: boolean) => {
    if (!token) return;
    setError('');
    setMessage('');

    setBannerActionId(bannerId);
    try {
      await apiRequest(
        `/builder/company/banners/${bannerId}`,
        { method: 'PATCH', body: JSON.stringify({ isActive: nextActive }) },
        token
      );

      setMessage('Banner updated.');
      clearBannerAfterDelay();
      await loadAll();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Unable to update banner');
    } finally {
      setBannerActionId(null);
    }
  };

  const deleteBanner = async (bannerId: number) => {
    if (!token) return;
    setError('');
    setMessage('');

    setBannerActionId(bannerId);
    try {
      await apiRequest(`/builder/company/banners/${bannerId}`, { method: 'DELETE' }, token);
      setMessage('Banner removed.');
      clearBannerAfterDelay();
      await loadAll();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove banner');
    } finally {
      setBannerActionId(null);
    }
  };

  const userLimitText = useMemo(() => {
    const count = me?.userCount ?? 0;
    const max = me?.maxUsers ?? 10;
    return `${count}/${max} users`;
  }, [me]);

  const approvedProjectCount = useMemo(
    () => projects.filter((project) => project.status === 'approved').length,
    [projects]
  );
  const pendingProjectCount = useMemo(
    () => projects.filter((project) => project.status === 'pending').length,
    [projects]
  );
  const activeBannerCount = useMemo(
    () => banners.filter((banner) => banner.isActive).length,
    [banners]
  );
  const liveModuleCount = useMemo(
    () => DASHBOARD_MODULES.filter((module) => module.status === 'live').length,
    []
  );
  const maxUserSeats = me?.maxUsers ?? COMPANY_USER_LIMIT;
  const showBrandingSection = portalSection === 'overview' || portalSection === 'branding';
  const showProjectsSection = portalSection === 'overview' || portalSection === 'projects';
  const showTeamSection = portalSection === 'overview' || portalSection === 'team';

  const portalHeading = useMemo(() => {
    switch (portalSection) {
      case 'branding':
        return 'Branding & company profile';
      case 'projects':
        return 'Project publishing workspace';
      case 'team':
        return 'Team access & user seats';
      default:
        return 'Company overview';
    }
  }, [portalSection]);

  const portalDescription = useMemo(() => {
    switch (portalSection) {
      case 'branding':
        return 'Keep your logo, banners, and public presentation assets up to date.';
      case 'projects':
        return 'Add new launches, track approvals, and keep project content ready for publishing.';
      case 'team':
        return isOwner
          ? 'Invite company members, manage access, and keep the right people in the portal.'
          : 'View your company access details. Only owners can add or remove team members.';
      default:
        return 'Track projects, branding, modules, and team activity from one builder/company dashboard.';
    }
  }, [isOwner, portalSection]);

  const openLoginAuthView = () => {
    closeOtpRecoveryMode();
    if (onOpenCompanyLogin) {
      onOpenCompanyLogin();
      return;
    }
    setAuthMode('login');
  };

  const openRegisterAuthView = () => {
    closeOtpRecoveryMode();
    if (onOpenCompanyRegister) {
      onOpenCompanyRegister();
      return;
    }
    setAuthMode('register');
  };

  const scrollToRegister = () => {
    openRegisterAuthView();
  };

  const openSalesEmail = () => {
    window.location.href = 'mailto:sales@zdtrealty.com?subject=ZDT%20Realty%20Developer%20Partnership';
  };

  const renderCompanyWorkspace = () => {
    if (!company || !membership) {
      return null;
    }

    return (
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10">
                {company.logoUrl ? (
                  <img
                    src={company.logoUrl}
                    alt={`${company.name} logo`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <BriefcaseBusiness className="h-7 w-7 text-white/75" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">{company.type}</p>
                <p className="mt-1 truncate text-lg font-semibold">{company.name}</p>
                <p className="mt-1 text-xs text-white/70">Code {company.code}</p>
                <p className="mt-2 text-sm text-white/80">
                  Role: <span className="font-semibold capitalize text-white">{membership.role}</span>
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/55">Seats</p>
                <p className="mt-1 text-sm font-semibold text-white">{userLimitText}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/55">Status</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {pendingProjectCount > 0 ? `${pendingProjectCount} pending approvals` : 'All caught up'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Portal Navigation
            </p>
            <div className="mt-3 grid gap-2">
              {PORTAL_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = portalSection === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPortalSection(item.id)}
                    className={`rounded-2xl border px-3 py-3 text-left transition ${
                      isActive
                        ? 'border-blue-200 bg-blue-50 shadow-sm'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${
                          isActive ? 'bg-blue-700 text-white' : 'bg-white text-slate-600'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Projects</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{projects.length}</p>
              <p className="mt-1 text-xs text-slate-500">{approvedProjectCount} approved</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Banners</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{activeBannerCount}</p>
              <p className="mt-1 text-xs text-slate-500">Active on home page</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Modules</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {liveModuleCount}/{DASHBOARD_MODULES.length}
              </p>
              <p className="mt-1 text-xs text-slate-500">Already available</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Team Seats</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{me?.userCount ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">Of {maxUserSeats} seats used</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={loadAll} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button variant="outline" onClick={onLogout}>
              Logout
            </Button>
          </div>
        </aside>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              Dedicated Company Portal
            </p>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">{portalHeading}</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">{portalDescription}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-blue-700 text-white hover:bg-blue-800"
                  onClick={() => setPortalSection('projects')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Project
                </Button>
                <Button variant="outline" onClick={() => setPortalSection('branding')}>
                  <Megaphone className="mr-2 h-4 w-4" />
                  Branding
                </Button>
                {isOwner ? (
                  <Button variant="outline" onClick={() => setPortalSection('team')}>
                    <Users className="mr-2 h-4 w-4" />
                    Team
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Approved Projects
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{approvedProjectCount}</p>
              <p className="mt-2 text-sm text-slate-600">Published-ready company inventory.</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Pending Review
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{pendingProjectCount}</p>
              <p className="mt-2 text-sm text-slate-600">
                {isOwner ? 'Needs your approval.' : 'Waiting for owner approval.'}
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Active Banners
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{activeBannerCount}</p>
              <p className="mt-2 text-sm text-slate-600">Visible promotional creatives.</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Live Modules
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{liveModuleCount}</p>
              <p className="mt-2 text-sm text-slate-600">Current tools ready for your team.</p>
            </div>
          </div>

          {showBrandingSection ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      {company.logoUrl ? (
                        <img
                          src={company.logoUrl}
                          alt={`${company.name} logo`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <BriefcaseBusiness className="h-7 w-7 text-slate-500" aria-hidden="true" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Company Profile
                      </p>
                      <p className="mt-1 text-xl font-semibold text-slate-900">{company.name}</p>
                      <p className="mt-2 text-sm text-slate-600">
                        Company Code: <span className="font-semibold text-slate-900">{company.code}</span>
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Role: <span className="font-semibold capitalize text-slate-900">{membership.role}</span>
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Type: <span className="font-semibold capitalize text-slate-900">{company.type}</span>
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    {userLimitText}
                  </span>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Company Logo</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {isOwner
                      ? 'Upload or replace your logo. This appears across developer/company listings.'
                      : 'Your company owner can update the public logo for this workspace.'}
                  </p>

                  {isOwner ? (
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
                          setPendingLogoDataUrl('');
                          setPendingLogoBytes(0);
                          setLogoCropSrc(URL.createObjectURL(file));
                          setLogoCropOpen(true);
                        }}
                      />
                      {pendingLogoDataUrl ? (
                        <Button
                          variant="outline"
                          onClick={uploadCompanyLogo}
                          disabled={loading}
                          className="h-11"
                        >
                          {loading ? 'Uploading...' : company.logoUrl ? 'Replace Logo' : 'Upload Logo'}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {pendingLogoDataUrl ? (
                    <div className="mt-3 flex items-center gap-3">
                      <img
                        src={pendingLogoDataUrl}
                        alt="New company logo preview"
                        className="h-16 w-16 rounded-2xl border border-slate-200 object-cover"
                      />
                      <p className="text-xs text-slate-500">Preview only. Click upload to save.</p>
                    </div>
                  ) : null}

                  <ImageCropDialog
                    open={logoCropOpen}
                    title="Crop Company Logo"
                    description="Drag to position and zoom to fit (square)."
                    src={logoCropSrc}
                    aspect={1}
                    outputOptions={{ maxSide: 640, mimeType: 'image/webp', quality: 0.9 }}
                    maxBytes={600 * 1024}
                    onCancel={() => {
                      setLogoCropOpen(false);
                      setLogoCropSrc('');
                    }}
                    onCropped={(result) => {
                      setPendingLogoDataUrl(result.dataUrl);
                      setPendingLogoBytes(result.bytes);
                      setLogoCropOpen(false);
                      setLogoCropSrc('');
                    }}
                  />
                </div>
                
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {DASHBOARD_MODULES.map((module) => {
                    const Icon = module.icon;
                    return (
                      <div key={module.title} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{module.title}</p>
                              <p className="mt-1 text-xs text-slate-600">{module.description}</p>
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                              module.status === 'live'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-slate-200 bg-slate-50 text-slate-600'
                            }`}
                          >
                            {module.status === 'live' ? 'Live' : 'Soon'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Megaphone className="h-4 w-4 text-blue-700" />
                      Company Banners
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Upload banner ads for your company. Active banners will appear on the Portal Home page.
                    </p>
                  </div>
                  <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    Home Page
                  </span>
                </div>

                {isOwner ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Add Banner</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Recommended: wide image (e.g. 1600x900, 16:9). We auto-compress on upload.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                        Enable banners to publish them on the portal home page.
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3">
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
                          setPendingBannerDataUrl('');
                          setPendingBannerBytes(0);
                          setBannerCropSrc(URL.createObjectURL(file));
                          setBannerCropOpen(true);
                        }}
                      />

                      {pendingBannerDataUrl ? (
                        <div
                          className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                          style={{ aspectRatio: '16 / 9' }}
                        >
                          <img
                            src={pendingBannerDataUrl}
                            alt="New banner preview"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        </div>
                      ) : null}

                      <ImageCropDialog
                        open={bannerCropOpen}
                        title="Crop Banner"
                        description="Drag to position and zoom to fit (16:9)."
                        src={bannerCropSrc}
                        aspect={16 / 9}
                        outputOptions={{ maxSide: 1600, mimeType: 'image/webp', quality: 0.9 }}
                        maxBytes={900 * 1024}
                        onCancel={() => {
                          setBannerCropOpen(false);
                          setBannerCropSrc('');
                        }}
                        onCropped={(result) => {
                          setPendingBannerDataUrl(result.dataUrl);
                          setPendingBannerBytes(result.bytes);
                          setBannerCropOpen(false);
                          setBannerCropSrc('');
                        }}
                      />

                      <Input
                        value={bannerTitle}
                        onChange={(event) => setBannerTitle(event.target.value)}
                        placeholder="Banner title (optional)"
                        className="h-11 bg-white"
                      />
                      <Input
                        value={bannerSubtitle}
                        onChange={(event) => setBannerSubtitle(event.target.value)}
                        placeholder="Banner subtitle (optional)"
                        className="h-11 bg-white"
                      />
                      <Input
                        value={bannerLinkUrl}
                        onChange={(event) => setBannerLinkUrl(event.target.value)}
                        placeholder="Banner link URL (optional)"
                        className="h-11 bg-white"
                      />
                      <Input
                        type="number"
                        value={String(bannerSortOrder)}
                        onChange={(event) => setBannerSortOrder(Number(event.target.value || 100))}
                        placeholder="Sort order"
                        className="h-11 bg-white"
                      />

                      {pendingBannerDataUrl ? (
                        <div className="flex justify-end">
                          <Button
                            onClick={handleAddBanner}
                            disabled={bannerSubmitting}
                            className="h-11 bg-blue-700 text-white hover:bg-blue-800"
                          >
                            {bannerSubmitting ? 'Uploading...' : 'Add Banner'}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Only company owners can add or remove banners.
                  </div>
                )}

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {banners.length === 0 ? (
                    <p className="text-sm text-slate-600">No banners yet.</p>
                  ) : (
                    banners.map((banner) => (
                      <div key={banner.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        <div className="relative w-full bg-slate-100" style={{ aspectRatio: '16 / 9' }}>
                          <img
                            src={banner.imageUrl}
                            alt={banner.title || 'Company banner'}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-slate-950/10 to-transparent" />
                          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
                            <div>
                              {banner.title ? (
                                <p className="text-sm font-semibold text-white">{banner.title}</p>
                              ) : null}
                              {banner.subtitle ? (
                                <p className="mt-0.5 text-xs text-white/85">{banner.subtitle}</p>
                              ) : null}
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                                banner.isActive
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : 'border-slate-200 bg-slate-50 text-slate-700'
                              }`}
                            >
                              {banner.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>

                        <div className="p-4">
                          {banner.linkUrl ? (
                            <p className="break-all text-xs text-slate-500">
                              Link: <span className="font-semibold text-slate-700">{banner.linkUrl}</span>
                            </p>
                          ) : (
                            <p className="text-xs text-slate-500">No link attached.</p>
                          )}

                          {isOwner ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                className="rounded-xl"
                                onClick={() => toggleBannerActive(banner.id, !banner.isActive)}
                                disabled={bannerActionId === banner.id}
                              >
                                {banner.isActive ? 'Disable' : 'Enable'}
                              </Button>
                              <Button
                                variant="outline"
                                className="rounded-xl text-red-700 hover:text-red-800"
                                onClick={() => deleteBanner(banner.id)}
                                disabled={bannerActionId === banner.id}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {showProjectsSection ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Plus className="h-4 w-4 text-blue-700" />
                  Add New Project
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {isOwner
                    ? 'Owner projects are added as approved.'
                    : 'Projects you add will be pending until the owner approves.'}
                </p>
                <div className="mt-4 grid gap-3">
                  <Input
                    value={projectTitle}
                    onChange={(event) => setProjectTitle(event.target.value)}
                    placeholder="Project Title"
                    className="h-11"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      value={projectCity}
                      onChange={(event) => setProjectCity(event.target.value)}
                      placeholder="City (optional)"
                      className="h-11"
                    />
                    <Input
                      value={projectLocation}
                      onChange={(event) => setProjectLocation(event.target.value)}
                      placeholder="Locality/Area (optional)"
                      className="h-11"
                    />
                  </div>
                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      event.target.value = '';
                      void handleProjectImageSelection(file);
                    }}
                    className="h-11"
                  />
                  {projectImageUrl ? (
                    <div
                      className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                      style={{ aspectRatio: '16 / 9' }}
                    >
                      <img
                        src={projectImageUrl}
                        alt="Project preview"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <div className="absolute bottom-2 right-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setProjectImageUrl('')}
                        >
                          Remove Image
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <Textarea
                    value={projectDescription}
                    onChange={(event) => setProjectDescription(event.target.value)}
                    placeholder="Project Details (optional)"
                    className="min-h-28"
                  />
                  <Button
                    onClick={handleCreateProject}
                    disabled={projectSubmitting || projectImageUploading}
                    className="h-11 bg-blue-700 text-white hover:bg-blue-800"
                  >
                    {projectImageUploading
                      ? 'Uploading image...'
                      : projectSubmitting
                        ? 'Submitting...'
                        : 'Submit Project'}
                  </Button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <CheckCircle2 className="h-4 w-4 text-blue-700" />
                      Company Projects
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {isOwner ? 'Approve or remove pending projects.' : 'Track project approval status.'}
                    </p>
                  </div>
                  <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    {projects.length} total
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {projects.length === 0 ? (
                    <p className="text-sm text-slate-600">No projects yet.</p>
                  ) : (
                    projects.map((project) => (
                      <div
                        key={project.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold text-slate-900">{project.title}</p>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                                  project.status === 'approved'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : 'border-amber-200 bg-amber-50 text-amber-800'
                                }`}
                              >
                                {project.status === 'approved' ? 'Approved' : 'Pending'}
                              </span>
                            </div>
                            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                              {project.createdBy ? `Added by ${project.createdBy.name}` : 'Created in portal'}
                            </p>
                            {(project.city || project.location) && (
                              <p className="mt-2 text-sm text-slate-600">
                                {[project.city, project.location].filter(Boolean).join(', ')}
                              </p>
                            )}
                            {project.description ? (
                              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                                {project.description}
                              </p>
                            ) : null}
                          </div>
                          {isOwner ? (
                            <div className="flex flex-wrap gap-2 lg:flex-col">
                              {project.status === 'pending' ? (
                                <Button
                                  variant="outline"
                                  className="justify-start"
                                  onClick={() => handleApproveProject(project.id)}
                                >
                                  Approve
                                </Button>
                              ) : null}
                              <Button
                                variant="outline"
                                className="justify-start text-red-700 hover:text-red-800"
                                onClick={() => handleDeleteProject(project.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {showTeamSection ? (
            isOwner ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <UserPlus className="h-4 w-4 text-blue-700" />
                      Add Company User
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Add worker accounts. You can remove workers anytime.
                    </p>
                  </div>
                  <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    Max {maxUserSeats} users
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Input
                    value={workerName}
                    onChange={(event) => setWorkerName(event.target.value)}
                    placeholder="Worker Name"
                    className="h-11"
                  />
                  <Input
                    value={workerPhone}
                    onChange={(event) => setWorkerPhone(event.target.value)}
                    placeholder="Worker Phone (optional)"
                    className="h-11"
                  />
                  <Input
                    value={workerEmail}
                    onChange={(event) => setWorkerEmail(event.target.value)}
                    placeholder="Worker Email"
                    className="h-11 md:col-span-2"
                  />
                  <Input
                    value={workerPassword}
                    onChange={(event) => setWorkerPassword(event.target.value)}
                    placeholder="Worker Password"
                    type="password"
                    className="h-11 md:col-span-2"
                  />
                  <div className="flex justify-end md:col-span-2">
                    <Button
                      onClick={handleAddWorker}
                      disabled={workerSubmitting}
                      className="h-11 bg-blue-700 text-white hover:bg-blue-800"
                    >
                      {workerSubmitting ? 'Adding...' : 'Add Worker'}
                    </Button>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <p className="text-sm font-semibold text-slate-900">Company Users</p>
                  {users.length === 0 ? (
                    <p className="text-sm text-slate-600">No users loaded yet.</p>
                  ) : (
                    users.map((companyUser) => (
                      <div
                        key={companyUser.id}
                        className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {companyUser.name}{' '}
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              ({companyUser.companyRole})
                            </span>
                          </p>
                          <p className="text-sm text-slate-600">{companyUser.email}</p>
                          {companyUser.phone ? (
                            <p className="text-xs text-slate-500">{companyUser.phone}</p>
                          ) : null}
                        </div>
                        {companyUser.companyRole === 'member' ? (
                          <Button
                            variant="outline"
                            className="justify-start text-red-700 hover:text-red-800"
                            onClick={() => handleRemoveWorker(companyUser.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove Worker
                          </Button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Team access</p>
                <p className="mt-2 text-sm text-slate-600">
                  You are signed in as a company member. Owners manage team seats, invitations, and user removal.
                </p>
              </div>
            )
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section className={`min-h-screen pb-16 text-slate-900 ${workspaceMode ? 'pt-10' : 'pt-28'}`}>
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-white/20 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">
            {workspaceMode && company ? `${company.type} workspace` : 'ZDT Realty'}
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/85">
            {workspaceMode && company
              ? 'A dedicated company dashboard for branding, project publishing, and team access.'
              : `Register your company, add up to ${COMPANY_USER_LIMIT} users, and manage projects with owner approval.`}
          </p>
        </div>

        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {!isAuthenticated ? (
          <>
            <div className="grid gap-4">
              {authMode === 'login' ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <BriefcaseBusiness className="h-4 w-4 text-blue-700" />
                    Company Login
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Dealers and builders must sign in with email, password, and company register number.
                  </p>
                  <div className="mt-4 grid gap-3 md:max-w-xl">
                    <Input
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      placeholder="Company Email"
                      className="h-11"
                    />
                    <Input
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                      placeholder="Password"
                      type="password"
                      className="h-11"
                    />
                    <Input
                      value={loginCompanyCode}
                      onChange={(event) => setLoginCompanyCode(event.target.value)}
                      placeholder="Company Register Number"
                      className="h-11"
                    />
                    <Button
                      onClick={handleCompanyLogin}
                      disabled={loginSubmitting}
                      className="h-11 bg-blue-700 text-white hover:bg-blue-800"
                    >
                      {loginSubmitting ? 'Logging in...' : 'Login to Company Portal'}
                    </Button>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={openOtpRecoveryMode}
                      className="text-sm font-semibold text-blue-700 hover:text-blue-800"
                    >
                      Forgot register number or password?
                    </button>
                  </div>
                  {showOtpRecovery ? (
                    <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                      <p className="text-sm font-semibold text-slate-900">Recover with Email OTP</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Enter your registered company email. After OTP verification, you will be logged in.
                      </p>
                      <div className="mt-3 grid gap-3">
                        <Input
                          value={otpRecoveryEmail}
                          onChange={(event) => setOtpRecoveryEmail(event.target.value)}
                          placeholder="Company Email"
                          className="h-11 bg-white"
                        />
                        <Button
                          type="button"
                          onClick={handleRequestCompanyOtp}
                          disabled={otpRecoverySending}
                          className="h-11 bg-blue-700 text-white hover:bg-blue-800"
                        >
                          {otpRecoverySending
                            ? 'Sending OTP...'
                            : otpRecoverySent
                              ? 'Resend OTP'
                              : 'Send OTP'}
                        </Button>
                        {otpRecoverySent ? (
                          <>
                            <Input
                              value={otpRecoveryCode}
                              onChange={(event) =>
                                setOtpRecoveryCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                              }
                              inputMode="numeric"
                              placeholder="Enter 6-digit OTP"
                              className="h-11 bg-white"
                            />
                            <Button
                              type="button"
                              onClick={handleVerifyCompanyOtp}
                              disabled={otpRecoveryVerifying || otpRecoveryCode.trim().length !== 6}
                              className="h-11 bg-slate-900 text-white hover:bg-slate-800"
                            >
                              {otpRecoveryVerifying ? 'Verifying OTP...' : 'Verify OTP and Login'}
                            </Button>
                          </>
                        ) : null}
                        {otpRecoveryDevCode ? (
                          <p className="rounded-lg border border-amber-200 bg-amber-100 px-3 py-2 text-xs text-amber-800">
                            Dev OTP: <strong>{otpRecoveryDevCode}</strong>
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={closeOtpRecoveryMode}
                          className="justify-self-start text-xs font-semibold text-slate-600 hover:text-slate-900"
                        >
                          Close recovery
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <p className="mt-4 text-sm text-slate-600">
                    New dealer or builder?{' '}
                    <button
                      type="button"
                      onClick={openRegisterAuthView}
                      className="font-semibold text-blue-700 hover:text-blue-800"
                    >
                      Create company account
                    </button>
                  </p>
                </div>
              ) : (
                <div id="register-company" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Users className="h-4 w-4 text-blue-700" />
                    Register Company
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Register as dealer/builder and get your company register number for future logins.
                  </p>
                  <div className="mt-4 grid gap-3 md:max-w-xl">
                    <Input
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      placeholder="Company Name"
                      className="h-11"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select value={companyType} onValueChange={(value) => setCompanyType(value as CompanyType)}>
                        <SelectTrigger className="h-11 bg-white text-slate-900">
                          <SelectValue placeholder="Company Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-white text-slate-900">
                          <SelectItem value="builder">Builder</SelectItem>
                          <SelectItem value="dealer">Dealer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={ownerPhone}
                        onChange={(event) => setOwnerPhone(event.target.value)}
                        placeholder="Owner Phone Number"
                        className="h-11"
                      />
                    </div>
                    <Input
                      value={ownerName}
                      onChange={(event) => setOwnerName(event.target.value)}
                      placeholder="Owner Name"
                      className="h-11"
                    />
                    <Input
                      value={ownerEmail}
                      onChange={(event) => setOwnerEmail(event.target.value)}
                      placeholder="Owner Email"
                      className="h-11"
                    />
                    <Input
                      value={ownerPassword}
                      onChange={(event) => setOwnerPassword(event.target.value)}
                      placeholder="Owner Password"
                      type="password"
                      className="h-11"
                    />
                    <Button
                      onClick={handleRegisterCompany}
                      disabled={registerSubmitting}
                      className="h-11 bg-blue-700 text-white hover:bg-blue-800"
                    >
                      {registerSubmitting ? 'Creating company...' : 'Register Company'}
                    </Button>
                  </div>
                  <p className="mt-4 text-sm text-slate-600">
                    Already registered?{' '}
                    <button
                      type="button"
                      onClick={openLoginAuthView}
                      className="font-semibold text-blue-700 hover:text-blue-800"
                    >
                      Go to company login
                    </button>
                  </p>
                </div>
              )}
            </div>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Developer Dashboard Features</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    A modern workspace for builders and dealers to manage projects, teams, and growth.
                  </p>
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 sm:mt-0">
                  Modules
                </p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {DASHBOARD_MODULES.map((module) => (
                  <div
                    key={module.title}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                        <module.icon className="h-5 w-5" />
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                          module.status === 'live'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-amber-300 bg-amber-50 text-amber-700'
                        }`}
                      >
                        {module.status === 'live' ? 'Live' : 'Coming soon'}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{module.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{module.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-0 lg:grid-cols-[260px_1fr]">
                <div className="bg-slate-950 p-6 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                    Mock Dashboard
                  </p>
                  <p className="mt-2 text-xl font-semibold">Developer Console</p>
                  <p className="mt-2 text-sm text-white/75">
                    Quick preview of how your team will manage projects and leads.
                  </p>

                  <div className="mt-5 space-y-2 text-sm">
                    <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
                      <Plus className="h-4 w-4 text-cyan-200" />
                      Projects
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
                      <DoorOpen className="h-4 w-4 text-cyan-200" />
                      Inventory
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
                      <Inbox className="h-4 w-4 text-cyan-200" />
                      Leads
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
                      <DollarSign className="h-4 w-4 text-cyan-200" />
                      Pricing
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
                      <ShieldCheck className="h-4 w-4 text-cyan-200" />
                      Compliance
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
                  <div className="grid gap-3 sm:grid-cols-4">
                    {LEAD_PIPELINE.map((step) => (
                      <div key={step} className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{step}</p>
                        <p className="mt-2 text-2xl font-bold text-slate-900">12</p>
                        <p className="mt-1 text-xs text-slate-500">Leads</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
                      <p className="text-sm font-semibold text-slate-900">Latest Leads</p>
                      <div className="mt-3 space-y-2 text-sm">
                        {[
                          { name: 'Aman', intent: 'Apartment', status: 'New' },
                          { name: 'Sara', intent: 'Villa', status: 'Contacted' },
                          { name: 'Rahul', intent: 'Plot', status: 'Site Visit' },
                        ].map((lead) => (
                          <div
                            key={`${lead.name}-${lead.status}`}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                          >
                            <div>
                              <p className="font-semibold text-slate-900">{lead.name}</p>
                              <p className="text-xs text-slate-500">{lead.intent}</p>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {lead.status}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex justify-end">
                        <Button variant="outline" className="rounded-xl" disabled title="Coming soon">
                          <FileDown className="mr-2 h-4 w-4" />
                          Download CSV
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
                      <p className="text-sm font-semibold text-slate-900">Construction Progress</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Share milestone updates to build trust with buyers.
                      </p>
                      <div className="mt-4 space-y-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-semibold text-slate-900">Tower A</span>
                            <span className="text-slate-600">62%</span>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full w-[62%] rounded-full bg-blue-700" />
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-semibold text-slate-900">Phase 1</span>
                            <span className="text-slate-600">83%</span>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full w-[83%] rounded-full bg-emerald-600" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900">Project Listing Capabilities</h2>
              <p className="mt-1 text-sm text-slate-600">
                List every major project type and build a complete project page.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {LISTING_TYPES.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Each project page can include</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {PROJECT_PAGE_INCLUDES.map((field) => (
                      <div key={field} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm text-slate-700">{field}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Designed for trust + conversion</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Showcase your inventory clearly, answer buyer questions, and speed up site visits.
                  </p>
                  <div className="mt-4 grid gap-2">
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <ShieldCheck className="h-4 w-4 text-blue-700" />
                      Verified fields and compliance-ready structure
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <Megaphone className="h-4 w-4 text-blue-700" />
                      Promotion slots to boost qualified leads
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <Users className="h-4 w-4 text-blue-700" />
                      Team access control for sales operations
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900">Lead & CRM System</h2>
              <p className="mt-1 text-sm text-slate-600">
                Leads are captured from Buy/Rent/Invest pages and direct enquiries, then tracked end-to-end.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {LEAD_PIPELINE.map((step, index) => (
                  <div key={step} className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                      {index + 1}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                      {step}
                    </span>
                    {index < LEAD_PIPELINE.length - 1 ? (
                      <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Assign to Agents</p>
                  <p className="mt-1 text-sm text-slate-600">Route leads to sales agents for fast follow-up.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Download CSV</p>
                  <p className="mt-1 text-sm text-slate-600">Export leads anytime for internal reporting.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Notes + Site Visits</p>
                  <p className="mt-1 text-sm text-slate-600">Track buyer intent and site visit outcomes.</p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900">Marketing & Promotion Tools</h2>
              <p className="mt-1 text-sm text-slate-600">
                Built-in tools to get more qualified buyers to your projects.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MARKETING_TOOLS.map((tool) => (
                  <div
                    key={tool.title}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                  >
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                      <tool.icon className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{tool.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{tool.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900">Compliance & Trust</h2>
              <p className="mt-1 text-sm text-slate-600">
                Build confidence with structured fields, verification, and secure access.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {COMPLIANCE_FEATURES.map((feature) => (
                  <div key={feature.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{feature.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{feature.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Pricing / Subscription Plans</h2>
                  <p className="mt-1 text-sm text-slate-600">Start free, upgrade when you're ready.</p>
                </div>
                <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 sm:mt-0">
                  <CreditCard className="h-4 w-4 text-blue-700" />
                  Plans
                </span>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {SUBSCRIPTION_PLANS.map((plan) => (
                  <div key={plan.name} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{plan.name}</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{plan.price}</p>
                    <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
                    <div className="mt-4 space-y-2 text-sm text-slate-700">
                      {plan.features.map((feature) => (
                        <div key={feature} className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 flex gap-2">
                      {plan.name === 'Enterprise' ? (
                        <Button className="w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800" onClick={openSalesEmail}>
                          Contact Sales
                        </Button>
                      ) : plan.name === 'Pro' ? (
                        <Button className="w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800" onClick={openSalesEmail}>
                          Talk to Sales
                        </Button>
                      ) : (
                        <Button className="w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800" onClick={scrollToRegister}>
                          Start Free
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900">Trusted by Growing Teams</h2>
              <p className="mt-1 text-sm text-slate-600">A few sample partner highlights (replace with real logos later).</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {['Skyline', 'NovaBuild', 'UrbanNest', 'GreenStone', 'MetroHub', 'PrimeVillas'].map((brand) => (
                  <div
                    key={brand}
                    className="flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-700"
                  >
                    {brand}
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-slate-900">"Leads became structured and easy to track."</p>
                  <p className="mt-2 text-sm text-slate-600">Operations Manager, Builder Partner</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-slate-900">"Faster follow-ups and better conversions."</p>
                  <p className="mt-2 text-sm text-slate-600">Sales Lead, Developer Partner</p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900">Optional Advanced (Later Phase)</h2>
              <p className="mt-1 text-sm text-slate-600">
                For larger developers who want deeper automation and analytics.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ADVANCED_LATER.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900">Summary</h2>
              <p className="mt-1 text-sm text-slate-600">
                A great developer page should do four things:
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {DEVELOPER_PAGE_SUMMARY.map((point) => (
                  <div key={point} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-semibold text-slate-800">{point}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900" />
                <div className="relative p-6 text-white sm:p-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Call To Action</p>
                  <h2 className="mt-2 text-3xl font-bold leading-tight">
                    Partner with ZDT Realty & scale your projects faster
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-white/85">
                    Register your company, list projects, and manage your team with a clean approval workflow.
                  </p>
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <Button
                      className="h-11 rounded-xl bg-white text-slate-900 hover:bg-white/90"
                      onClick={scrollToRegister}
                    >
                      Register as Developer
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/15"
                      onClick={openSalesEmail}
                    >
                      Talk to Sales
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            {!company || !membership ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-lg font-semibold text-slate-900">No company linked</p>
                <p className="mt-2 text-sm text-slate-600">
                  This account is logged in, but it is not linked to any dealer/builder company.
                  Ask your boss to add you, or logout and register a company.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={onLogout}>
                    Logout
                  </Button>
                  <Button variant="outline" onClick={loadAll} disabled={loading}>
                    {loading ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </div>
              </div>
            ) : (
              workspaceMode ? (
                renderCompanyWorkspace()
              ) : (
              <div className="space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        {company.logoUrl ? (
                          <img
                            src={company.logoUrl}
                            alt={`${company.name} logo`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <BriefcaseBusiness className="h-7 w-7 text-slate-500" aria-hidden="true" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Company ID</p>
                        <p className="mt-1 text-xl font-bold text-slate-900">{company.code}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Role: <span className="font-semibold text-slate-900">{membership.role}</span> | {userLimitText}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Type: <span className="font-semibold text-slate-700">{company.type}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={loadAll} disabled={loading}>
                        {loading ? 'Refreshing...' : 'Refresh'}
                      </Button>
                      <Button variant="outline" onClick={onLogout}>
                        Logout
                      </Button>
                    </div>
                  </div>

                  {isOwner && !company.logoUrl ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">Company Logo</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Upload your logo (auto-compressed). This will appear on your developer listings.
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
                            setPendingLogoDataUrl('');
                            setPendingLogoBytes(0);
                            setLogoCropSrc(URL.createObjectURL(file));
                            setLogoCropOpen(true);
                          }}
                        />
                        {pendingLogoDataUrl ? (
                          <Button
                            variant="outline"
                            onClick={uploadCompanyLogo}
                            disabled={loading}
                            className="h-11"
                          >
                            {loading ? 'Uploading...' : 'Upload'}
                          </Button>
                        ) : null}
                      </div>
                      {pendingLogoDataUrl ? (
                        <div className="mt-3 flex items-center gap-3">
                          <img
                            src={pendingLogoDataUrl}
                            alt="New company logo preview"
                            className="h-16 w-16 rounded-2xl border border-slate-200 object-cover"
                          />
                          <p className="text-xs text-slate-500">Preview only. Click Upload to save.</p>
                        </div>
                      ) : null}

                      <ImageCropDialog
                        open={logoCropOpen}
                        title="Crop Company Logo"
                        description="Drag to position and zoom to fit (square)."
                        src={logoCropSrc}
                        aspect={1}
                        outputOptions={{ maxSide: 640, mimeType: 'image/webp', quality: 0.9 }}
                        maxBytes={600 * 1024}
                        onCancel={() => {
                          setLogoCropOpen(false);
                          setLogoCropSrc('');
                        }}
                        onCropped={(result) => {
                          setPendingLogoDataUrl(result.dataUrl);
                          setPendingLogoBytes(result.bytes);
                          setLogoCropOpen(false);
                          setLogoCropSrc('');
                        }}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Megaphone className="h-4 w-4 text-blue-700" />
                        Company Banners
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        Upload banner ads for your company. Active banners will appear on the Portal Home page.
                      </p>
                    </div>
                    <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                      Home Page
                    </span>
                  </div>

                  {isOwner && banners.length === 0 ? (
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-900">Add Banner</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Recommended: wide image (e.g. 1600x900, 16:9). We auto-compress on upload.
                        </p>

                        <div className="mt-3 grid gap-3">
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
                              setPendingBannerDataUrl('');
                              setPendingBannerBytes(0);
                              setBannerCropSrc(URL.createObjectURL(file));
                              setBannerCropOpen(true);
                            }}
                          />

                          {pendingBannerDataUrl ? (
                            <div
                              className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                              style={{ aspectRatio: '16 / 9' }}
                            >
                              <img
                                src={pendingBannerDataUrl}
                                alt="New banner preview"
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                            </div>
                          ) : null}

                          <ImageCropDialog
                            open={bannerCropOpen}
                            title="Crop Banner"
                            description="Drag to position and zoom to fit (16:9)."
                            src={bannerCropSrc}
                            aspect={16 / 9}
                            outputOptions={{ maxSide: 1600, mimeType: 'image/webp', quality: 0.9 }}
                            maxBytes={900 * 1024}
                            onCancel={() => {
                              setBannerCropOpen(false);
                              setBannerCropSrc('');
                            }}
                            onCropped={(result) => {
                              setPendingBannerDataUrl(result.dataUrl);
                              setPendingBannerBytes(result.bytes);
                              setBannerCropOpen(false);
                              setBannerCropSrc('');
                            }}
                          />

                          <Input
                            value={bannerTitle}
                            onChange={(event) => setBannerTitle(event.target.value)}
                            placeholder="Banner title (optional)"
                            className="h-11 bg-white"
                          />
                          <Input
                            value={bannerSubtitle}
                            onChange={(event) => setBannerSubtitle(event.target.value)}
                            placeholder="Banner subtitle (optional)"
                            className="h-11 bg-white"
                          />
                          <Input
                            value={bannerLinkUrl}
                            onChange={(event) => setBannerLinkUrl(event.target.value)}
                            placeholder="Banner link URL (optional)"
                            className="h-11 bg-white"
                          />
                          <Input
                            type="number"
                            value={String(bannerSortOrder)}
                            onChange={(event) => setBannerSortOrder(Number(event.target.value || 100))}
                            placeholder="Sort order"
                            className="h-11 bg-white"
                          />

                          {pendingBannerDataUrl ? (
                            <div className="flex justify-end">
                              <Button
                                onClick={handleAddBanner}
                                disabled={bannerSubmitting}
                                className="h-11 bg-blue-700 text-white hover:bg-blue-800"
                              >
                                {bannerSubmitting ? 'Uploading...' : 'Add Banner'}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-900">How It Works</p>
                        <div className="mt-3 space-y-2 text-sm text-slate-700">
                          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            Upload banner image and optional link
                          </div>
                          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            Set active to show on Portal Home
                          </div>
                          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            Remove anytime
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {banners.length === 0 ? (
                      <p className="text-sm text-slate-600">No banners yet.</p>
                    ) : (
                      banners.map((banner) => (
                        <div key={banner.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                          <div className="relative w-full bg-slate-100" style={{ aspectRatio: '16 / 9' }}>
                            <img
                              src={banner.imageUrl}
                              alt={banner.title || 'Company banner'}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-slate-950/10 to-transparent" />
                            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
                              <div>
                                {banner.title ? (
                                  <p className="text-sm font-semibold text-white">{banner.title}</p>
                                ) : null}
                                {banner.subtitle ? (
                                  <p className="mt-0.5 text-xs text-white/85">{banner.subtitle}</p>
                                ) : null}
                              </div>
                              <span
                                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                                  banner.isActive
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : 'border-slate-200 bg-slate-50 text-slate-700'
                                }`}
                              >
                                {banner.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </div>

                          <div className="p-4">
                            {banner.linkUrl ? (
                              <p className="text-xs text-slate-500 break-all">
                                Link: <span className="font-semibold text-slate-700">{banner.linkUrl}</span>
                              </p>
                            ) : (
                              <p className="text-xs text-slate-500">No link attached.</p>
                            )}

                            {isOwner ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  className="rounded-xl"
                                  onClick={() => toggleBannerActive(banner.id, !banner.isActive)}
                                  disabled={bannerActionId === banner.id}
                                >
                                  {banner.isActive ? 'Disable' : 'Enable'}
                                </Button>
                                <Button
                                  variant="outline"
                                  className="rounded-xl text-red-700 hover:text-red-800"
                                  onClick={() => deleteBanner(banner.id)}
                                  disabled={bannerActionId === banner.id}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remove
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Plus className="h-4 w-4 text-blue-700" />
                      Add New Project
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {isOwner
                        ? 'Owner projects are added as approved.'
                        : 'Projects you add will be pending until the owner approves.'}
                    </p>
                    <div className="mt-4 grid gap-3">
                      <Input
                        value={projectTitle}
                        onChange={(event) => setProjectTitle(event.target.value)}
                        placeholder="Project Title"
                        className="h-11"
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          value={projectCity}
                          onChange={(event) => setProjectCity(event.target.value)}
                          placeholder="City (optional)"
                          className="h-11"
                        />
                        <Input
                          value={projectLocation}
                          onChange={(event) => setProjectLocation(event.target.value)}
                          placeholder="Locality/Area (optional)"
                          className="h-11"
                        />
                      </div>
                      <Input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          event.target.value = '';
                          void handleProjectImageSelection(file);
                        }}
                        className="h-11"
                      />
                      {projectImageUrl ? (
                        <div
                          className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                          style={{ aspectRatio: '16 / 9' }}
                        >
                          <img
                            src={projectImageUrl}
                            alt="Project preview"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          <div className="absolute bottom-2 right-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setProjectImageUrl('')}
                            >
                              Remove Image
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <Textarea
                        value={projectDescription}
                        onChange={(event) => setProjectDescription(event.target.value)}
                        placeholder="Project Details (optional)"
                        className="min-h-28"
                      />
                      <Button
                        onClick={handleCreateProject}
                        disabled={projectSubmitting || projectImageUploading}
                        className="h-11 bg-blue-700 text-white hover:bg-blue-800"
                      >
                        {projectImageUploading
                          ? 'Uploading image...'
                          : projectSubmitting
                            ? 'Submitting...'
                            : 'Submit Project'}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <CheckCircle2 className="h-4 w-4 text-blue-700" />
                      Company Projects
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {isOwner ? 'Approve or remove pending projects.' : 'Track project approval status.'}
                    </p>
                    <div className="mt-4 space-y-3">
                      {projects.length === 0 ? (
                        <p className="text-sm text-slate-600">No projects yet.</p>
                      ) : (
                        projects.map((project) => (
                          <div
                            key={project.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-base font-semibold text-slate-900">{project.title}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                                  {project.status === 'approved' ? 'Approved' : 'Pending'}
                                  {project.createdBy ? ` • Added by ${project.createdBy.name}` : ''}
                                </p>
                                {(project.city || project.location) && (
                                  <p className="mt-2 text-sm text-slate-600">
                                    {[project.city, project.location].filter(Boolean).join(', ')}
                                  </p>
                                )}
                                {project.description ? (
                                  <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                                    {project.description}
                                  </p>
                                ) : null}
                              </div>
                              {isOwner ? (
                                <div className="flex flex-col gap-2">
                                  {project.status === 'pending' ? (
                                    <Button
                                      variant="outline"
                                      className="justify-start"
                                      onClick={() => handleApproveProject(project.id)}
                                    >
                                      Approve
                                    </Button>
                                  ) : null}
                                  <Button
                                    variant="outline"
                                    className="justify-start text-red-700 hover:text-red-800"
                                    onClick={() => handleDeleteProject(project.id)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Remove
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {isOwner ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <UserPlus className="h-4 w-4 text-blue-700" />
                      Add Company User (Max {me?.maxUsers ?? COMPANY_USER_LIMIT})
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Add worker accounts. You can remove workers anytime.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <Input
                        value={workerName}
                        onChange={(event) => setWorkerName(event.target.value)}
                        placeholder="Worker Name"
                        className="h-11"
                      />
                      <Input
                        value={workerPhone}
                        onChange={(event) => setWorkerPhone(event.target.value)}
                        placeholder="Worker Phone (optional)"
                        className="h-11"
                      />
                      <Input
                        value={workerEmail}
                        onChange={(event) => setWorkerEmail(event.target.value)}
                        placeholder="Worker Email"
                        className="h-11 md:col-span-2"
                      />
                      <Input
                        value={workerPassword}
                        onChange={(event) => setWorkerPassword(event.target.value)}
                        placeholder="Worker Password"
                        type="password"
                        className="h-11 md:col-span-2"
                      />
                      <div className="md:col-span-2 flex justify-end">
                        <Button
                          onClick={handleAddWorker}
                          disabled={workerSubmitting}
                          className="h-11 bg-blue-700 text-white hover:bg-blue-800"
                        >
                          {workerSubmitting ? 'Adding...' : 'Add Worker'}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-6 space-y-3">
                      <p className="text-sm font-semibold text-slate-900">Company Users</p>
                      {users.length === 0 ? (
                        <p className="text-sm text-slate-600">No users loaded yet.</p>
                      ) : (
                        users.map((companyUser) => (
                          <div
                            key={companyUser.id}
                            className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {companyUser.name}{' '}
                                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  ({companyUser.companyRole})
                                </span>
                              </p>
                              <p className="text-sm text-slate-600">{companyUser.email}</p>
                              {companyUser.phone ? (
                                <p className="text-xs text-slate-500">{companyUser.phone}</p>
                              ) : null}
                            </div>
                            {companyUser.companyRole === 'member' ? (
                              <Button
                                variant="outline"
                                className="justify-start text-red-700 hover:text-red-800"
                                onClick={() => handleRemoveWorker(companyUser.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove Worker
                              </Button>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              )
            )}
          </>
        )}
      </div>
    </section>
  );
}
