import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  Bed,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  Hammer,
  Home,
  Loader2,
  Map as MapIcon,
  MapPinned,
  Ruler,
  Search,
  ShieldAlert,
  Sparkles,
  SunMedium,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import {
  getAiServicesCatalog,
  runAiService,
  type AiProviderStatus,
  type AiServiceAction,
  type AiServiceKey,
  type AiServiceRunResponse,
} from '@/lib/aiServicesApi';
import { getBuildingMaterials, type MaterialItem } from '@/lib/materialsApi';
import { cn } from '@/lib/utils';

type FieldKind = 'text' | 'number' | 'textarea' | 'select' | 'date';

interface FieldOption {
  label: string;
  value: string;
}

interface FieldConfig {
  name: string;
  inputName?: string;
  label: string;
  kind: FieldKind;
  defaultValue: string;
  placeholder?: string;
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: string;
  span?: 'full';
  transform?: (value: string) => unknown;
}

interface ServiceConfig {
  key: AiServiceKey;
  action: AiServiceAction;
  title: string;
  category: string;
  Icon: LucideIcon;
  tone: string;
  fields: FieldConfig[];
}

const styleOptions: FieldOption[] = [
  { label: 'Modern Indian', value: 'modern Indian' },
  { label: 'Minimalist Indian', value: 'minimalist Indian' },
  { label: 'Traditional Indian', value: 'traditional Indian' },
  { label: 'Contemporary', value: 'contemporary' },
  { label: 'Colonial', value: 'colonial' },
];

const budgetTierOptions: FieldOption[] = [
  { label: 'Economy', value: 'economy' },
  { label: 'Mid-range', value: 'mid-range' },
  { label: 'Premium', value: 'premium' },
  { label: 'Luxury', value: 'luxury' },
];

const SERVICE_CONFIGS: ServiceConfig[] = [
  {
    key: 'plot-polygon',
    action: 'analyze',
    title: 'AI Plot Polygon',
    category: 'Land intelligence',
    Icon: MapPinned,
    tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    fields: [
      {
        name: 'plotAreaSqft',
        label: 'Plot area',
        kind: 'number',
        defaultValue: '2400',
        min: 1,
        step: '1',
      },
      {
        name: 'localCode',
        label: 'Local code',
        kind: 'text',
        defaultValue: 'municipal residential setbacks',
      },
      {
        name: 'boundaryPointsText',
        inputName: 'boundaryPoints',
        label: 'Boundary points',
        kind: 'textarea',
        span: 'full',
        defaultValue:
          '19.0760,72.8777\n19.0761,72.8780\n19.0758,72.8782\n19.0757,72.8778',
        transform: parseBoundaryPoints,
      },
    ],
  },
  {
    key: 'home-design',
    action: 'generate',
    title: 'Home Design AI',
    category: 'Architecture',
    Icon: Home,
    tone: 'text-blue-700 bg-blue-50 border-blue-200',
    fields: [
      { name: 'plotAreaSqft', label: 'Plot area', kind: 'number', defaultValue: '1500', min: 1 },
      { name: 'budgetInr', label: 'Budget INR', kind: 'number', defaultValue: '5000000', min: 1 },
      { name: 'bedrooms', label: 'Bedrooms', kind: 'number', defaultValue: '3', min: 1, max: 12 },
      { name: 'floors', label: 'Floors', kind: 'number', defaultValue: '2', min: 1, max: 20 },
      {
        name: 'style',
        label: 'Style',
        kind: 'select',
        defaultValue: 'modern Indian',
        options: styleOptions,
      },
      {
        name: 'vastu',
        label: 'Vastu',
        kind: 'select',
        defaultValue: 'balanced',
        options: [
          { label: 'Balanced', value: 'balanced' },
          { label: 'Strict', value: 'strict' },
          { label: 'Flexible', value: 'flexible' },
        ],
      },
    ],
  },
  {
    key: 'interior-design',
    action: 'generate',
    title: 'Interior Design AI',
    category: 'Room planning',
    Icon: Bed,
    tone: 'text-rose-700 bg-rose-50 border-rose-200',
    fields: [
      {
        name: 'roomType',
        label: 'Room',
        kind: 'select',
        defaultValue: 'living room',
        options: [
          { label: 'Living room', value: 'living room' },
          { label: 'Bedroom', value: 'bedroom' },
          { label: 'Kitchen', value: 'kitchen' },
          { label: 'Bathroom', value: 'bathroom' },
          { label: 'Office', value: 'office' },
        ],
      },
      { name: 'roomSizeSqft', label: 'Room size', kind: 'number', defaultValue: '180', min: 1 },
      {
        name: 'style',
        label: 'Style',
        kind: 'select',
        defaultValue: 'minimalist Indian',
        options: styleOptions,
      },
      {
        name: 'budgetTier',
        label: 'Budget tier',
        kind: 'select',
        defaultValue: 'mid-range',
        options: budgetTierOptions,
      },
      { name: 'mood', label: 'Mood', kind: 'text', defaultValue: 'warm and calm' },
      {
        name: 'furnitureAndMaterialNeeds',
        label: 'Furniture and material needs',
        kind: 'textarea',
        defaultValue: 'sofa or bed, TV console, wardrobe/storage, modular units, curtains, lighting, ceiling, paint, tiles, wood finish, electrical and plumbing points',
        placeholder: 'List furniture, fixtures, finishes, or building materials needed for this room',
        span: 'full',
      },
    ],
  },
  {
    key: 'construction-planning',
    action: 'plan',
    title: 'Construction Planning',
    category: 'Execution',
    Icon: Hammer,
    tone: 'text-orange-700 bg-orange-50 border-orange-200',
    fields: [
      { name: 'builtUpAreaSqft', label: 'Built-up area', kind: 'number', defaultValue: '2200', min: 1 },
      { name: 'floors', label: 'Floors', kind: 'number', defaultValue: '2', min: 1, max: 40 },
      { name: 'budgetInr', label: 'Budget INR', kind: 'number', defaultValue: '6500000', min: 1 },
      { name: 'city', label: 'City', kind: 'text', defaultValue: 'Hyderabad' },
      { name: 'startDate', label: 'Start date', kind: 'date', defaultValue: '' },
      {
        name: 'constructionType',
        label: 'Type',
        kind: 'select',
        defaultValue: 'residential RCC',
        options: [
          { label: 'Residential RCC', value: 'residential RCC' },
          { label: 'Villa', value: 'villa' },
          { label: 'Commercial', value: 'commercial' },
          { label: 'Mixed use', value: 'mixed use' },
        ],
      },
    ],
  },
  {
    key: 'apartment-management',
    action: 'analyze',
    title: 'Apartment Management',
    category: 'Operations',
    Icon: Building2,
    tone: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    fields: [
      { name: 'totalUnits', label: 'Total units', kind: 'number', defaultValue: '120', min: 1 },
      { name: 'occupiedUnits', label: 'Occupied units', kind: 'number', defaultValue: '98', min: 0 },
      { name: 'unpaidRentCount', label: 'Unpaid rent', kind: 'number', defaultValue: '7', min: 0 },
      { name: 'openComplaints', label: 'Open complaints', kind: 'number', defaultValue: '14', min: 0 },
      {
        name: 'monthlyRevenueInr',
        label: 'Monthly revenue INR',
        kind: 'number',
        defaultValue: '2400000',
        min: 0,
      },
    ],
  },
  {
    key: 'property-valuation',
    action: 'estimate',
    title: 'Property Valuation',
    category: 'Investment',
    Icon: Ruler,
    tone: 'text-cyan-700 bg-cyan-50 border-cyan-200',
    fields: [
      { name: 'areaSqft', label: 'Area', kind: 'number', defaultValue: '1200', min: 1 },
      { name: 'pricePerSqft', label: 'Price per sqft', kind: 'number', defaultValue: '7000', min: 1 },
      { name: 'locationScore', label: 'Location score', kind: 'number', defaultValue: '8', min: 1, max: 10 },
      { name: 'ageYears', label: 'Age years', kind: 'number', defaultValue: '4', min: 0 },
      { name: 'monthlyRentInr', label: 'Monthly rent INR', kind: 'number', defaultValue: '28000', min: 0 },
    ],
  },
  {
    key: 'document-assistant',
    action: 'draft',
    title: 'Document Assistant',
    category: 'Legal workflow',
    Icon: FileText,
    tone: 'text-amber-700 bg-amber-50 border-amber-200',
    fields: [
      {
        name: 'documentType',
        label: 'Document',
        kind: 'select',
        defaultValue: 'rental agreement',
        options: [
          { label: 'Rental agreement', value: 'rental agreement' },
          { label: 'Sale deed', value: 'sale deed' },
          { label: 'NOC', value: 'NOC' },
          { label: 'Power of attorney', value: 'power of attorney' },
          { label: 'Legal notice', value: 'legal notice' },
        ],
      },
      { name: 'state', label: 'State', kind: 'text', defaultValue: 'Telangana' },
      {
        name: 'language',
        label: 'Language',
        kind: 'select',
        defaultValue: 'English',
        options: [
          { label: 'English', value: 'English' },
          { label: 'Hindi', value: 'Hindi' },
          { label: 'Telugu', value: 'Telugu' },
          { label: 'Tamil', value: 'Tamil' },
          { label: 'Kannada', value: 'Kannada' },
        ],
      },
      {
        name: 'propertyDetails',
        label: 'Property details',
        kind: 'textarea',
        span: 'full',
        defaultValue: '2BHK apartment, 1200 sqft, Kondapur, Hyderabad',
      },
    ],
  },
  {
    key: 'structural-analysis',
    action: 'analyze',
    title: 'Structural Analysis',
    category: 'Safety',
    Icon: ShieldAlert,
    tone: 'text-red-700 bg-red-50 border-red-200',
    fields: [
      { name: 'buildingAgeYears', label: 'Building age', kind: 'number', defaultValue: '12', min: 0 },
      { name: 'floors', label: 'Floors', kind: 'number', defaultValue: '4', min: 1 },
      { name: 'seismicZone', label: 'Seismic zone', kind: 'text', defaultValue: 'III' },
      { name: 'crackWidthMm', label: 'Crack width mm', kind: 'number', defaultValue: '1.5', min: 0, step: '0.1' },
      {
        name: 'notes',
        label: 'Observed notes',
        kind: 'textarea',
        span: 'full',
        defaultValue: 'Minor wall cracks near window corners and light seepage after rain.',
      },
    ],
  },
  {
    key: 'energy-optimizer',
    action: 'analyze',
    title: 'Energy Optimizer',
    category: 'Sustainability',
    Icon: SunMedium,
    tone: 'text-lime-700 bg-lime-50 border-lime-200',
    fields: [
      { name: 'monthlyBillInr', label: 'Monthly bill INR', kind: 'number', defaultValue: '8500', min: 0 },
      { name: 'roofAreaSqft', label: 'Roof area', kind: 'number', defaultValue: '700', min: 0 },
      { name: 'connectedLoadKw', label: 'Load kW', kind: 'number', defaultValue: '6', min: 0, step: '0.1' },
      { name: 'sunHours', label: 'Sun hours', kind: 'number', defaultValue: '5', min: 0, step: '0.1' },
      {
        name: 'buildingType',
        label: 'Building',
        kind: 'select',
        defaultValue: 'residential',
        options: [
          { label: 'Residential', value: 'residential' },
          { label: 'Apartment common area', value: 'apartment common area' },
          { label: 'Commercial', value: 'commercial' },
        ],
      },
    ],
  },
  {
    key: 'neighborhood-analyzer',
    action: 'analyze',
    title: 'Neighborhood Analyzer',
    category: 'Location',
    Icon: MapIcon,
    tone: 'text-violet-700 bg-violet-50 border-violet-200',
    fields: [
      { name: 'location', label: 'Location', kind: 'text', defaultValue: 'Kondapur, Hyderabad' },
      { name: 'radiusKm', label: 'Radius km', kind: 'number', defaultValue: '3', min: 1, step: '0.5' },
      {
        name: 'buyerProfile',
        label: 'Profile',
        kind: 'select',
        defaultValue: 'family',
        options: [
          { label: 'Family', value: 'family' },
          { label: 'Rental investor', value: 'rental investor' },
          { label: 'Senior living', value: 'senior living' },
          { label: 'First home buyer', value: 'first home buyer' },
        ],
      },
      { name: 'budgetInr', label: 'Budget INR', kind: 'number', defaultValue: '9000000', min: 0 },
      {
        name: 'propertyType',
        label: 'Property',
        kind: 'select',
        defaultValue: 'apartment',
        options: [
          { label: 'Apartment', value: 'apartment' },
          { label: 'Villa', value: 'villa' },
          { label: 'Plot', value: 'plot' },
          { label: 'Commercial', value: 'commercial' },
        ],
      },
    ],
  },
];

const SERVICES_BY_KEY = new Map(SERVICE_CONFIGS.map((service) => [service.key, service]));

function readInitialServiceKey(): AiServiceKey {
  if (typeof window === 'undefined') {
    return 'home-design';
  }

  const requestedService = new URLSearchParams(window.location.search).get('service') as AiServiceKey | null;
  return requestedService && SERVICES_BY_KEY.has(requestedService) ? requestedService : 'home-design';
}

function AIServicesPage() {
  const [selectedKey, setSelectedKey] = useState<AiServiceKey>(() => readInitialServiceKey());
  const selectedService = SERVICES_BY_KEY.get(selectedKey) || SERVICE_CONFIGS[0];
  const [formValues, setFormValues] = useState<Record<string, string>>(() =>
    buildInitialValues(selectedService)
  );
  const [providerStatus, setProviderStatus] = useState<AiProviderStatus | null>(null);
  const [catalogCount, setCatalogCount] = useState(SERVICE_CONFIGS.length);
  const [isStatusLoading, setIsStatusLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<AiServiceRunResponse | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const bedrockStatus = useMemo(
    () => providerStatus?.providers.find((provider) => provider.key === 'bedrock') || null,
    [providerStatus]
  );

  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      setIsStatusLoading(true);
      try {
        const response = await getAiServicesCatalog();
        if (!active) {
          return;
        }
        setProviderStatus(response.providerStatus);
        setCatalogCount(response.services.length || SERVICE_CONFIGS.length);
      } catch {
        if (active) {
          setProviderStatus(null);
        }
      } finally {
        if (active) {
          setIsStatusLoading(false);
        }
      }
    }

    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setFormValues(buildInitialValues(selectedService));
    setResult(null);
    setError('');
    setCopied(false);
  }, [selectedService]);

  const updateField = (name: string) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const nextValue = event.target.value;
    setFormValues((current) => ({
      ...current,
      [name]: nextValue,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsRunning(true);
    setError('');
    setCopied(false);

    try {
      const response = await runAiService(selectedService.key, {
        outputDetail: 'brief',
        inputs: buildServiceInputs(selectedService, formValues),
      }, selectedService.action);
      setResult(response);
    } catch (submitError) {
      setResult(null);
      setError(submitError instanceof Error ? submitError.message : 'AI service request failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const copyResult = async () => {
    if (!result) {
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(result.result, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const ActiveIcon = selectedService.Icon;

  return (
    <section className="min-h-screen bg-slate-50 pt-24">
      <div className="page-container pb-10">
        <div className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex h-8 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {catalogCount} AI services
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              AI Services
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Plot, design, construction, valuation, documents, safety, energy, and location intelligence for real estate workflows.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <StatusPill
              icon={bedrockStatus?.configured ? CheckCircle2 : AlertTriangle}
              label={bedrockStatus?.configured ? 'Bedrock active' : 'Bedrock offline'}
              value={isStatusLoading ? 'Checking' : bedrockStatus?.model || 'Fallback ready'}
              active={Boolean(bedrockStatus?.configured)}
            />
            <StatusPill
              icon={Zap}
              label="Provider"
              value={providerStatus?.preference || 'auto'}
              active={Boolean(providerStatus)}
            />
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
          <aside className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="grid gap-2">
              {SERVICE_CONFIGS.map((service) => {
                const Icon = service.Icon;
                const isSelected = service.key === selectedKey;
                return (
                  <button
                    key={service.key}
                    type="button"
                    onClick={() => setSelectedKey(service.key)}
                    className={cn(
                      'flex min-h-16 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
                      isSelected
                        ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-800'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border',
                        isSelected ? 'border-white/20 bg-white/10 text-white' : service.tone
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-5">{service.title}</span>
                      <span className={cn('block text-xs', isSelected ? 'text-slate-300' : 'text-slate-500')}>
                        {service.category}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className={cn('flex h-11 w-11 items-center justify-center rounded-lg border', selectedService.tone)}>
                  <ActiveIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">{selectedService.title}</h2>
                  <p className="text-sm text-slate-500">{selectedService.category}</p>
                </div>
              </div>
              <button
                type="submit"
                disabled={isRunning}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                Run service
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {selectedService.fields.map((field) => (
                <FieldControl
                  key={field.name}
                  field={field}
                  value={formValues[field.name] || ''}
                  onChange={updateField(field.name)}
                />
              ))}
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold text-slate-800">Prompt</span>
              <textarea
                value={formValues.prompt || ''}
                onChange={updateField('prompt')}
                rows={4}
                className="min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                placeholder="Optional project brief"
              />
            </label>

            {error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            ) : null}
          </form>

          <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Result</h2>
                <p className="text-sm text-slate-500">
                  {result ? `${result.provider.source} / ${result.provider.model}` : 'Ready'}
                </p>
              </div>
              <button
                type="button"
                onClick={copyResult}
                disabled={!result}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Copy result"
                title="Copy result"
              >
                {copied ? <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>

            {isRunning ? (
              <div className="flex min-h-[420px] items-center justify-center">
                <div className="text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">Bedrock running</p>
                </div>
              </div>
            ) : result ? (
              <ResultPanel result={result} />
            ) : (
              <div className="flex min-h-[420px] items-center justify-center text-center">
                <div>
                  <Search className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-slate-600">No result</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

function StatusPill({
  icon: Icon,
  label,
  value,
  active,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
          active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase text-slate-500">{label}</span>
        <span className="block max-w-56 truncate text-sm font-semibold text-slate-900">{value}</span>
      </span>
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}) {
  const className =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15';

  return (
    <label className={cn('block', field.span === 'full' && 'md:col-span-2')}>
      <span className="mb-2 block text-sm font-semibold text-slate-800">{field.label}</span>
      {field.kind === 'select' ? (
        <select value={value} onChange={onChange} className={className}>
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.kind === 'textarea' ? (
        <textarea
          value={value}
          onChange={onChange}
          rows={5}
          className={cn(className, 'min-h-32 resize-y')}
          placeholder={field.placeholder}
        />
      ) : (
        <input
          type={field.kind}
          value={value}
          onChange={onChange}
          min={field.min}
          max={field.max}
          step={field.step}
          className={className}
          placeholder={field.placeholder}
        />
      )}
    </label>
  );
}

function ResultPanel({ result }: { result: AiServiceRunResponse }) {
  const designPreview = buildDesignPreview(result);
  const [interiorCatalogItems, setInteriorCatalogItems] = useState<MaterialItem[]>([]);
  const [isInteriorCatalogLoading, setIsInteriorCatalogLoading] = useState(false);

  useEffect(() => {
    if (result.service.key !== 'interior-design') {
      setInteriorCatalogItems([]);
      return;
    }

    let active = true;
    setIsInteriorCatalogLoading(true);

    async function loadInteriorCatalog() {
      try {
        const response = await getBuildingMaterials({
          q: 'interior furniture modular wardrobe kitchen tv console vanity gypsum paint tiles wood electrical plumbing',
          limit: 8,
        });
        if (active) {
          setInteriorCatalogItems(filterInteriorCatalogItems(response.items));
        }
      } catch {
        if (active) {
          setInteriorCatalogItems([]);
        }
      } finally {
        if (active) {
          setIsInteriorCatalogLoading(false);
        }
      }
    }

    void loadInteriorCatalog();

    return () => {
      active = false;
    };
  }, [result]);

  return (
    <div className="space-y-5">
      {designPreview ? <DesignPreviewImage preview={designPreview} /> : null}
      {result.service.key === 'interior-design' ? (
        <InteriorCatalogRecommendations items={interiorCatalogItems} isLoading={isInteriorCatalogLoading} />
      ) : null}

      <div>
        <p className="text-sm font-semibold uppercase text-slate-500">Summary</p>
        <p className="mt-2 text-sm leading-6 text-slate-800">{result.result.summary}</p>
      </div>

      <div>
        <p className="text-sm font-semibold uppercase text-slate-500">Output</p>
        <div className="mt-2 border-t border-slate-200">
          {result.service.key === 'interior-design' ? (
            <InteriorDesignOutput output={result.result.output} />
          ) : (
            <ResultValue value={result.result.output} />
          )}
        </div>
      </div>

      <ResultList title="Next actions" items={result.result.nextActions} />
      <ResultList title="Assumptions" items={result.result.assumptions} />
      <ResultList title="Risks" items={result.result.risks} />

      {result.warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">Warnings</p>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-amber-800">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

interface DesignPreview {
  title: string;
  subtitle: string;
  svg: string;
  imageSrc: string;
  palette: string[];
  notes: string[];
}

function DesignPreviewImage({ preview }: { preview: DesignPreview }) {
  const downloadSvg = () => {
    const blob = new Blob([preview.svg], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${slugifyFileName(preview.title)}.svg`);
  };

  const downloadPng = async () => {
    const blobUrl = URL.createObjectURL(new Blob([preview.svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const image = await loadImage(blobUrl);
      const canvas = document.createElement('canvas');
      canvas.width = 1800;
      canvas.height = 1240;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas is not available.');
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas);
      downloadBlob(blob, `${slugifyFileName(preview.title)}.png`);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <img
        src={preview.imageSrc}
        alt={`${preview.title} visual preview`}
        className="aspect-[16/11] w-full bg-white object-cover"
      />
      <div className="border-t border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold uppercase text-blue-700">Visual Design</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">{preview.title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{preview.subtitle}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void downloadPng()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            PNG
          </button>
          <button
            type="button"
            onClick={downloadSvg}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            SVG
          </button>
        </div>
        {preview.palette.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {preview.palette.map((color) => (
              <span key={color} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                <span
                  className="h-4 w-4 rounded-full border border-slate-200"
                  style={{ backgroundColor: resolvePaletteColor(color) }}
                  aria-hidden="true"
                />
                {color}
              </span>
            ))}
          </div>
        ) : null}
        {preview.notes.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {preview.notes.map((note) => (
              <p key={note} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                {note}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InteriorCatalogRecommendations({
  items,
  isLoading,
}: {
  items: MaterialItem[];
  isLoading: boolean;
}) {
  const displayItems = items.length > 0 ? items : INTERIOR_CATALOG_FALLBACKS;

  return (
    <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase text-rose-700">Furniture & Materials</p>
          <h3 className="mt-1 text-base font-semibold text-slate-950">Recommended from ZDT catalog</h3>
        </div>
        {isLoading ? <Loader2 className="mt-1 h-4 w-4 animate-spin text-rose-600" aria-hidden="true" /> : null}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {displayItems.slice(0, 8).map((item) => (
          <a
            key={item.id}
            href={buildMaterialCatalogHref(item.itemName, item.category)}
            className="block rounded-lg border border-white bg-white px-3 py-2 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
          >
            <p className="text-sm font-semibold leading-5 text-slate-900">{item.itemName}</p>
            <p className="mt-1 text-xs text-slate-500">{item.category} | {item.brand}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700">
                Rs {formatInr(item.unitPrice)} / {item.unit}
              </p>
              <span className="text-xs font-semibold text-rose-700">View</span>
            </div>
          </a>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        Click any item to open the Building Materials section with the matching product search.
      </p>
    </div>
  );
}

function InteriorDesignOutput({ output }: { output: unknown }) {
  const record = readRecord(output);
  const roomType = readFlexibleString(record, ['roomType', 'room'], '');
  const style = readFlexibleString(record, ['style', 'theme'], '');
  const mood = readFlexibleString(record, ['mood', 'feel'], '');
  const roomSize = readFlexibleString(record, ['roomSizeSqft', 'areaSqft'], '');
  const theme = readFlexibleString(record, ['theme', 'designTheme', 'concept'], '');
  const paletteItems = readDisplayItems(readFlexibleValue(record, ['palette', 'finishes', 'materialPalette']));
  const zones = readDisplayItems(readFlexibleValue(record, ['zones', 'layoutZones', 'furnitureZoning']));
  const furniture = readDisplayItems(readFlexibleValue(record, ['furnitureAndFixtures', 'furniture', 'fixtures']));
  const materials = readDisplayItems(readFlexibleValue(record, ['buildingMaterialSelections', 'materials', 'finishSelections']));
  const lighting = readDisplayItems(readFlexibleValue(record, ['lightingPlan', 'lighting']));
  const shopping = readDisplayItems(readFlexibleValue(record, ['shoppingPlan', 'budgetPlan']));
  const catalogMatches = readCatalogMatches(readFlexibleValue(record, ['catalogMatches', 'recommendedMaterials', 'materialCatalog']));
  const roomSizeLabel = roomSize ? (/\bsq/i.test(roomSize) ? `Size: ${roomSize}` : `Size: ${roomSize} sqft`) : '';
  const briefItems = [
    roomType ? `Room: ${roomType}` : '',
    roomSizeLabel,
    style ? `Style: ${style}` : '',
    mood ? `Mood: ${mood}` : '',
    theme ? `Theme: ${theme}` : '',
  ].filter(Boolean);

  return (
    <div className="space-y-4 py-3">
      {briefItems.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-900">Design brief</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {briefItems.map((item) => (
              <span key={item} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <InteriorOutputSection title="Palette & finishes" items={paletteItems} variant="palette" />
      <InteriorOutputSection title="Furniture & layout" items={[...furniture, ...zones]} />
      <InteriorOutputSection title="Building materials" items={materials} />

      {catalogMatches.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-900">Catalog matches</p>
          <div className="mt-3 grid gap-2">
            {catalogMatches.map((match) => (
              <a
                key={`${match.itemName}-${match.category}-${match.useCase}`}
                href={buildMaterialCatalogHref(match.itemName, match.category)}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:border-rose-200 hover:bg-rose-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{match.itemName}</p>
                    <p className="mt-1 text-xs text-slate-500">{match.category}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-semibold text-rose-700">
                    View
                  </span>
                </div>
                {[match.useCase, match.quantityHint, match.priority ? `Priority: ${match.priority}` : '']
                  .filter(Boolean)
                  .map((line) => (
                    <p key={line} className="mt-2 text-xs leading-5 text-slate-600">
                      {line}
                    </p>
                  ))}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <InteriorOutputSection title="Lighting plan" items={lighting} />
      <InteriorOutputSection title="Shopping plan" items={shopping} />
    </div>
  );
}

function InteriorOutputSection({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant?: 'palette';
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div key={item} className="flex gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
            {variant === 'palette' ? (
              <span
                className="mt-1 h-4 w-4 shrink-0 rounded-full border border-slate-200"
                style={{ backgroundColor: resolvePaletteColor(item) }}
                aria-hidden="true"
              />
            ) : null}
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildDesignPreview(result: AiServiceRunResponse): DesignPreview | null {
  if (result.service.key === 'home-design') {
    return buildHomeDesignPreview(result);
  }
  if (result.service.key === 'interior-design') {
    return buildInteriorDesignPreview(result);
  }
  return null;
}

function buildHomeDesignPreview(result: AiServiceRunResponse): DesignPreview {
  const output = result.result.output;
  const concept = readRecord(output.concept);
  const style = readResultString(concept, 'style', 'modern Indian');
  const bedrooms = readResultNumber(concept, 'bedrooms', 3);
  const floors = readResultNumber(concept, 'floors', 2);
  const builtUpArea = readResultNumber(concept, 'suggestedBuiltUpAreaSqft', 2200);
  const budgetFit = readResultString(concept, 'budgetFit', 'concept ready').replace(/_/g, ' ');
  const roomSchedule = Array.isArray(output.roomSchedule) ? output.roomSchedule : [];
  const labels = roomSchedule
    .map((room) => readResultString(readRecord(room), 'room', ''))
    .filter(Boolean)
    .slice(0, 5);

  const svg = buildHomePlanSvg({ style, bedrooms, floors, builtUpArea, budgetFit, labels });

  return {
    title: `${bedrooms}BHK ${style} home concept`,
    subtitle: `${floors} floor plan preview with ${Math.round(builtUpArea).toLocaleString('en-IN')} sqft suggested built-up area.`,
    svg,
    imageSrc: svgToDataUri(svg),
    palette: ['warm white', 'teak wood', 'sage green', 'slate'],
    notes: [
      'Concept image is generated from the AI plan data.',
      'Use architect drawings and local approvals before execution.',
    ],
  };
}

function buildInteriorDesignPreview(result: AiServiceRunResponse): DesignPreview {
  const output = result.result.output;
  const roomType = readResultString(output, 'roomType', 'living room');
  const style = readResultString(output, 'style', 'minimalist Indian');
  const mood = readResultString(output, 'mood', 'warm and calm');
  const roomSizeSqft = readResultNumber(output, 'roomSizeSqft', 180);
  const palette = readStringArray(output.palette).slice(0, 5);
  const zones = readStringArray(output.zones).slice(0, 4);
  const furniture = readStringArray(output.furnitureAndFixtures).slice(0, 3);
  const materials = readStringArray(output.buildingMaterialSelections).slice(0, 3);

  const svg = buildInteriorDesignSvg({ roomType, style, mood, palette, zones, furniture, materials });

  return {
    title: `${capitalizeWords(roomType)} ${style} concept`,
    subtitle: `${Math.round(roomSizeSqft)} sqft room preview with a ${mood} mood.`,
    svg,
    imageSrc: svgToDataUri(svg),
    palette: palette.length > 0 ? palette : ['warm white', 'teak wood', 'sage green', 'matte black'],
    notes: [...zones, ...furniture, ...materials].slice(0, 6),
  };
}

function buildHomePlanSvg({
  style,
  bedrooms,
  floors,
  builtUpArea,
  budgetFit,
  labels,
}: {
  style: string;
  bedrooms: number;
  floors: number;
  builtUpArea: number;
  budgetFit: string;
  labels: string[];
}) {
  const roomLabels = labels.length > 0 ? labels : ['Living and dining', 'Kitchen', 'Bedrooms', 'Bathrooms', 'Stairs'];
  const safeStyle = escapeSvgText(style);
  const safeBudgetFit = escapeSvgText(budgetFit);
  const label = (index: number, fallback: string) => escapeSvgText(roomLabels[index] || fallback);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 620" role="img">
  <rect width="900" height="620" fill="#f8fafc"/>
  <rect x="40" y="36" width="820" height="548" rx="26" fill="#ffffff" stroke="#cbd5e1"/>
  <text x="70" y="82" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#0f172a">${bedrooms}BHK Home Plan</text>
  <text x="70" y="111" font-family="Inter, Arial, sans-serif" font-size="14" fill="#475569">${safeStyle} style, ${floors} floor(s), ${Math.round(builtUpArea).toLocaleString('en-IN')} sqft built-up</text>
  <rect x="70" y="140" width="540" height="370" rx="14" fill="#fefefe" stroke="#1e293b" stroke-width="4"/>
  <rect x="84" y="154" width="250" height="160" rx="8" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>
  <text x="106" y="234" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="#1e3a8a">${label(0, 'Living')}</text>
  <text x="106" y="260" font-family="Inter, Arial, sans-serif" font-size="13" fill="#1e40af">wide opening, daylight edge</text>
  <rect x="348" y="154" width="248" height="116" rx="8" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/>
  <text x="372" y="214" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700" fill="#166534">${label(1, 'Kitchen')}</text>
  <rect x="348" y="284" width="118" height="104" rx="8" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
  <text x="368" y="339" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="700" fill="#92400e">${label(3, 'Bath')}</text>
  <rect x="480" y="284" width="116" height="104" rx="8" fill="#f1f5f9" stroke="#64748b" stroke-width="2"/>
  <text x="500" y="339" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="700" fill="#334155">${label(4, 'Stairs')}</text>
  <rect x="84" y="328" width="250" height="168" rx="8" fill="#ffe4e6" stroke="#e11d48" stroke-width="2"/>
  <text x="106" y="414" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="#9f1239">${label(2, 'Bedrooms')}</text>
  <line x1="334" y1="154" x2="334" y2="496" stroke="#1e293b" stroke-width="3"/>
  <line x1="348" y1="270" x2="596" y2="270" stroke="#1e293b" stroke-width="3"/>
  <line x1="348" y1="388" x2="596" y2="388" stroke="#1e293b" stroke-width="3"/>
  <path d="M245 510 L445 510" stroke="#0f172a" stroke-width="8" stroke-linecap="round"/>
  <text x="292" y="544" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" fill="#334155">front road / parking edge</text>
  <g transform="translate(640 150)">
    <rect width="180" height="230" rx="18" fill="#f8fafc" stroke="#e2e8f0"/>
    <text x="24" y="42" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700" fill="#0f172a">Plan Notes</text>
    <circle cx="34" cy="78" r="7" fill="#2563eb"/><text x="52" y="83" font-family="Inter, Arial, sans-serif" font-size="13" fill="#334155">Light first rooms</text>
    <circle cx="34" cy="114" r="7" fill="#16a34a"/><text x="52" y="119" font-family="Inter, Arial, sans-serif" font-size="13" fill="#334155">Stack plumbing</text>
    <circle cx="34" cy="150" r="7" fill="#e11d48"/><text x="52" y="155" font-family="Inter, Arial, sans-serif" font-size="13" fill="#334155">Private bedrooms</text>
    <circle cx="34" cy="186" r="7" fill="#64748b"/><text x="52" y="191" font-family="Inter, Arial, sans-serif" font-size="13" fill="#334155">Central stairs</text>
  </g>
  <g transform="translate(640 406)">
    <rect width="180" height="74" rx="16" fill="#0f172a"/>
    <text x="22" y="31" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" fill="#bfdbfe">Budget fit</text>
    <text x="22" y="55" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700" fill="#ffffff">${safeBudgetFit}</text>
  </g>
</svg>`;
}

function buildInteriorDesignSvg({
  roomType,
  style,
  mood,
  palette,
  zones,
  furniture,
  materials,
}: {
  roomType: string;
  style: string;
  mood: string;
  palette: string[];
  zones: string[];
  furniture: string[];
  materials: string[];
}) {
  const safeRoomType = escapeSvgText(capitalizeWords(roomType));
  const safeStyle = escapeSvgText(style);
  const safeMood = escapeSvgText(mood);
  const colors = (palette.length > 0 ? palette : ['warm white', 'teak wood', 'sage green', 'matte black']).map(resolvePaletteColor);
  const primary = colors[0] || '#f8fafc';
  const wood = colors[1] || '#9a6b3f';
  const accent = colors[2] || '#86a789';
  const dark = colors[3] || '#1f2937';
  const isBedroom = /bed/i.test(roomType);
  const isKitchen = /kitchen/i.test(roomType);
  const zoneLabels = zones.length > 0 ? zones : ['primary zone', 'storage wall', 'ambient lighting'];
  const furnitureLabels = furniture.length > 0 ? furniture : getDefaultFurnitureForRoom(roomType);
  const materialLabels = materials.length > 0 ? materials : ['gypsum ceiling', 'paint finish', 'floor or wall tiles'];

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 620" role="img">
  <rect width="900" height="620" fill="#f8fafc"/>
  <rect x="40" y="36" width="820" height="548" rx="26" fill="#ffffff" stroke="#cbd5e1"/>
  <text x="70" y="82" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#0f172a">${safeRoomType} Interior</text>
  <text x="70" y="111" font-family="Inter, Arial, sans-serif" font-size="14" fill="#475569">${safeStyle} style, ${safeMood} mood</text>
  <polygon points="92,172 598,172 640,476 58,476" fill="${primary}" stroke="#cbd5e1"/>
  <polygon points="92,172 598,172 598,384 92,384" fill="#f8fafc" stroke="#e2e8f0"/>
  <polygon points="92,384 598,384 640,476 58,476" fill="${wood}" opacity="0.8"/>
  <rect x="138" y="202" width="144" height="98" rx="8" fill="#ffffff" stroke="#cbd5e1"/>
  <rect x="330" y="196" width="196" height="136" rx="10" fill="${accent}" opacity="0.22" stroke="${accent}"/>
  <circle cx="450" cy="128" r="22" fill="#fde68a" opacity="0.75"/>
  <path d="M450 150 C426 182 394 196 366 204" stroke="#fde68a" stroke-width="7" stroke-linecap="round" opacity="0.55"/>
  ${
    isKitchen
      ? `<rect x="132" y="322" width="404" height="48" rx="10" fill="${dark}"/>
  <rect x="154" y="292" width="86" height="36" rx="8" fill="#ffffff" stroke="#cbd5e1"/>
  <rect x="264" y="292" width="88" height="36" rx="8" fill="#ffffff" stroke="#cbd5e1"/>
  <rect x="376" y="292" width="118" height="36" rx="8" fill="#ffffff" stroke="#cbd5e1"/>
  <circle cx="198" cy="345" r="11" fill="#94a3b8"/>
  <circle cx="218" cy="345" r="11" fill="#94a3b8"/>`
      : isBedroom
        ? `<rect x="164" y="314" width="250" height="104" rx="18" fill="${dark}"/>
  <rect x="184" y="300" width="94" height="46" rx="12" fill="#ffffff"/>
  <rect x="300" y="300" width="94" height="46" rx="12" fill="#ffffff"/>
  <rect x="444" y="318" width="62" height="86" rx="10" fill="${wood}"/>`
        : `<rect x="148" y="330" width="254" height="82" rx="26" fill="${dark}"/>
  <rect x="174" y="300" width="98" height="52" rx="18" fill="${accent}"/>
  <rect x="446" y="318" width="92" height="72" rx="14" fill="${wood}"/>
  <circle cx="492" cy="318" r="34" fill="#ffffff" stroke="#cbd5e1"/>`
  }
  <g transform="translate(640 150)">
    <rect width="190" height="258" rx="18" fill="#f8fafc" stroke="#e2e8f0"/>
    <text x="22" y="40" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700" fill="#0f172a">Palette</text>
    ${colors
      .slice(0, 4)
      .map(
        (color, index) =>
          `<circle cx="${36 + index * 38}" cy="82" r="15" fill="${color}" stroke="#cbd5e1"/>`
      )
      .join('')}
    <text x="22" y="128" font-family="Inter, Arial, sans-serif" font-size="13" fill="#475569">${escapeSvgText(zoneLabels[0] || 'primary zone')}</text>
    <text x="22" y="154" font-family="Inter, Arial, sans-serif" font-size="13" fill="#475569">${escapeSvgText(zoneLabels[1] || 'storage wall')}</text>
    <text x="22" y="190" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" fill="#0f172a">Furniture</text>
    <text x="22" y="216" font-family="Inter, Arial, sans-serif" font-size="12" fill="#475569">${escapeSvgText(furnitureLabels[0] || 'anchor furniture')}</text>
    <text x="22" y="238" font-family="Inter, Arial, sans-serif" font-size="12" fill="#475569">${escapeSvgText(furnitureLabels[1] || 'storage unit')}</text>
  </g>
  <g transform="translate(640 430)">
    <rect width="190" height="104" rx="18" fill="#0f172a"/>
    <text x="22" y="34" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" fill="#bfdbfe">Materials</text>
    <text x="22" y="60" font-family="Inter, Arial, sans-serif" font-size="12" fill="#ffffff">${escapeSvgText(materialLabels[0] || 'paint finish')}</text>
    <text x="22" y="82" font-family="Inter, Arial, sans-serif" font-size="12" fill="#ffffff">${escapeSvgText(materialLabels[1] || 'lighting and ceiling')}</text>
  </g>
</svg>`;
}

const INTERIOR_CATALOG_FALLBACKS: MaterialItem[] = [
  makeCatalogFallback('fallback-kitchen', 'Modular Kitchen Base Unit', 'Interior Fit-out', 'Spacewood', 3550, 'per running ft'),
  makeCatalogFallback('fallback-wardrobe', 'Modular Wardrobe Unit', 'Interior Fit-out', 'Godrej Interio', 2890, 'per running ft'),
  makeCatalogFallback('fallback-tv-console', 'Living Room TV Console Unit', 'Interior Fit-out', 'Greenply', 2180, 'per running ft'),
  makeCatalogFallback('fallback-vanity', 'Bathroom Vanity Counter Set', 'Interior Fit-out', 'Jaquar', 11250, 'per set'),
  makeCatalogFallback('fallback-gypsum', 'Gypsum Ceiling Board 12mm', 'Interior Fit-out', 'Saint-Gobain', 378, '8x4 sheet'),
  makeCatalogFallback('fallback-primer', 'Acrylic Wall Primer', 'Paint and Coatings', 'Asian Paints', 3280, '20L drum'),
];

function makeCatalogFallback(
  id: string,
  itemName: string,
  category: string,
  brand: string,
  unitPrice: number,
  unit: string
): MaterialItem {
  return {
    id,
    itemCode: id.toUpperCase(),
    itemName,
    category,
    brand,
    unit,
    unitPrice,
    minOrderQty: 1,
    deliveryDays: 0,
    locationCity: 'Ahmedabad',
    imageUrl: null,
    description: '',
    bulkSlab1: '',
    bulkSlab2: '',
    stockStatus: 'in_stock',
  };
}

function filterInteriorCatalogItems(items: MaterialItem[]) {
  const keywords = [
    'interior',
    'kitchen',
    'wardrobe',
    'tv',
    'console',
    'vanity',
    'gypsum',
    'paint',
    'tile',
    'wood',
    'electrical',
    'plumbing',
  ];
  const filtered = items.filter((item) => {
    const haystack = `${item.itemName} ${item.category} ${item.description}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });
  return filtered.length > 0 ? filtered : items;
}

function getDefaultFurnitureForRoom(roomType: string) {
  if (/kitchen/i.test(roomType)) {
    return ['modular base cabinets', 'tall storage unit', 'countertop and backsplash'];
  }
  if (/bed/i.test(roomType)) {
    return ['bed with side tables', 'modular wardrobe', 'study or dresser unit'];
  }
  if (/bath/i.test(roomType)) {
    return ['vanity counter set', 'mirror cabinet', 'glass partition'];
  }
  if (/office/i.test(roomType)) {
    return ['work desk', 'storage credenza', 'task chair'];
  }
  return ['sofa or seating set', 'tv console unit', 'coffee table'];
}

function formatInr(value: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
}

function svgToDataUri(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to prepare design image.'));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Unable to export design image.'));
    }, 'image/png');
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function slugifyFileName(value: string) {
  const normalized = String(value || 'design-preview')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'design-preview';
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readResultString(record: Record<string, unknown>, key: string, fallback: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : fallback;
}

function readResultNumber(record: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : fallback;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 8);
}

function readFlexibleValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key];
    }
  }

  const entries = Object.entries(record);
  for (const key of keys) {
    const normalizedKey = normalizeResultKey(key);
    const found = entries.find(([entryKey]) => normalizeResultKey(entryKey) === normalizedKey);
    if (found && found[1] !== undefined && found[1] !== null && found[1] !== '') {
      return found[1];
    }
  }

  return undefined;
}

function readFlexibleString(record: Record<string, unknown>, keys: string[], fallback: string) {
  const text = stringifyDisplayValue(readFlexibleValue(record, keys));
  return text || fallback;
}

function readDisplayItems(value: unknown): string[] {
  if (value === null || value === undefined || value === '') {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyDisplayValue(item))
      .filter(Boolean)
      .slice(0, 12);
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const text = stringifyDisplayValue(item);
        return text ? `${formatResultKey(key)}: ${text}` : '';
      })
      .filter(Boolean)
      .slice(0, 12);
  }

  const text = stringifyDisplayValue(value);
  return text ? [text] : [];
}

function readCatalogMatches(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return {
          itemName: item,
          category: 'Interior Fit-out',
          useCase: '',
          priority: '',
          quantityHint: '',
        };
      }

      const record = readRecord(item);
      const itemName = readFlexibleString(record, ['itemName', 'name', 'materialName', 'product'], '');
      if (!itemName) {
        return null;
      }
      return {
        itemName,
        category: readFlexibleString(record, ['category', 'materialCategory'], 'Interior Fit-out'),
        useCase: readFlexibleString(record, ['useCase', 'usage', 'reason'], ''),
        priority: readFlexibleString(record, ['priority'], ''),
        quantityHint: readFlexibleString(record, ['quantityHint', 'quantity', 'qty'], ''),
      };
    })
    .filter((item): item is { itemName: string; category: string; useCase: string; priority: string; quantityHint: string } =>
      Boolean(item)
    )
    .slice(0, 8);
}

function stringifyDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (Array.isArray(value)) {
    return value.map((item) => stringifyDisplayValue(item)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const text = stringifyDisplayValue(item);
        return text ? `${formatResultKey(key)}: ${text}` : '';
      })
      .filter(Boolean)
      .join(', ');
  }
  return String(value);
}

function normalizeResultKey(value: string) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function buildMaterialCatalogHref(itemName: string, category?: string) {
  const params = new URLSearchParams();
  const query = itemName.trim();
  const materialCategory = String(category || '').trim();
  if (query) params.set('q', query);
  if (materialCategory) params.set('category', materialCategory);
  params.set('source', 'interior-design');
  return `/building-materials?${params.toString()}#materials-catalog`;
}

function resolvePaletteColor(value: string) {
  const text = value.toLowerCase();
  if (text.includes('teak') || text.includes('wood')) return '#9a6b3f';
  if (text.includes('sage')) return '#86a789';
  if (text.includes('green')) return '#5c8a63';
  if (text.includes('black')) return '#1f2937';
  if (text.includes('white')) return '#f8fafc';
  if (text.includes('rose')) return '#e11d48';
  if (text.includes('blue')) return '#2563eb';
  if (text.includes('gold') || text.includes('brass')) return '#c08425';
  if (text.includes('grey') || text.includes('gray') || text.includes('slate')) return '#64748b';
  if (text.includes('cream') || text.includes('beige')) return '#ead8b8';
  return '#94a3b8';
}

function escapeSvgText(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalizeWords(value: string) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="text-sm font-semibold uppercase text-slate-500">{title}</p>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
        {items.map((item) => (
          <li key={item} className="border-l-2 border-slate-200 pl-3">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined || value === '') {
    return <div className="border-b border-slate-200 py-2 text-sm text-slate-500">Not available</div>;
  }

  if (Array.isArray(value)) {
    return (
      <div className="divide-y divide-slate-200">
        {value.map((item, index) => (
          <div key={`${depth}-${index}`} className="py-2">
            <ResultValue value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    return (
      <div className="divide-y divide-slate-200">
        {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
          <div key={key} className="grid gap-2 py-2 sm:grid-cols-[150px_minmax(0,1fr)]">
            <div className="text-sm font-semibold text-slate-600">{formatResultKey(key)}</div>
            <div className="min-w-0">
              <ResultValue value={item} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <div className="text-sm leading-6 text-slate-800">{String(value)}</div>;
}

function buildInitialValues(service: ServiceConfig) {
  return service.fields.reduce<Record<string, string>>((values, field) => {
    values[field.name] = field.defaultValue;
    return values;
  }, {});
}

function buildServiceInputs(service: ServiceConfig, values: Record<string, string>) {
  const inputs: Record<string, unknown> = {};

  for (const field of service.fields) {
    const rawValue = values[field.name] || '';
    const targetName = field.inputName || field.name;
    if (!rawValue.trim() && field.kind !== 'number') {
      continue;
    }
    if (field.transform) {
      inputs[targetName] = field.transform(rawValue);
    } else if (field.kind === 'number') {
      const numberValue = Number(rawValue);
      if (Number.isFinite(numberValue)) {
        inputs[targetName] = numberValue;
      }
    } else {
      inputs[targetName] = rawValue.trim();
    }
  }

  if (values.prompt?.trim()) {
    inputs.prompt = values.prompt.trim();
  }

  return inputs;
}

function parseBoundaryPoints(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [latValue, lngValue] = line.split(',').map((part) => Number(part.trim()));
      return {
        lat: latValue,
        lng: lngValue,
      };
    })
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function formatResultKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default AIServicesPage;
