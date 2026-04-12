import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  ExternalLink,
  HandCoins,
  LineChart,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/http';
import { getPropertiesForCategory } from '@/lib/portalData';
import { listProjects, type Project } from '@/lib/realtyApi';
import type { UserRole } from '@/lib/session';
import {
  listLiveRealtyStockSignals,
  type LiveRealtyStockSignal,
} from '@/lib/investmentSignalsApi';
import {
  createBuilderInvestmentRequest,
  createManualCompanySignal,
  getInvestmentSignalMode,
  listBuilderInvestmentRequests,
  listManualCompanySignals,
  removeManualCompanySignal,
  setInvestmentSignalMode,
  updateBuilderInvestmentRequestStatus,
  type BuilderInvestmentRequest,
  type InvestmentSignalMode,
  type ManualCompanySignal,
} from '@/lib/investmentStore';

interface InvestPageProps {
  onOpenProjects: () => void;
  onOpenProjectDetails: (projectId: number) => void;
  onOpenVoluntarySupport: () => void;
  onOpenMessages: (propertyReference?: string, draftMessage?: string) => void;
  onOpenCompanyMessages: (companyId?: number | null, draftMessage?: string) => void;
  isAuthenticated: boolean;
  userName?: string;
  userRole?: UserRole;
  isMainAdmin: boolean;
}

interface CompanyStockSignal {
  id: string;
  companyName: string;
  orderBookCr: number;
  projectCount: number;
  thesis: string;
  sourceLabel: string;
  sourceUrl: string;
  mode: 'auto' | 'manual';
}

const LIVE_STOCK_REFRESH_INTERVAL_MS = 2 * 60 * 1000;

const TOP_REALTY_STOCK_BASELINE: CompanyStockSignal[] = [
  {
    id: 'baseline-dlf',
    companyName: 'DLF Limited',
    orderBookCr: 38800,
    projectCount: 36,
    thesis: 'Large launch pipeline with strong residential and commercial booking visibility.',
    sourceLabel: 'Baseline real-estate stock ranking (order-book proxy)',
    sourceUrl: '/projects',
    mode: 'auto',
  },
  {
    id: 'baseline-godrej',
    companyName: 'Godrej Properties',
    orderBookCr: 32800,
    projectCount: 34,
    thesis: 'Multi-city expansion with sustained pre-sales momentum across premium and mid-income projects.',
    sourceLabel: 'Baseline real-estate stock ranking (order-book proxy)',
    sourceUrl: '/projects',
    mode: 'auto',
  },
  {
    id: 'baseline-macrotech',
    companyName: 'Macrotech Developers (Lodha)',
    orderBookCr: 29900,
    projectCount: 31,
    thesis: 'High-volume pipeline and ongoing township execution support large order-book coverage.',
    sourceLabel: 'Baseline real-estate stock ranking (order-book proxy)',
    sourceUrl: '/projects',
    mode: 'auto',
  },
  {
    id: 'baseline-prestige',
    companyName: 'Prestige Estates',
    orderBookCr: 27400,
    projectCount: 28,
    thesis: 'Balanced residential and commercial launches with strong south-market demand depth.',
    sourceLabel: 'Baseline real-estate stock ranking (order-book proxy)',
    sourceUrl: '/projects',
    mode: 'auto',
  },
  {
    id: 'baseline-oberoi',
    companyName: 'Oberoi Realty',
    orderBookCr: 23100,
    projectCount: 21,
    thesis: 'Premium segment concentration and phased launches indicate durable booking visibility.',
    sourceLabel: 'Baseline real-estate stock ranking (order-book proxy)',
    sourceUrl: '/projects',
    mode: 'auto',
  },
  {
    id: 'baseline-brigade',
    companyName: 'Brigade Enterprises',
    orderBookCr: 20800,
    projectCount: 24,
    thesis: 'Steady mixed-use pipeline and recurring launch cadence support healthy order-book depth.',
    sourceLabel: 'Baseline real-estate stock ranking (order-book proxy)',
    sourceUrl: '/projects',
    mode: 'auto',
  },
  {
    id: 'baseline-sobha',
    companyName: 'Sobha Limited',
    orderBookCr: 19600,
    projectCount: 22,
    thesis: 'Execution-led model with large under-construction base and stable launch additions.',
    sourceLabel: 'Baseline real-estate stock ranking (order-book proxy)',
    sourceUrl: '/projects',
    mode: 'auto',
  },
  {
    id: 'baseline-phoenix',
    companyName: 'The Phoenix Mills',
    orderBookCr: 18400,
    projectCount: 19,
    thesis: 'Commercial-led portfolio and structured expansion phases provide sustained booking signals.',
    sourceLabel: 'Baseline real-estate stock ranking (order-book proxy)',
    sourceUrl: '/projects',
    mode: 'auto',
  },
  {
    id: 'baseline-puravankara',
    companyName: 'Puravankara Limited',
    orderBookCr: 16900,
    projectCount: 18,
    thesis: 'Regional depth and recurring launches keep project-side order-book visibility active.',
    sourceLabel: 'Baseline real-estate stock ranking (order-book proxy)',
    sourceUrl: '/projects',
    mode: 'auto',
  },
  {
    id: 'baseline-kolte',
    companyName: 'Kolte-Patil Developers',
    orderBookCr: 15300,
    projectCount: 17,
    thesis: 'Concentrated city strategy with inventory turnover supports consistent booking momentum.',
    sourceLabel: 'Baseline real-estate stock ranking (order-book proxy)',
    sourceUrl: '/projects',
    mode: 'auto',
  },
];

interface BuilderRequestFormState {
  companyName: string;
  projectName: string;
  amountRequiredCr: string;
  orderBookValueCr: string;
  legalEntityName: string;
  reraNumber: string;
  cinOrGstin: string;
  legalDocumentUrl: string;
  sourceUrl: string;
  useOfFunds: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  declarationCompliance: boolean;
  declarationNoGuarantee: boolean;
}

interface InvestmentPropertySuggestion {
  id: string;
  referenceId: string;
  title: string;
  location: string;
  city: string;
  priceLabel: string;
  status: string;
  chatSupported: boolean;
}

const emptyBuilderForm: BuilderRequestFormState = {
  companyName: '',
  projectName: '',
  amountRequiredCr: '',
  orderBookValueCr: '',
  legalEntityName: '',
  reraNumber: '',
  cinOrGstin: '',
  legalDocumentUrl: '',
  sourceUrl: '',
  useOfFunds: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  declarationCompliance: false,
  declarationNoGuarantee: false,
};

function toSafeNumber(value: unknown): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function parseCroreValue(text: string): number {
  const cleaned = String(text || '').replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const next = Number(cleaned);
  return Number.isFinite(next) ? next : 0;
}

function formatCrore(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'NA';
  if (value >= 1000) return `${Math.round(value).toLocaleString('en-IN')} Cr`;
  return `${value.toFixed(1)} Cr`;
}

function formatInvestmentPrice(value: number | null | undefined): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Price on request';
  if (amount >= 10_000_000) return `Rs ${(amount / 10_000_000).toFixed(2)} Cr`;
  if (amount >= 100_000) return `Rs ${(amount / 100_000).toFixed(1)} L`;
  return `Rs ${Math.round(amount).toLocaleString('en-IN')}`;
}

function formatProjectPrice(project: Project): string {
  const min = toSafeNumber(project.priceMin);
  const max = toSafeNumber(project.priceMax);
  const perSqft = toSafeNumber(project.pricePerSqft);

  if (min > 0 && max > 0) {
    return `Rs ${Math.round(min).toLocaleString('en-IN')} - Rs ${Math.round(max).toLocaleString('en-IN')}`;
  }
  if (min > 0) {
    return `From Rs ${Math.round(min).toLocaleString('en-IN')}`;
  }
  if (max > 0) {
    return `Up to Rs ${Math.round(max).toLocaleString('en-IN')}`;
  }
  if (perSqft > 0) {
    return `Rs ${Math.round(perSqft).toLocaleString('en-IN')} / sq.ft`;
  }
  return 'Price on request';
}

function projectOrderBookCr(project: Project): number {
  const units = toSafeNumber(project.totalUnits);
  const min = toSafeNumber(project.priceMin);
  const max = toSafeNumber(project.priceMax);
  const perSqft = toSafeNumber(project.pricePerSqft);
  const area = toSafeNumber(project.totalArea);

  const avgPrice =
    min > 0 && max > 0
      ? (min + max) / 2
      : min > 0
        ? min
        : max > 0
          ? max
          : perSqft > 0
            ? perSqft * Math.max(900, Math.min(1800, area > 0 ? area / Math.max(units || 1, 1) : 1200))
            : 0;

  if (avgPrice <= 0) return 0;
  const effectiveUnits = units > 0 ? units : 35;
  return (effectiveUnits * avgPrice) / 10_000_000;
}

function buildAutoCompanySignals(projects: Project[]): CompanyStockSignal[] {
  const companyMap = new Map<
    string,
    {
      id: string;
      companyName: string;
      projectCount: number;
      upcoming: number;
      underConstruction: number;
      verifiedCount: number;
      orderBookCr: number;
    }
  >();

  projects.forEach((project) => {
    const companyId = Number(project.company?.id || project.companyId || 0);
    const companyName =
      String(project.company?.name || '').trim() ||
      `Company ${companyId > 0 ? companyId : 'Unknown'}`;
    const key = companyId > 0 ? `company-${companyId}` : `name-${companyName.toLowerCase()}`;
    const current = companyMap.get(key) || {
      id: key,
      companyName,
      projectCount: 0,
      upcoming: 0,
      underConstruction: 0,
      verifiedCount: 0,
      orderBookCr: 0,
    };

    current.projectCount += 1;
    if (project.status === 'Upcoming') current.upcoming += 1;
    if (project.status === 'Under Construction') current.underConstruction += 1;
    if (project.company?.isVerified) current.verifiedCount += 1;
    current.orderBookCr += projectOrderBookCr(project);

    companyMap.set(key, current);
  });

  return Array.from(companyMap.values())
    .map((company) => {
      const thesisParts = [
        `${company.projectCount} active project${company.projectCount > 1 ? 's' : ''}`,
        company.upcoming > 0 ? `${company.upcoming} upcoming` : '',
        company.underConstruction > 0 ? `${company.underConstruction} under construction` : '',
      ].filter(Boolean);
      const verifiedText =
        company.verifiedCount > 0
          ? 'with verified developer profile signal.'
          : 'with expansion signal from active launch cycle.';

      return {
        id: company.id,
        companyName: company.companyName,
        orderBookCr: Number(company.orderBookCr.toFixed(2)),
        projectCount: company.projectCount,
        thesis: `${thesisParts.join(' | ')} ${verifiedText}`,
        sourceLabel: 'Auto: ZDT project pipeline and launch activity',
        sourceUrl: '/projects',
        mode: 'auto' as const,
      };
    })
    .sort((left, right) => {
      if (right.orderBookCr !== left.orderBookCr) {
        return right.orderBookCr - left.orderBookCr;
      }
      if (right.projectCount !== left.projectCount) {
        return right.projectCount - left.projectCount;
      }
      return left.companyName.localeCompare(right.companyName);
    });
}

function mapManualSignals(signals: ManualCompanySignal[]): CompanyStockSignal[] {
  return signals.map((item) => ({
    id: item.id,
    companyName: item.companyName,
    orderBookCr: parseCroreValue(item.orderBookCr),
    projectCount: 0,
    thesis: item.thesis,
    sourceLabel: item.sourceLabel,
    sourceUrl: item.sourceUrl,
    mode: 'manual',
  }));
}

function rankSignals(signals: CompanyStockSignal[]): CompanyStockSignal[] {
  return [...signals].sort((left, right) => {
    if (right.orderBookCr !== left.orderBookCr) {
      return right.orderBookCr - left.orderBookCr;
    }
    if (right.projectCount !== left.projectCount) {
      return right.projectCount - left.projectCount;
    }
    return left.companyName.localeCompare(right.companyName);
  });
}

function mergeWithBaselineTop10(autoSignals: CompanyStockSignal[]): CompanyStockSignal[] {
  const rankedAuto = rankSignals(autoSignals);
  const existingKeys = new Set(
    rankedAuto.map((signal) => signal.companyName.trim().toLowerCase())
  );
  const fillSignals = TOP_REALTY_STOCK_BASELINE.filter(
    (signal) => !existingKeys.has(signal.companyName.trim().toLowerCase())
  );
  return rankSignals([...rankedAuto, ...fillSignals]).slice(0, 10);
}

function mapLiveSignals(signals: LiveRealtyStockSignal[]): CompanyStockSignal[] {
  return signals.map((signal) => ({
    id: signal.id,
    companyName: signal.companyName,
    orderBookCr: Number(signal.orderBookCr || 0),
    projectCount: Number(signal.projectCount || 0),
    thesis: signal.thesis,
    sourceLabel: signal.sourceLabel,
    sourceUrl: signal.sourceUrl,
    mode: 'auto' as const,
  }));
}

function buildPropertyInvestmentDraft(propertyTitle: string, referenceId: string): string {
  return [
    `Hi, I am interested in investing in ${propertyTitle} (${referenceId}).`,
    'Please share complete project details, legal documents, use of funds, expected benefits/returns, risk factors, and what I receive in exchange for investment.',
  ].join(' ');
}

function buildProjectInvestmentDraft(projectName: string): string {
  return [
    `Hi, I am interested in investment details for ${projectName}.`,
    'Please share legal structure, funding ask, project timeline, projected outcome, and what investor exchange terms are offered.',
  ].join(' ');
}

export default function InvestPage({
  onOpenProjects,
  onOpenProjectDetails,
  onOpenVoluntarySupport,
  onOpenMessages,
  onOpenCompanyMessages,
  isAuthenticated,
  userName,
  userRole,
  isMainAdmin,
}: InvestPageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [investmentProperties, setInvestmentProperties] = useState<InvestmentPropertySuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [signalMode, setSignalMode] = useState<InvestmentSignalMode>('hybrid');
  const [manualSignals, setManualSignals] = useState<ManualCompanySignal[]>([]);
  const [builderRequests, setBuilderRequests] = useState<BuilderInvestmentRequest[]>([]);
  const [builderRequestForm, setBuilderRequestForm] = useState<BuilderRequestFormState>(emptyBuilderForm);
  const [builderFormMessage, setBuilderFormMessage] = useState('');
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [manualCompanyName, setManualCompanyName] = useState('');
  const [manualOrderBookCr, setManualOrderBookCr] = useState('');
  const [manualThesis, setManualThesis] = useState('');
  const [manualOrderBookNote, setManualOrderBookNote] = useState('');
  const [manualSourceLabel, setManualSourceLabel] = useState('');
  const [manualSourceUrl, setManualSourceUrl] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [liveAutoSignals, setLiveAutoSignals] = useState<LiveRealtyStockSignal[]>([]);
  const [liveSignalsAsOf, setLiveSignalsAsOf] = useState('');
  const [liveSignalsStale, setLiveSignalsStale] = useState(false);
  const [liveSignalsStatusMessage, setLiveSignalsStatusMessage] = useState('');

  const canManageInvestSources = userRole === 'admin' && isMainAdmin;
  const isBuilder = userRole === 'builder';

  const loadLiveStockSignals = async (activeRef?: { current: boolean }) => {
    try {
      const response = await listLiveRealtyStockSignals(10);
      if (activeRef && !activeRef.current) return;
      setLiveAutoSignals(Array.isArray(response.signals) ? response.signals : []);
      setLiveSignalsAsOf(String(response.asOf || '').trim());
      setLiveSignalsStale(Boolean(response.stale));
      setLiveSignalsStatusMessage(
        response.stale
          ? String(response.staleReason || 'Live feed unavailable. Showing cached signals.')
          : ''
      );
    } catch (error) {
      if (activeRef && !activeRef.current) return;
      setLiveAutoSignals([]);
      setLiveSignalsAsOf('');
      setLiveSignalsStale(false);
      setLiveSignalsStatusMessage(
        error instanceof Error ? error.message : 'Live stock feed unavailable right now.'
      );
    }
  };

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError('');

    Promise.allSettled([
      listProjects({ status: 'all', limit: 150 }),
      apiRequest<{
        properties: Array<{
          id: number;
          title: string;
          city: string;
          area: string;
          locality: string;
          price: number | null;
          possessionStatus: string;
        }>;
      }>('/realty/properties?listingType=sale&sort=recommended&limit=6'),
      listLiveRealtyStockSignals(10),
    ])
      .then(([projectResult, propertyResult, liveSignalsResult]) => {
        if (!active) return;

        if (projectResult.status === 'fulfilled') {
          setProjects(projectResult.value);
        } else {
          setProjects([]);
        }

        if (propertyResult.status === 'fulfilled') {
          const livePropertySuggestions = (propertyResult.value.properties || [])
            .slice(0, 6)
            .map((property) => ({
              id: `live-${property.id}`,
              referenceId: String(property.id),
              title: property.title || 'Property',
              location: property.locality || property.area || property.city || 'Location',
              city: property.city || '',
              priceLabel: formatInvestmentPrice(property.price),
              status: property.possessionStatus
                ? String(property.possessionStatus).replace(/_/g, ' ')
                : 'Live Listing',
              chatSupported: true,
            }));
          setInvestmentProperties(livePropertySuggestions);
        } else {
          setInvestmentProperties([]);
        }

        if (liveSignalsResult.status === 'fulfilled') {
          setLiveAutoSignals(
            Array.isArray(liveSignalsResult.value.signals) ? liveSignalsResult.value.signals : []
          );
          setLiveSignalsAsOf(String(liveSignalsResult.value.asOf || '').trim());
          setLiveSignalsStale(Boolean(liveSignalsResult.value.stale));
          setLiveSignalsStatusMessage(
            liveSignalsResult.value.stale
              ? String(
                  liveSignalsResult.value.staleReason ||
                    'Live feed unavailable. Showing cached signals.'
                )
              : ''
          );
        } else {
          setLiveAutoSignals([]);
          setLiveSignalsAsOf('');
          setLiveSignalsStale(false);
          setLiveSignalsStatusMessage(
            liveSignalsResult.reason instanceof Error
              ? liveSignalsResult.reason.message
              : 'Live stock feed unavailable right now.'
          );
        }

        if (
          projectResult.status === 'rejected' &&
          propertyResult.status === 'rejected' &&
          liveSignalsResult.status === 'rejected'
        ) {
          const reason = projectResult.reason || propertyResult.reason || liveSignalsResult.reason;
          setLoadError(reason instanceof Error ? reason.message : 'Unable to load investment suggestions.');
        } else {
          setLoadError('');
        }
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const activeRef = { current: true };

    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void loadLiveStockSignals(activeRef);
    }, LIVE_STOCK_REFRESH_INTERVAL_MS);

    return () => {
      activeRef.current = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setSignalMode(getInvestmentSignalMode());
    setManualSignals(listManualCompanySignals());
    setBuilderRequests(listBuilderInvestmentRequests());
  }, []);

  const liveCompanySignals = useMemo(() => mapLiveSignals(liveAutoSignals), [liveAutoSignals]);
  const autoModelSignals = useMemo(() => buildAutoCompanySignals(projects), [projects]);
  const autoCompanySignals = useMemo(() => {
    if (liveCompanySignals.length === 0) {
      return mergeWithBaselineTop10(autoModelSignals);
    }
    const projectCountMap = new Map(
      autoModelSignals.map((signal) => [signal.companyName.trim().toLowerCase(), signal.projectCount])
    );
    const withProjectCounts = liveCompanySignals.map((signal) => {
      const key = signal.companyName.trim().toLowerCase();
      const projectCount = projectCountMap.get(key);
      if (!projectCount || projectCount <= 0) return signal;
      return {
        ...signal,
        projectCount,
      };
    });
    return rankSignals(withProjectCounts).slice(0, 10);
  }, [autoModelSignals, liveCompanySignals]);
  const manualCompanySignals = useMemo(
    () => rankSignals(mapManualSignals(manualSignals)),
    [manualSignals]
  );

  const displayedCompanySignals = useMemo(() => {
    if (signalMode === 'auto-only') {
      return autoCompanySignals.slice(0, 10);
    }
    if (signalMode === 'manual-only') {
      return manualCompanySignals.slice(0, 10);
    }
    return rankSignals([...manualCompanySignals, ...autoCompanySignals]).slice(0, 10);
  }, [autoCompanySignals, manualCompanySignals, signalMode]);

  const propertySuggestions = useMemo<InvestmentPropertySuggestion[]>(() => {
    if (investmentProperties.length > 0) {
      return investmentProperties.slice(0, 4);
    }
    return getPropertiesForCategory('projects').slice(0, 4).map((property) => ({
      id: property.id,
      referenceId: property.referenceId,
      title: property.title,
      location: property.location,
      city: property.city,
      priceLabel: property.priceLabel,
      status: property.status,
      chatSupported: false,
    }));
  }, [investmentProperties]);
  const upcomingProjects = useMemo(
    () => projects.filter((project) => project.status !== 'Ready to Move').slice(0, 6),
    [projects]
  );

  const approvedBuilderRequests = useMemo(
    () => builderRequests.filter((item) => item.status === 'approved').slice(0, 8),
    [builderRequests]
  );
  const pendingBuilderRequests = useMemo(
    () => builderRequests.filter((item) => item.status === 'pending'),
    [builderRequests]
  );

  const handleSignalModeChange = (mode: InvestmentSignalMode) => {
    if (!canManageInvestSources) {
      setManualMessage('Only Main Admin can change signal mode.');
      return;
    }
    setSignalMode(mode);
    setInvestmentSignalMode(mode);
    setManualMessage(`Signal mode updated: ${mode}`);
  };

  const handleCreateManualSignal = () => {
    setManualMessage('');

    if (!canManageInvestSources) {
      setManualMessage('Only Main Admin can add manual stock/company signals.');
      return;
    }

    const companyName = manualCompanyName.trim();
    const orderBookCr = manualOrderBookCr.trim();
    const thesis = manualThesis.trim();
    const orderBookNote = manualOrderBookNote.trim();
    const sourceLabel = manualSourceLabel.trim();
    const sourceUrl = manualSourceUrl.trim();

    if (!companyName || !thesis || !sourceLabel || !sourceUrl || !orderBookCr) {
      setManualMessage('Company, order-book, thesis, source label, and source URL are required.');
      return;
    }

    createManualCompanySignal({
      companyName,
      orderBookCr,
      thesis,
      orderBookNote,
      sourceLabel,
      sourceUrl,
    });
    setManualSignals(listManualCompanySignals());
    setManualCompanyName('');
    setManualOrderBookCr('');
    setManualThesis('');
    setManualOrderBookNote('');
    setManualSourceLabel('');
    setManualSourceUrl('');
    setManualMessage('Manual company signal added.');
  };

  const handleRemoveManualSignal = (signalId: string) => {
    if (!canManageInvestSources) {
      setManualMessage('Only Main Admin can remove manual sources.');
      return;
    }
    removeManualCompanySignal(signalId);
    setManualSignals(listManualCompanySignals());
  };

  const updateBuilderForm = <K extends keyof BuilderRequestFormState>(
    key: K,
    value: BuilderRequestFormState[K]
  ) => {
    setBuilderRequestForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmitBuilderRequest = () => {
    setBuilderFormMessage('');

    if (!isAuthenticated || !isBuilder) {
      setBuilderFormMessage('Only logged-in builder/dealer accounts can submit legal investment requests.');
      return;
    }

    const fields = builderRequestForm;
    const requiredStrings = [
      fields.companyName,
      fields.projectName,
      fields.amountRequiredCr,
      fields.orderBookValueCr,
      fields.legalEntityName,
      fields.reraNumber,
      fields.cinOrGstin,
      fields.legalDocumentUrl,
      fields.sourceUrl,
      fields.useOfFunds,
      fields.contactName,
      fields.contactEmail,
      fields.contactPhone,
    ];
    if (requiredStrings.some((value) => !String(value || '').trim())) {
      setBuilderFormMessage('Please complete all required legal and contact fields.');
      return;
    }
    if (!fields.declarationCompliance || !fields.declarationNoGuarantee) {
      setBuilderFormMessage('Please accept both legal declarations before submitting.');
      return;
    }

    createBuilderInvestmentRequest({
      companyName: fields.companyName.trim(),
      projectName: fields.projectName.trim(),
      amountRequiredCr: fields.amountRequiredCr.trim(),
      orderBookValueCr: fields.orderBookValueCr.trim(),
      legalEntityName: fields.legalEntityName.trim(),
      reraNumber: fields.reraNumber.trim(),
      cinOrGstin: fields.cinOrGstin.trim(),
      legalDocumentUrl: fields.legalDocumentUrl.trim(),
      sourceUrl: fields.sourceUrl.trim(),
      useOfFunds: fields.useOfFunds.trim(),
      contactName: fields.contactName.trim(),
      contactEmail: fields.contactEmail.trim().toLowerCase(),
      contactPhone: fields.contactPhone.trim(),
      submittedByName: userName?.trim() || 'Builder Account',
      submittedByRole: userRole || 'builder',
    });

    setBuilderRequests(listBuilderInvestmentRequests());
    setBuilderRequestForm(emptyBuilderForm);
    setBuilderFormMessage(
      'Request submitted. It is pending admin review before appearing in investment opportunities.'
    );
  };

  const handleAdminReviewBuilderRequest = (
    requestId: string,
    status: 'approved' | 'rejected'
  ) => {
    if (!canManageInvestSources) {
      return;
    }
    const note = String(adminNotes[requestId] || '').trim();
    updateBuilderInvestmentRequestStatus(requestId, status, note);
    setBuilderRequests(listBuilderInvestmentRequests());
  };

  return (
    <section className="portal-mobile-page pb-16 pt-28 text-slate-900">
      <div className="page-container portal-mobile-stack space-y-5">
        <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Invest</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Investment Control Room</h1>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            Project-side stock signals now use top real-estate company order-book indicators, source
            links, and Main Admin override control. Property investment includes legal builder/dealer
            requests with approval flow.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <article className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                <LineChart className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Project-Side Stock Signals</h2>
                <p className="text-xs text-slate-500">
                  Top company view by order-book strength, sources, and admin mode control
                </p>
              </div>
            </div>

            {canManageInvestSources ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSignalModeChange('auto-only')}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    signalMode === 'auto-only'
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-slate-300 bg-white text-slate-600'
                  }`}
                >
                  Auto only
                </button>
                <button
                  type="button"
                  onClick={() => handleSignalModeChange('manual-only')}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    signalMode === 'manual-only'
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-slate-300 bg-white text-slate-600'
                  }`}
                >
                  Manual only
                </button>
                <button
                  type="button"
                  onClick={() => handleSignalModeChange('hybrid')}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    signalMode === 'hybrid'
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-slate-300 bg-white text-slate-600'
                  }`}
                >
                  Hybrid (Auto + Main Admin)
                </button>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-500">
                Signal mode is managed by Main Admin. Current mode: <span className="font-semibold">{signalMode}</span>.
              </p>
            )}

            {isLoading ? (
              <p className="portal-mobile-card mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Loading company order-book signals...
              </p>
            ) : null}

            {loadError ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {loadError}
              </p>
            ) : null}

            {!isLoading && !loadError ? (
              <div className="mt-4 space-y-3">
                {liveSignalsAsOf ? (
                  <p className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                    Live feed as of: {liveSignalsAsOf}
                    {liveSignalsStale ? ' (cached snapshot)' : ''}
                  </p>
                ) : null}
                {liveSignalsStatusMessage ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    {liveSignalsStatusMessage}
                  </p>
                ) : null}
                {displayedCompanySignals.map((signal) => (
                  <div key={signal.id} className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{signal.companyName}</p>
                      <span
                        className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                          signal.mode === 'manual'
                            ? 'border-purple-200 bg-purple-50 text-purple-700'
                            : 'border-blue-200 bg-blue-50 text-blue-700'
                        }`}
                      >
                        {signal.mode === 'manual' ? 'Main Admin Manual' : 'Auto Model'}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                        Order Book: {formatCrore(signal.orderBookCr)}
                      </span>
                      {signal.projectCount > 0 ? (
                        <span className="rounded-full border border-slate-300 bg-white px-2 py-1 text-slate-600">
                          Projects: {signal.projectCount}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-xs text-slate-600">{signal.thesis}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Source: {signal.sourceLabel}</p>
                    {signal.sourceUrl ? (
                      <a
                        href={signal.sourceUrl}
                        target={signal.sourceUrl.startsWith('http') ? '_blank' : '_self'}
                        rel={signal.sourceUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
                        className="mt-2 inline-flex items-center text-xs font-semibold text-blue-700 hover:text-blue-800"
                      >
                        Open source
                        <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                ))}

                {displayedCompanySignals.length === 0 ? (
                  <p className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    No company signals available in current mode.
                  </p>
                ) : null}
              </div>
            ) : null}

            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This section is directional intelligence, not a securities recommendation or guaranteed-return promise.
            </p>
          </article>

          <article className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <Building2 className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Property Investment</h2>
                <p className="text-xs text-slate-500">Curated assets + legal builder requests</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {propertySuggestions.map((property) => (
                <div key={property.id} className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{property.title}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {property.location}, {property.city}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                      {property.priceLabel}
                    </span>
                    <span className="text-slate-500">{property.status}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-lg border-slate-300 text-xs"
                      disabled={!property.chatSupported}
                      onClick={() =>
                        onOpenMessages(
                          property.referenceId,
                          buildPropertyInvestmentDraft(property.title, property.referenceId)
                        )
                      }
                    >
                      {property.chatSupported ? 'Message Owner' : 'Live Chat Unavailable'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-lg border-slate-300 text-xs"
                      onClick={onOpenProjects}
                    >
                      View More
                    </Button>
                  </div>
                  {!property.chatSupported ? (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Messaging works on live listings. Open projects for currently active chat-enabled listings.
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <Button
              type="button"
              onClick={onOpenProjects}
              className="mt-4 h-10 rounded-xl bg-blue-700 px-4 text-white hover:bg-blue-800"
            >
              Explore Property Investments
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Button>
          </article>
        </div>

        <section className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900">Top Upcoming Projects (Signal Base)</h3>
          <p className="mt-1 text-sm text-slate-600">
            Project snapshots that feed automated stock-side ranking.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcomingProjects.map((project) => (
              <div key={project.id} className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{project.projectName}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {project.area || project.city || 'Project location'} • {formatProjectPrice(project)}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Source: Builder project record and construction timeline on ZDT
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenProjectDetails(project.id)}
                    className="inline-flex items-center text-xs font-semibold text-blue-700 hover:text-blue-800"
                  >
                    Open project
                    <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                  </button>
                  {Number(project.company?.id || project.companyId || 0) > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenCompanyMessages(
                          project.company?.id || project.companyId,
                          buildProjectInvestmentDraft(project.projectName)
                        )
                      }
                      className="inline-flex items-center text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      Message Builder
                      <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span className="inline-flex items-center text-xs text-slate-500">
                      Builder chat unavailable
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {approvedBuilderRequests.length > 0 ? (
          <section className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900">Builder Investment Opportunities (Legal)</h3>
            <p className="mt-1 text-sm text-slate-600">
              Approved builder/dealer investment requests with legal details and source proof.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {approvedBuilderRequests.map((item) => (
                <article key={item.id} className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{item.companyName}</p>
                  <p className="mt-1 text-xs text-slate-600">Project: {item.projectName}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      Ask: {item.amountRequiredCr} Cr
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-700">
                      Order Book: {item.orderBookValueCr} Cr
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-600">
                    Legal entity: {item.legalEntityName} • RERA: {item.reraNumber}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-600">CIN/GSTIN: {item.cinOrGstin}</p>
                  <p className="mt-1 text-[11px] text-slate-600">Use of funds: {item.useOfFunds}</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <a
                      href={item.legalDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs font-semibold text-blue-700 hover:text-blue-800"
                    >
                      Legal docs
                      <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </a>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs font-semibold text-blue-700 hover:text-blue-800"
                    >
                      Source
                      <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {isAuthenticated && isBuilder ? (
          <section className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900">Builder/Dealer Legal Investment Request</h3>
            <p className="mt-1 text-sm text-slate-600">
              Submit request with legal details. It will be visible publicly only after admin approval.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Input
                value={builderRequestForm.companyName}
                onChange={(event) => updateBuilderForm('companyName', event.target.value)}
                placeholder="Company name *"
                className="h-10 bg-white"
              />
              <Input
                value={builderRequestForm.projectName}
                onChange={(event) => updateBuilderForm('projectName', event.target.value)}
                placeholder="Project name *"
                className="h-10 bg-white"
              />
              <Input
                value={builderRequestForm.amountRequiredCr}
                onChange={(event) => updateBuilderForm('amountRequiredCr', event.target.value)}
                placeholder="Investment required (Cr) *"
                className="h-10 bg-white"
              />
              <Input
                value={builderRequestForm.orderBookValueCr}
                onChange={(event) => updateBuilderForm('orderBookValueCr', event.target.value)}
                placeholder="Order-book value (Cr) *"
                className="h-10 bg-white"
              />
              <Input
                value={builderRequestForm.legalEntityName}
                onChange={(event) => updateBuilderForm('legalEntityName', event.target.value)}
                placeholder="Legal entity name *"
                className="h-10 bg-white"
              />
              <Input
                value={builderRequestForm.reraNumber}
                onChange={(event) => updateBuilderForm('reraNumber', event.target.value)}
                placeholder="RERA number *"
                className="h-10 bg-white"
              />
              <Input
                value={builderRequestForm.cinOrGstin}
                onChange={(event) => updateBuilderForm('cinOrGstin', event.target.value)}
                placeholder="CIN or GSTIN *"
                className="h-10 bg-white"
              />
              <Input
                value={builderRequestForm.legalDocumentUrl}
                onChange={(event) => updateBuilderForm('legalDocumentUrl', event.target.value)}
                placeholder="Legal document URL *"
                className="h-10 bg-white"
              />
              <Input
                value={builderRequestForm.sourceUrl}
                onChange={(event) => updateBuilderForm('sourceUrl', event.target.value)}
                placeholder="Source URL (order book/report) *"
                className="h-10 bg-white"
              />
              <Input
                value={builderRequestForm.contactName}
                onChange={(event) => updateBuilderForm('contactName', event.target.value)}
                placeholder="Contact name *"
                className="h-10 bg-white"
              />
              <Input
                value={builderRequestForm.contactEmail}
                onChange={(event) => updateBuilderForm('contactEmail', event.target.value)}
                placeholder="Contact email *"
                className="h-10 bg-white"
              />
              <Input
                value={builderRequestForm.contactPhone}
                onChange={(event) => updateBuilderForm('contactPhone', event.target.value)}
                placeholder="Contact phone *"
                className="h-10 bg-white"
              />
            </div>

            <textarea
              value={builderRequestForm.useOfFunds}
              onChange={(event) => updateBuilderForm('useOfFunds', event.target.value)}
              placeholder="Use of funds (land, approvals, construction milestone etc.) *"
              rows={3}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
            />

            <div className="mt-3 space-y-2">
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={builderRequestForm.declarationCompliance}
                  onChange={(event) => updateBuilderForm('declarationCompliance', event.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                I confirm this request follows applicable legal and regulatory requirements.
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={builderRequestForm.declarationNoGuarantee}
                  onChange={(event) => updateBuilderForm('declarationNoGuarantee', event.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                I understand this is discovery/onboarding only and does not imply guaranteed funding.
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={handleSubmitBuilderRequest} className="bg-blue-700 text-white hover:bg-blue-800">
                Submit Legal Investment Request
              </Button>
            </div>
            {builderFormMessage ? (
              <p className="mt-2 text-sm text-slate-700">{builderFormMessage}</p>
            ) : null}
          </section>
        ) : null}

        {canManageInvestSources ? (
          <section className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900">Main Admin Manual Company Signals</h3>
            <p className="mt-1 text-sm text-slate-600">
              Add top company entries manually with order-book thesis and source.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Input
                value={manualCompanyName}
                onChange={(event) => setManualCompanyName(event.target.value)}
                placeholder="Company name *"
                className="h-10 bg-white"
              />
              <Input
                value={manualOrderBookCr}
                onChange={(event) => setManualOrderBookCr(event.target.value)}
                placeholder="Order-book (Cr) *"
                className="h-10 bg-white"
              />
              <Input
                value={manualSourceLabel}
                onChange={(event) => setManualSourceLabel(event.target.value)}
                placeholder="Source label *"
                className="h-10 bg-white"
              />
              <Input
                value={manualSourceUrl}
                onChange={(event) => setManualSourceUrl(event.target.value)}
                placeholder="Source URL *"
                className="h-10 bg-white sm:col-span-2 xl:col-span-3"
              />
            </div>

            <textarea
              value={manualThesis}
              onChange={(event) => setManualThesis(event.target.value)}
              placeholder="Investment thesis *"
              rows={2}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
            />
            <textarea
              value={manualOrderBookNote}
              onChange={(event) => setManualOrderBookNote(event.target.value)}
              placeholder="Order-book note (optional)"
              rows={2}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={handleCreateManualSignal} className="bg-blue-700 text-white hover:bg-blue-800">
                <Plus className="mr-2 h-4 w-4" />
                Add Manual Signal
              </Button>
            </div>
            {manualMessage ? <p className="mt-2 text-sm text-slate-700">{manualMessage}</p> : null}

            {manualSignals.length > 0 ? (
              <div className="mt-4 space-y-2">
                {manualSignals.map((signal) => (
                  <article key={signal.id} className="portal-mobile-card flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold text-slate-900">
                        {signal.companyName} • {signal.orderBookCr} Cr
                      </p>
                      <p className="text-slate-600">{signal.thesis}</p>
                      <p className="text-xs text-slate-500">Source: {signal.sourceLabel}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleRemoveManualSignal(signal.id)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {canManageInvestSources && pendingBuilderRequests.length > 0 ? (
          <section className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900">Main Admin Review: Builder Legal Requests</h3>
            <p className="mt-1 text-sm text-slate-600">
              Approve to publish in public investment opportunities.
            </p>
            <div className="mt-4 space-y-3">
              {pendingBuilderRequests.map((item) => (
                <article key={item.id} className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{item.companyName}</p>
                  <p className="text-xs text-slate-600">
                    {item.projectName} • Ask {item.amountRequiredCr} Cr • Order Book {item.orderBookValueCr} Cr
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Legal: {item.legalEntityName} | RERA: {item.reraNumber} | CIN/GSTIN: {item.cinOrGstin}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <a href={item.legalDocumentUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700">
                      Legal docs
                    </a>
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700">
                      Source
                    </a>
                  </div>
                  <textarea
                    value={adminNotes[item.id] || ''}
                    onChange={(event) => setAdminNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                    placeholder="Admin note (optional)"
                    rows={2}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => handleAdminReviewBuilderRequest(item.id, 'approved')}>
                      Approve & Publish
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAdminReviewBuilderRequest(item.id, 'rejected')}
                    >
                      Reject
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                Voluntary Invest
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">
                Help ZDT Realty Grow As an Early Startup
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                We are building core infrastructure and need support to buy APIs, data services,
                mapping tools, and verification systems that improve the platform for everyone.
              </p>
              <div className="portal-mobile-card mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                Voluntary support is not equity and does not provide guaranteed returns.
              </div>
            </div>

            <span className="inline-flex h-11 items-center rounded-full border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700">
              <HandCoins className="mr-2 h-4 w-4" />
              Early Startup Support
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={onOpenVoluntarySupport}
              className="h-11 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
            >
              Open Voluntary Support
            </Button>
            <Button type="button" variant="outline" onClick={onOpenProjects} className="h-11 rounded-xl px-5">
              View All Projects
            </Button>
          </div>
        </section>
      </div>
    </section>
  );
}
