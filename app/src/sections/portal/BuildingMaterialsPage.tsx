import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileSearch,
  Leaf,
  RefreshCcw,
  ShieldCheck,
  Truck,
  Upload,
  XCircle,
  Phone,
  ShoppingBag,
  Recycle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import MaterialsCatalog from './MaterialsCatalog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import { uploadImageFile } from '@/lib/mediaUploadApi';
import {
  createCircularBuildRequest,
  getAdminCircularBuildRequests,
  getMyCircularBuildRequests,
  updateCircularBuildRequestStatus,
  type CircularBuildRequest,
  type CircularBuildRequestMaterial,
  type CircularBuildRequestsSummary,
  type CircularBuildSellerType,
  type CircularBuildStatus,
} from '@/lib/materialsApi';
import type { AuthUser } from '@/lib/session';

interface BuildingMaterialsPageProps {
  token: string;
  user: AuthUser | null;
}

const STATUS_FLOW: CircularBuildStatus[] = [
  'submitted',
  'under_review',
  'inspection_required',
  'inspection_not_required',
  'approved',
  'picked_up',
  'closed',
];

const STATUS_OPTIONS: Array<{ value: CircularBuildStatus; label: string }> = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'inspection_required', label: 'Inspection Required' },
  { value: 'inspection_not_required', label: 'Inspection Not Required' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'picked_up', label: 'Picked Up' },
  { value: 'closed', label: 'Closed' },
];

const SELLER_TYPE_OPTIONS: Array<{ value: CircularBuildSellerType; label: string }> = [
  { value: 'homeowner', label: 'Homeowner' },
  { value: 'builder', label: 'Builder' },
  { value: 'developer', label: 'Developer' },
];

const REUSE_MATERIAL_CATEGORIES = [
  {
    value: 'Structural & Raw',
    title: 'Structural & Raw',
    description:
      'Bricks, blocks, steel, unused cement bags, sand, soil, and aggregates ready for direct reuse.',
    examples: ['Bricks', 'Blocks', 'TMT steel rods', 'Steel beams', 'Unused cement bags', 'Sand'],
    materialPlaceholder: 'Example: TMT steel rods',
    quantityPlaceholder: 'Example: 2,000 bricks or 1.5 tons sand',
  },
  {
    value: 'Doors, Windows & Woodwork',
    title: 'Doors, Windows & Woodwork',
    description:
      'Reusable doors, windows, frames, plywood sheets, timber sections, and other wood-based salvage.',
    examples: ['Wooden doors', 'Aluminium windows', 'Door frames', 'Plywood sheets', 'Timber sections'],
    materialPlaceholder: 'Example: Reclaimed teak doors',
    quantityPlaceholder: 'Example: 12 doors or 40 plywood sheets',
  },
  {
    value: 'Tiles, Stone & Finishes',
    title: 'Tiles, Stone & Finishes',
    description:
      'Tiles, marble, granite, stone slabs, and surface-finish materials that can go back into construction.',
    examples: ['Floor tiles', 'Wall tiles', 'Marble slabs', 'Granite slabs', 'Stone cladding'],
    materialPlaceholder: 'Example: Granite slabs',
    quantityPlaceholder: 'Example: 480 sq ft tiles or 22 marble slabs',
  },
  {
    value: 'Plumbing & Sanitary',
    title: 'Plumbing & Sanitary',
    description:
      'Pipes, plumbing fittings, basins, taps, and sanitary items suitable for reuse after inspection.',
    examples: ['PVC pipes', 'CPVC fittings', 'Wash basins', 'WC units', 'Taps'],
    materialPlaceholder: 'Example: PVC drainage pipes',
    quantityPlaceholder: 'Example: 120 meters pipe or 18 basins',
  },
  {
    value: 'Electrical & Utility',
    title: 'Electrical & Utility',
    description:
      'Electrical panels, cable trays, wiring, switchgear, and other utility-side reusable construction materials.',
    examples: ['Electrical panels', 'Copper wiring', 'MCB boxes', 'Cable trays', 'Lighting fixtures'],
    materialPlaceholder: 'Example: Electrical distribution panel',
    quantityPlaceholder: 'Example: 75 meters copper wiring or 4 panels',
  },
  {
    value: 'Demolition Mix & Salvage',
    title: 'Demolition Mix & Salvage',
    description:
      'Mixed reusable demolition lots, sorted salvage items, and construction-site materials that can be recovered.',
    examples: [
      'Mixed reusable demolition lot',
      'Sorted salvage metal',
      'Recovered frames',
      'Site shutters',
      'Salvaged fixtures',
    ],
    materialPlaceholder: 'Example: Mixed demolition reusable lot',
    quantityPlaceholder: 'Example: 3 truckloads mixed salvage',
  },
] as const;

const REUSE_MATERIAL_CATEGORY_SET: ReadonlySet<string> = new Set(
  REUSE_MATERIAL_CATEGORIES.map((category) => category.value)
);

function findReuseMaterialCategory(value: string) {
  return (
    REUSE_MATERIAL_CATEGORIES.find((category) => category.value === value.trim()) || null
  );
}

function createEmptyMaterialDraft(
  overrides: Partial<CircularBuildRequestMaterial> = {}
): CircularBuildRequestMaterial {
  return {
    materialCategory: '',
    materialName: '',
    approxQuantity: '',
    ...overrides,
  };
}

const EMPTY_SUMMARY: CircularBuildRequestsSummary = {
  total: 0,
  submitted: 0,
  underReview: 0,
  inspectionRequired: 0,
  inspectionNotRequired: 0,
  approved: 0,
  rejected: 0,
  pickedUp: 0,
  closed: 0,
};

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeClass(status: CircularBuildStatus) {
  if (status === 'approved' || status === 'picked_up' || status === 'closed') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  }
  if (status === 'rejected') {
    return 'border-red-300 bg-red-50 text-red-700';
  }
  if (status === 'inspection_required') {
    return 'border-amber-300 bg-amber-50 text-amber-700';
  }
  return 'border-blue-300 bg-blue-50 text-blue-700';
}

function progressRank(status: CircularBuildStatus) {
  if (status === 'submitted') return 0;
  if (status === 'under_review') return 1;
  if (status === 'inspection_required' || status === 'inspection_not_required') return 2;
  if (status === 'approved' || status === 'rejected') return 3;
  if (status === 'picked_up') return 4;
  if (status === 'closed') return 5;
  return 0;
}

function progressPercent(status: CircularBuildStatus) {
  return (progressRank(status) / 5) * 100;
}

function sellerTypeLabel(value: CircularBuildSellerType) {
  return SELLER_TYPE_OPTIONS.find((item) => item.value === value)?.label || value;
}

function materialSummaryLabel(material: CircularBuildRequestMaterial) {
  return `${material.materialCategory} | ${material.materialName} | ${material.approxQuantity}`;
}

function materialSelectionKey(category: string, materialName: string) {
  return `${category.trim().toLowerCase()}::${materialName.trim().toLowerCase()}`;
}

export default function BuildingMaterialsPage({ token, user }: BuildingMaterialsPageProps) {
  const isAuthenticated = Boolean(token);
  const isMainAdmin = Boolean(token && user?.role === 'admin' && user?.isMainAdmin);
  const [activeTab, setActiveTab] = useState<'shop' | 'reuse'>('shop');

  const [form, setForm] = useState({
    sellerType: 'homeowner' as CircularBuildSellerType,
    materials: [createEmptyMaterialDraft()],
    locationCity: '',
    locationAddress: '',
    description: '',
    contactName: '',
    contactPhone: '',
    consentOwnership: false,
    consentLegal: false,
  });
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [myLoading, setMyLoading] = useState(false);
  const [myError, setMyError] = useState('');
  const [myRequests, setMyRequests] = useState<CircularBuildRequest[]>([]);
  const [mySummary, setMySummary] = useState<CircularBuildRequestsSummary>(EMPTY_SUMMARY);

  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminRequests, setAdminRequests] = useState<CircularBuildRequest[]>([]);
  const [adminSummary, setAdminSummary] = useState<CircularBuildRequestsSummary>(EMPTY_SUMMARY);
  const [adminStatusFilter, setAdminStatusFilter] = useState<'all' | CircularBuildStatus>('all');
  const [adminSearch, setAdminSearch] = useState('');
  const [adminDrafts, setAdminDrafts] = useState<
    Record<
      string,
      {
        status: CircularBuildStatus;
        publicNote: string;
        internalNote: string;
        valuationInr: string;
      }
    >
  >({});
  const [adminSavingId, setAdminSavingId] = useState('');

  const flowLabels = useMemo(
    () =>
      STATUS_FLOW.map((status) => ({
        status,
        label: STATUS_OPTIONS.find((option) => option.value === status)?.label || status,
      })),
    []
  );

  useEffect(() => {
    if (!user?.name) return;
    setForm((current) => {
      if (current.contactName.trim()) return current;
      return { ...current, contactName: user.name };
    });
  }, [user?.name]);

  const loadMyRequests = useCallback(async () => {
    if (!token) {
      setMyLoading(false);
      setMyError('');
      setMyRequests([]);
      setMySummary(EMPTY_SUMMARY);
      return;
    }
    try {
      setMyLoading(true);
      setMyError('');
      const response = await getMyCircularBuildRequests(token, { limit: 120 });
      setMyRequests(response.requests || []);
      setMySummary(response.summary || EMPTY_SUMMARY);
    } catch (loadError) {
      setMyError(loadError instanceof Error ? loadError.message : 'Unable to load your submissions.');
      setMyRequests([]);
      setMySummary(EMPTY_SUMMARY);
    } finally {
      setMyLoading(false);
    }
  }, [token]);

  const loadAdminRequests = useCallback(async () => {
    if (!isMainAdmin || !token) {
      setAdminLoading(false);
      setAdminError('');
      setAdminRequests([]);
      setAdminSummary(EMPTY_SUMMARY);
      return;
    }
    try {
      setAdminLoading(true);
      setAdminError('');
      const response = await getAdminCircularBuildRequests(token, {
        status: adminStatusFilter,
        q: adminSearch.trim() || undefined,
        limit: 260,
      });
      setAdminRequests(response.requests || []);
      setAdminSummary(response.summary || EMPTY_SUMMARY);
    } catch (loadError) {
      setAdminError(loadError instanceof Error ? loadError.message : 'Unable to load admin queue.');
      setAdminRequests([]);
      setAdminSummary(EMPTY_SUMMARY);
    } finally {
      setAdminLoading(false);
    }
  }, [adminSearch, adminStatusFilter, isMainAdmin, token]);

  useEffect(() => {
    if (activeTab === 'reuse') void loadMyRequests();
  }, [loadMyRequests, activeTab]);

  useEffect(() => {
    if (activeTab === 'reuse') void loadAdminRequests();
  }, [loadAdminRequests, activeTab]);

  const handleUploadPhoto = async (file: File | null) => {
    if (!token || !file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }
    if (photoUrls.length >= 8) {
      toast.error('Maximum 8 photos are allowed.');
      return;
    }
    try {
      setUploadingPhoto(true);
      const upload = await uploadImageFile(token, 'material', file, {
        maxSide: 1600,
        mimeType: 'image/webp',
        quality: 0.9,
      });
      setPhotoUrls((current) => {
        if (current.includes(upload.imageUrl)) return current;
        return [...current, upload.imageUrl].slice(0, 8);
      });
      toast.success('Photo uploaded.');
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : 'Unable to upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const resetForm = () => {
    setForm({
      sellerType: 'homeowner',
      materials: [createEmptyMaterialDraft()],
      locationCity: '',
      locationAddress: '',
      description: '',
      contactName: user?.name || '',
      contactPhone: '',
      consentOwnership: false,
      consentLegal: false,
    });
    setPhotoUrls([]);
  };

  const updateMaterialDraft = (
    index: number,
    patch: Partial<CircularBuildRequestMaterial>
  ) => {
    setForm((current) => ({
      ...current,
      materials: current.materials.map((material, materialIndex) =>
        materialIndex === index ? { ...material, ...patch } : material
      ),
    }));
  };

  const addMaterialDraft = () => {
    setForm((current) => ({
      ...current,
      materials: [...current.materials, createEmptyMaterialDraft()].slice(0, 8),
    }));
  };

  const addMaterialDraftForCategory = (materialCategory: string) => {
    const normalizedCategory = materialCategory.trim();
    if (!normalizedCategory) {
      return;
    }
    setForm((current) => {
      if (current.materials.length >= 8) {
        return current;
      }
      return {
        ...current,
        materials: [
          ...current.materials,
          createEmptyMaterialDraft({ materialCategory: normalizedCategory }),
        ],
      };
    });
  };

  const removeMaterialDraft = (index: number) => {
    setForm((current) => {
      const nextMaterials = current.materials.filter((_, materialIndex) => materialIndex !== index);
      return {
        ...current,
        materials: nextMaterials.length > 0 ? nextMaterials : [createEmptyMaterialDraft()],
      };
    });
  };

  const toggleExampleMaterials = (
    materialIndex: number,
    materialNames: readonly string[]
  ) => {
    setForm((current) => {
      const baseMaterial = current.materials[materialIndex];
      const baseCategory = String(baseMaterial?.materialCategory || '').trim();
      if (!baseCategory) {
        return current;
      }

      const normalizedNames = materialNames
        .map((name) => String(name || '').trim())
        .filter(Boolean);
      if (normalizedNames.length === 0) {
        return current;
      }

      const requestedKeys = new Set(
        normalizedNames.map((materialName) => materialSelectionKey(baseCategory, materialName))
      );
      const allExamplesSelected = normalizedNames.every((materialName) =>
        current.materials.some(
          (material) =>
            materialSelectionKey(material.materialCategory, material.materialName) ===
            materialSelectionKey(baseCategory, materialName)
        )
      );

      if (allExamplesSelected) {
        const nextMaterials = current.materials.filter(
          (material) =>
            !requestedKeys.has(
              materialSelectionKey(material.materialCategory, material.materialName)
            )
        );

        return {
          ...current,
          materials:
            nextMaterials.length > 0
              ? nextMaterials
              : [createEmptyMaterialDraft({ materialCategory: baseCategory })],
        };
      }

      const nextMaterials = [...current.materials];
      const existingKeys = new Set(
        current.materials.map((material) => {
          return materialSelectionKey(material.materialCategory, material.materialName);
        })
      );

      let nextNameIndex = 0;
      if (!baseMaterial.materialName.trim()) {
        const firstName = normalizedNames[0];
        nextMaterials[materialIndex] = {
          ...baseMaterial,
          materialName: firstName,
        };
        existingKeys.add(materialSelectionKey(baseCategory, firstName));
        nextNameIndex = 1;
      }

      for (let i = nextNameIndex; i < normalizedNames.length; i += 1) {
        const materialName = normalizedNames[i];
        const materialKey = materialSelectionKey(baseCategory, materialName);
        if (existingKeys.has(materialKey)) {
          continue;
        }
        if (nextMaterials.length >= 8) {
          break;
        }

        nextMaterials.push(
          createEmptyMaterialDraft({
            materialCategory: baseCategory,
            materialName,
          })
        );
        existingKeys.add(materialKey);
      }

      return {
        ...current,
        materials: nextMaterials,
      };
    });
  };

  const handleSubmit = async () => {
    if (!token) {
      toast.error('Please login to submit materials.');
      return;
    }
    const trimmedMaterials = form.materials.map((material) => ({
      materialCategory: material.materialCategory.trim(),
      materialName: material.materialName.trim(),
      approxQuantity: material.approxQuantity.trim(),
    }));
    const activeMaterials = trimmedMaterials.filter(
      (material) =>
        material.materialCategory || material.materialName || material.approxQuantity
    );
    if (activeMaterials.length === 0) {
      toast.error('Add at least one construction material.');
      return;
    }
    for (const [index, material] of activeMaterials.entries()) {
      const label = `Material ${index + 1}`;
      if (!material.materialCategory) {
        toast.error(`${label}: category is required.`);
        return;
      }
      if (!REUSE_MATERIAL_CATEGORY_SET.has(material.materialCategory)) {
        toast.error(`${label}: choose one of the approved construction categories.`);
        return;
      }
      if (!material.materialName) {
        toast.error(`${label}: material name is required.`);
        return;
      }
      if (!material.approxQuantity) {
        toast.error(`${label}: approximate quantity is required.`);
        return;
      }
      if (!/\d/.test(material.approxQuantity)) {
        toast.error(`${label}: quantity must include a number and unit.`);
        return;
      }
    }
    if (!form.locationCity.trim()) {
      toast.error('City is required.');
      return;
    }
    if (!form.locationAddress.trim()) {
      toast.error('Address/location details are required.');
      return;
    }
    if (!form.contactPhone.trim()) {
      toast.error('Contact phone is required.');
      return;
    }
    const contactPhoneDigits = form.contactPhone.replace(/\D/g, '');
    if (contactPhoneDigits.length < 10 || contactPhoneDigits.length > 15) {
      toast.error('Enter a valid contact phone number.');
      return;
    }
    if (photoUrls.length === 0) {
      toast.error('Please upload at least one material photo.');
      return;
    }
    if (!form.consentOwnership || !form.consentLegal) {
      toast.error('Please accept both legal declarations.');
      return;
    }
    try {
      setSubmitting(true);
      const response = await createCircularBuildRequest(token, {
        sellerType: form.sellerType,
        materials: activeMaterials,
        locationCity: form.locationCity.trim(),
        locationAddress: form.locationAddress.trim(),
        description: form.description.trim(),
        photoUrls,
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        consentOwnership: true,
        consentLegal: true,
      });
      toast.success(`Request ${response.request.requestCode} submitted.`);
      resetForm();
      await loadMyRequests();
      if (isMainAdmin) {
        await loadAdminRequests();
      }
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : 'Unable to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  const getAdminDraft = (request: CircularBuildRequest) =>
    adminDrafts[request.id] || {
      status: request.status,
      publicNote: request.adminPublicNote || '',
      internalNote: request.adminInternalNote || '',
      valuationInr:
        request.valuationInr !== null && request.valuationInr !== undefined
          ? String(request.valuationInr)
          : '',
    };

  const handleAdminUpdate = async (request: CircularBuildRequest) => {
    if (!token || !isMainAdmin) return;
    const draft = getAdminDraft(request);
    const valuationRaw = draft.valuationInr.trim();
    let valuationInr: number | undefined;
    if (valuationRaw) {
      const parsed = Number(valuationRaw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error('Valuation must be a valid non-negative number.');
        return;
      }
      valuationInr = parsed;
    }
    try {
      setAdminSavingId(request.id);
      const response = await updateCircularBuildRequestStatus(token, request.id, {
        status: draft.status,
        publicNote: draft.publicNote.trim(),
        internalNote: draft.internalNote.trim(),
        valuationInr,
      });
      toast.success(response.message);
      await Promise.all([loadAdminRequests(), loadMyRequests()]);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Unable to update request.');
    } finally {
      setAdminSavingId('');
    }
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack space-y-5">
        {/* Tab Navigation */}
        <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <button
            onClick={() => setActiveTab('shop')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
              activeTab === 'shop'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            Shop Materials
          </button>
          <button
            onClick={() => setActiveTab('reuse')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
              activeTab === 'reuse'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Recycle className="h-4 w-4" />
            Sell / Reuse Materials
          </button>
        </div>

        {/* Shop Tab */}
        {activeTab === 'shop' && (
          <MaterialsCatalog token={token} user={user} />
        )}

        {/* Reuse Tab - existing form below */}
        {activeTab === 'reuse' && (
          <>
        <div className="zdt-panel-hero rounded-3xl border p-6 text-slate-50 shadow-xl">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-100/90">Building Materials Marketplace</p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">List Cement, Steel Bars, Bricks &amp; More</h1>
          <p className="mt-2 max-w-3xl text-sm text-emerald-100/90">
            List surplus and reusable construction materials from your site in one place. Submit cement bags,
            steel bars, bricks, blocks, sand, doors, windows, and salvage stock once, and ZDT handles
            verification, inspection, pickup, and reuse coordination.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary" className="border-white/30 bg-white/15 text-white">
              No buyer interaction
            </Badge>
            <Badge variant="secondary" className="border-white/30 bg-white/15 text-white">
              No bargaining
            </Badge>
            <Badge variant="secondary" className="border-white/30 bg-white/15 text-white">
              No public pricing
            </Badge>
            <Badge variant="secondary" className="border-white/30 bg-white/15 text-white">
              ZDT review and control
            </Badge>
            <Badge variant="secondary" className="border-white/30 bg-white/15 text-white">
              Responsible demolition starts here
            </Badge>
          </div>
          <div className="mt-4">
            <a
              href="https://wa.me/917676815237?text=Hi%20ZDT%2C%20I%20need%20demolition%20services.%20Please%20share%20details."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-xl"
            >
              <Phone className="h-4 w-4" />
              Contact for Demolition
            </a>
            <p className="mt-1.5 text-xs text-emerald-100/70">Chat with us on WhatsApp for demolition inquiries</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <FileSearch className="h-5 w-5 text-blue-700" />
            <h2 className="mt-3 text-sm font-semibold text-slate-900">1. Submit Materials</h2>
            <p className="mt-1 text-xs text-slate-600">
              Share details, photos, and location. No listing fees, no buyer negotiation.
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <ShieldCheck className="h-5 w-5 text-blue-700" />
            <h2 className="mt-3 text-sm font-semibold text-slate-900">2. ZDT Verification</h2>
            <p className="mt-1 text-xs text-slate-600">
              ZDT validates ownership, quality, and legality before approval.
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <Truck className="h-5 w-5 text-blue-700" />
            <h2 className="mt-3 text-sm font-semibold text-slate-900">3. Pickup & Processing</h2>
            <p className="mt-1 text-xs text-slate-600">
              Approved materials are picked up by ZDT network teams for circular reuse.
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <Leaf className="h-5 w-5 text-blue-700" />
            <h2 className="mt-3 text-sm font-semibold text-slate-900">4. Circular Reuse</h2>
            <p className="mt-1 text-xs text-slate-600">
              Reduced landfill waste, lower carbon footprint, and stronger sustainable construction.
            </p>
          </article>
        </div>

        <div id="submit-materials" className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Submit Reusable Materials</h2>
              <p className="mt-1 text-sm text-slate-600">
                Users submit materials only. ZDT decides valuation, approval, and resale channels.
              </p>
            </div>
            {isAuthenticated ? (
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                Logged in as {user?.name || 'Seller'}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                Login required to submit
              </Badge>
            )}
          </div>

          {!isAuthenticated ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Please login to create a submission and track request status.
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Seller type
              </label>
              <select
                value={form.sellerType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sellerType: event.target.value as CircularBuildSellerType,
                  }))
                }
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                disabled={!isAuthenticated}
              >
                {SELLER_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 md:col-span-2 xl:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Platform Rule</p>
              <p className="mt-2 font-semibold">
                ZDT accepts only reusable construction and demolition materials.
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Non-construction items are rejected. Every submission goes through manual review before approval.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Step 1</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">
                  Add one or more reusable materials
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Each material line must use one approved construction category. Add all materials from the site in one submission.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-blue-200 bg-white text-blue-700">
                  Manual approval required
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                  {form.materials.length} material{form.materials.length === 1 ? '' : 's'}
                </Badge>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {form.materials.map((material, materialIndex) => {
                const selectedMaterialCategory = findReuseMaterialCategory(material.materialCategory);
                const normalizedCategory = material.materialCategory.trim();
                const categoryMaterialIndexes = normalizedCategory
                  ? form.materials.reduce<number[]>((indexes, entry, entryIndex) => {
                      if (entry.materialCategory.trim() === normalizedCategory) {
                        indexes.push(entryIndex);
                      }
                      return indexes;
                    }, [])
                  : [materialIndex];
                const firstCategoryMaterialIndex = categoryMaterialIndexes[0] ?? materialIndex;
                const isCollapsedIntoPreviousCard =
                  Boolean(normalizedCategory) && firstCategoryMaterialIndex !== materialIndex;
                if (isCollapsedIntoPreviousCard) {
                  return null;
                }
                const additionalCategoryMaterials = categoryMaterialIndexes
                  .filter((entryIndex) => entryIndex !== materialIndex)
                  .map((entryIndex) => ({
                    index: entryIndex,
                    material: form.materials[entryIndex],
                  }));
                const selectedCategoryValue = selectedMaterialCategory?.value || '';
                const selectedExampleKeys = selectedMaterialCategory
                  ? new Set(
                      form.materials.map((entry) =>
                        materialSelectionKey(entry.materialCategory, entry.materialName)
                      )
                    )
                  : new Set<string>();
                const selectedExampleCount = selectedMaterialCategory
                  ? selectedMaterialCategory.examples.filter((example) =>
                      selectedExampleKeys.has(materialSelectionKey(selectedCategoryValue, example))
                    ).length
                  : 0;
                const allExamplesSelected = selectedMaterialCategory
                  ? selectedMaterialCategory.examples.every((example) =>
                      selectedExampleKeys.has(materialSelectionKey(selectedCategoryValue, example))
                    )
                  : false;
                return (
                  <div
                    key={`material-${materialIndex}`}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Material {materialIndex + 1}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Start with the category, then enter the exact item and quantity.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {materialIndex === 0 ? (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                            Primary line
                          </Badge>
                        ) : null}
                        {form.materials.length > 1 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeMaterialDraft(materialIndex)}
                            disabled={!isAuthenticated}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {REUSE_MATERIAL_CATEGORIES.map((category) => {
                        const isSelected = material.materialCategory === category.value;
                        return (
                          <button
                            key={`${materialIndex}-${category.value}`}
                            type="button"
                            onClick={() =>
                              updateMaterialDraft(materialIndex, {
                                materialCategory: category.value,
                                materialName:
                                  material.materialCategory === category.value ? material.materialName : '',
                                approxQuantity:
                                  material.materialCategory === category.value ? material.approxQuantity : '',
                              })
                            }
                            disabled={!isAuthenticated}
                            className={`rounded-2xl border p-3 text-left transition ${
                              isSelected
                                ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                                : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900">{category.title}</p>
                              {isSelected ? (
                                <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800">
                                  Selected
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-2 text-xs leading-5 text-slate-600">
                              {category.examples.slice(0, 3).join(', ')}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Material name
                        </label>
                        <Input
                          value={material.materialName}
                          onChange={(event) =>
                            updateMaterialDraft(materialIndex, { materialName: event.target.value })
                          }
                          placeholder={
                            selectedMaterialCategory?.materialPlaceholder || 'Select a category first'
                          }
                          className="h-11 bg-white"
                          disabled={!isAuthenticated || !selectedMaterialCategory}
                        />
                        {selectedMaterialCategory ? (
                          <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  toggleExampleMaterials(
                                    materialIndex,
                                    selectedMaterialCategory.examples
                                  )
                                }
                                disabled={!isAuthenticated}
                              >
                                {allExamplesSelected ? 'Clear All Examples' : 'Select All Examples'}
                              </Button>
                              <p className="text-xs text-slate-500">
                                Select one or more chips. They will be submitted together.
                              </p>
                              {selectedExampleCount > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-200 bg-emerald-50 text-emerald-700"
                                >
                                  {selectedExampleCount} selected
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {selectedMaterialCategory.examples.map((example) => {
                                const isExampleSelected = selectedExampleKeys.has(
                                  materialSelectionKey(selectedMaterialCategory.value, example)
                                );
                                return (
                                <button
                                  key={`${materialIndex}-${example}`}
                                  type="button"
                                  onClick={() => toggleExampleMaterials(materialIndex, [example])}
                                  disabled={!isAuthenticated}
                                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed ${
                                    isExampleSelected
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                                  }`}
                                >
                                  {example}
                                </button>
                                );
                              })}
                            </div>
                            <p className="text-xs text-slate-500">
                              Selected chips create separate material lines below so you can add quantity for each.
                            </p>
                            {additionalCategoryMaterials.length > 0 ? (
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">
                                      Additional items in this category
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      Edit quantity here and submit all selected items together.
                                    </p>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="border-slate-200 bg-white text-slate-700"
                                  >
                                    {additionalCategoryMaterials.length} extra item
                                    {additionalCategoryMaterials.length === 1 ? '' : 's'}
                                  </Badge>
                                </div>
                                <div className="mt-3 space-y-2">
                                  {additionalCategoryMaterials.map((entry, entryIndex) => (
                                    <div
                                      key={`category-material-${entry.index}`}
                                      className="grid gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]"
                                    >
                                      <Input
                                        value={entry.material.materialName}
                                        onChange={(event) =>
                                          updateMaterialDraft(entry.index, {
                                            materialName: event.target.value,
                                          })
                                        }
                                        placeholder={
                                          selectedMaterialCategory.materialPlaceholder
                                        }
                                        className="h-10 bg-white"
                                        disabled={!isAuthenticated}
                                      />
                                      <Input
                                        value={entry.material.approxQuantity}
                                        onChange={(event) =>
                                          updateMaterialDraft(entry.index, {
                                            approxQuantity: event.target.value,
                                          })
                                        }
                                        placeholder={
                                          selectedMaterialCategory.quantityPlaceholder
                                        }
                                        className="h-10 bg-white"
                                        disabled={!isAuthenticated}
                                      />
                                      <div className="flex items-center gap-2">
                                        <Badge
                                          variant="outline"
                                          className="hidden border-slate-200 bg-white text-slate-600 md:inline-flex"
                                        >
                                          Item {entryIndex + 2}
                                        </Badge>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => removeMaterialDraft(entry.index)}
                                          disabled={!isAuthenticated}
                                        >
                                          Remove
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  addMaterialDraftForCategory(selectedMaterialCategory.value)
                                }
                                disabled={!isAuthenticated || form.materials.length >= 8}
                              >
                                Add Custom Item In This Category
                              </Button>
                              <p className="text-xs text-slate-500">
                                Use this when the material is not listed in the example chips.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">Pick a category card first.</p>
                        )}
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Approximate quantity
                        </label>
                        <Input
                          value={material.approxQuantity}
                          onChange={(event) =>
                            updateMaterialDraft(materialIndex, { approxQuantity: event.target.value })
                          }
                          placeholder={
                            selectedMaterialCategory?.quantityPlaceholder || 'Select a category first'
                          }
                          className="h-11 bg-white"
                          disabled={!isAuthenticated || !selectedMaterialCategory}
                        />
                        <p className="mt-2 text-xs text-slate-500">
                          Use a number plus unit, such as pieces, bags, sq ft, meters, tons, or truckloads.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={addMaterialDraft}
                disabled={!isAuthenticated || form.materials.length >= 8}
              >
                Add Another Material
              </Button>
              <p className="text-xs text-slate-500">
                Add up to 8 material lines in one submission.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                City
              </label>
              <LgdLocationInput
                value={form.locationCity}
                onChange={(value) => setForm((current) => ({ ...current, locationCity: value }))}
                placeholder="Material location city"
                className="h-11 bg-white"
                suggestKind="india"
                indiaValueField="village"
                disabled={!isAuthenticated}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Contact phone
              </label>
              <Input
                value={form.contactPhone}
                onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))}
                placeholder="Phone for inspection/pickup coordination"
                className="h-11 bg-white"
                disabled={!isAuthenticated}
              />
            </div>

            <div className="xl:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Contact name
              </label>
              <Input
                value={form.contactName}
                onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
                placeholder="Person available on site"
                className="h-11 bg-white"
                disabled={!isAuthenticated}
              />
            </div>

            <div className="xl:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Full location / address
              </label>
              <Textarea
                value={form.locationAddress}
                onChange={(event) =>
                  setForm((current) => ({ ...current, locationAddress: event.target.value }))
                }
                placeholder="Demolition/renovation site address, landmark, and pickup access notes"
                className="min-h-20 bg-white"
                disabled={!isAuthenticated}
              />
            </div>

            <div className="xl:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Material details (optional)
              </label>
              <Textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Condition notes, salvage stage, expected demolition date, etc."
                className="min-h-20 bg-white"
                disabled={!isAuthenticated}
              />
            </div>
          </div>

          <div className="mt-3">
            <LgdLocationAccuracyNote />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Photo Verification</p>
                <p className="text-xs text-slate-600">
                  Minimum 1 photo required. Upload 3-4 clear photos for faster review.
                </p>
              </div>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  event.target.value = '';
                  void handleUploadPhoto(file);
                }}
                className="h-10 max-w-sm bg-white text-xs"
                disabled={!isAuthenticated || uploadingPhoto}
              />
            </div>
            {uploadingPhoto ? <p className="mt-2 text-xs text-slate-500">Uploading photo...</p> : null}
            {photoUrls.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {photoUrls.map((url) => (
                  <div key={url} className="overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
                    <img src={url} alt="Uploaded material" className="h-28 w-full rounded-md object-cover" />
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-full text-xs"
                        onClick={() => setPhotoUrls((current) => current.filter((item) => item !== url))}
                        disabled={!isAuthenticated}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid gap-2">
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <Checkbox
                checked={form.consentOwnership}
                onCheckedChange={(value) => setForm((current) => ({ ...current, consentOwnership: Boolean(value) }))}
                disabled={!isAuthenticated}
              />
              <span>I confirm legal ownership/authorization for submitted materials.</span>
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <Checkbox
                checked={form.consentLegal}
                onCheckedChange={(value) => setForm((current) => ({ ...current, consentLegal: Boolean(value) }))}
                disabled={!isAuthenticated}
              />
              <span>I accept zero-tolerance policy for stolen/illegal materials.</span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!isAuthenticated || submitting || uploadingPhoto}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Upload className="mr-2 h-4 w-4" />
              {submitting ? 'Submitting...' : 'Submit Materials'}
            </Button>
            <Badge variant="outline">No pricing shown to users</Badge>
            <Badge variant="outline">No online buyer interactions</Badge>
          </div>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">My Submission Status</h2>
              <p className="text-sm text-slate-600">
                Track status only. Internal valuation and resale details stay with ZDT.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Total: {mySummary.total}</Badge>
              <Badge variant="outline">Under review: {mySummary.underReview}</Badge>
              <Badge variant="outline">Approved: {mySummary.approved}</Badge>
              <Badge variant="outline">Closed: {mySummary.closed}</Badge>
              <Button variant="outline" onClick={() => void loadMyRequests()} disabled={myLoading || !isAuthenticated}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          {!isAuthenticated ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Login to view your submitted requests and status timeline.
            </p>
          ) : null}
          {myError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{myError}</p>
          ) : null}
          {isAuthenticated && myLoading ? <p className="text-sm text-slate-600">Loading submissions...</p> : null}
          {isAuthenticated && !myLoading && myRequests.length === 0 ? (
            <p className="text-sm text-slate-600">No submissions yet. Start by submitting materials above.</p>
          ) : null}

          {!myLoading && myRequests.length > 0 ? (
            <div className="space-y-3">
              {myRequests.map((request) => (
                <article key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{request.requestCode}</p>
                      <p className="text-xs text-slate-600">
                        {sellerTypeLabel(request.sellerType)} | {request.materials.length} material
                        {request.materials.length === 1 ? '' : 's'}
                      </p>
                      <p className="text-xs text-slate-500">
                        City: {request.locationCity} | Submitted:{' '}
                        {formatDateTime(request.createdAt)}
                      </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(request.status)}`}>
                      {request.statusLabel}
                    </span>
                  </div>

                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Materials
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {request.materials.map((material, materialIndex) => (
                        <Badge key={`${request.id}-material-${materialIndex}`} variant="outline" className="text-[11px]">
                          {materialSummaryLabel(material)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
                      <span>Status progression</span>
                      <span>{Math.round(progressPercent(request.status))}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progressPercent(request.status)}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {flowLabels.map((item) => (
                        <Badge key={item.status} variant="outline" className="text-[10px]">
                          {item.label}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {request.adminPublicNote ? (
                    <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                      <strong>ZDT update:</strong> {request.adminPublicNote}
                    </p>
                  ) : null}

                  {request.events.length > 0 ? (
                    <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Timeline</p>
                      {request.events.map((event) => (
                        <div key={event.id} className="text-xs text-slate-700">
                          <span className="font-semibold">{event.statusLabel}</span> | {formatDateTime(event.createdAt)}
                          {event.note ? ` | ${event.note}` : ''}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </div>

        {isMainAdmin ? (
          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Main Admin Review Queue</h2>
                <p className="text-sm text-slate-600">
                  Full control: review, approve/reject, pickup status, valuation, and notes.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={adminSearch}
                  onChange={(event) => setAdminSearch(event.target.value)}
                  placeholder="Search request / city / material"
                  className="h-10 w-56 bg-white"
                />
                <select
                  value={adminStatusFilter}
                  onChange={(event) => setAdminStatusFilter(event.target.value as 'all' | CircularBuildStatus)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="all">All Status</option>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button variant="outline" onClick={() => void loadAdminRequests()} disabled={adminLoading}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">Total: {adminSummary.total}</Badge>
              <Badge variant="outline">Submitted: {adminSummary.submitted}</Badge>
              <Badge variant="outline">Under review: {adminSummary.underReview}</Badge>
              <Badge variant="outline">Approved: {adminSummary.approved}</Badge>
              <Badge variant="outline">Rejected: {adminSummary.rejected}</Badge>
              <Badge variant="outline">Picked up: {adminSummary.pickedUp}</Badge>
            </div>

            {adminError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{adminError}</p>
            ) : null}
            {adminLoading ? <p className="text-sm text-slate-600">Loading admin queue...</p> : null}
            {!adminLoading && adminRequests.length === 0 ? (
              <p className="text-sm text-slate-600">No requests found for selected filters.</p>
            ) : null}

            {!adminLoading && adminRequests.length > 0 ? (
              <div className="space-y-3">
                {adminRequests.map((request) => {
                  const draft = getAdminDraft(request);
                  const isSaving = adminSavingId === request.id;

                  return (
                    <article key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{request.requestCode}</p>
                          <p className="text-xs text-slate-600">
                            {request.materials.length} material{request.materials.length === 1 ? '' : 's'} submitted
                          </p>
                          <p className="text-xs text-slate-600">
                            Seller: {request.submittedByName || request.contactName || 'Unknown'} | Phone:{' '}
                            {request.contactPhone || '-'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {request.locationCity} | {request.locationAddress}
                          </p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(request.status)}`}>
                          {request.statusLabel}
                        </span>
                      </div>

                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Materials
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {request.materials.map((material, materialIndex) => (
                            <Badge
                              key={`${request.id}-admin-material-${materialIndex}`}
                              variant="outline"
                              className="text-[11px]"
                            >
                              {materialSummaryLabel(material)}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Status
                          </label>
                          <select
                            value={draft.status}
                            onChange={(event) =>
                              setAdminDrafts((current) => ({
                                ...current,
                                [request.id]: {
                                  ...draft,
                                  status: event.target.value as CircularBuildStatus,
                                },
                              }))
                            }
                            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Valuation (INR)
                          </label>
                          <Input
                            value={draft.valuationInr}
                            onChange={(event) =>
                              setAdminDrafts((current) => ({
                                ...current,
                                [request.id]: {
                                  ...draft,
                                  valuationInr: event.target.value.replace(/[^\d.]/g, ''),
                                },
                              }))
                            }
                            placeholder="Internal valuation"
                            className="h-10 bg-white"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Public note (seller visible)
                          </label>
                          <Input
                            value={draft.publicNote}
                            onChange={(event) =>
                              setAdminDrafts((current) => ({
                                ...current,
                                [request.id]: {
                                  ...draft,
                                  publicNote: event.target.value,
                                },
                              }))
                            }
                            maxLength={500}
                            placeholder="Example: Inspection scheduled for tomorrow."
                            className="h-10 bg-white"
                          />
                        </div>
                      </div>

                      <div className="mt-2">
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Internal admin note
                        </label>
                        <Textarea
                          value={draft.internalNote}
                          onChange={(event) =>
                            setAdminDrafts((current) => ({
                              ...current,
                              [request.id]: {
                                ...draft,
                                internalNote: event.target.value,
                              },
                            }))
                          }
                          maxLength={1000}
                          placeholder="Internal quality, fraud, logistics, or valuation notes."
                          className="min-h-16 bg-white"
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          onClick={() => void handleAdminUpdate(request)}
                          disabled={isSaving}
                          className="bg-blue-700 text-white hover:bg-blue-800"
                        >
                          {isSaving ? 'Saving...' : 'Save Status'}
                        </Button>
                        {request.status === 'approved' || request.status === 'picked_up' ? (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            Operationally active
                          </Badge>
                        ) : null}
                        {request.status === 'rejected' ? (
                          <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">
                            <XCircle className="mr-1 h-3.5 w-3.5" />
                            Rejected
                          </Badge>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Trust & Safety</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <ShieldCheck className="mb-2 h-4 w-4 text-blue-700" />
              Photo verification and manual review before acceptance.
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <FileSearch className="mb-2 h-4 w-4 text-blue-700" />
              ZDT reserves right to reject any request without valuation disclosure.
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <Truck className="mb-2 h-4 w-4 text-blue-700" />
              Pickup and reuse decisions are controlled exclusively by ZDT operations.
            </div>
          </div>
        </div>
          </>
        )}
      </div>
    </section>
  );
}
