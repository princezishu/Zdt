import type { UserRole } from './session';

export type InvestmentSignalMode = 'auto-only' | 'manual-only' | 'hybrid';

export interface ManualCompanySignal {
  id: string;
  companyName: string;
  orderBookCr: string;
  thesis: string;
  orderBookNote: string;
  sourceLabel: string;
  sourceUrl: string;
  createdAt: string;
}

export interface BuilderInvestmentRequest {
  id: string;
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
  submittedByName: string;
  submittedByRole: UserRole;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  adminNote: string;
  reviewedAt: string;
}

const INVESTMENT_SIGNAL_MODE_KEY = 'zdt-investment-signal-mode';
const MANUAL_SIGNALS_KEY = 'zdt-manual-company-signals';
const BUILDER_REQUESTS_KEY = 'zdt-builder-investment-requests';

function hasBrowserStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function parseJsonList<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function getInvestmentSignalMode(): InvestmentSignalMode {
  if (!hasBrowserStorage()) return 'hybrid';
  const value = String(window.localStorage.getItem(INVESTMENT_SIGNAL_MODE_KEY) || '').trim();
  if (value === 'auto-only' || value === 'manual-only' || value === 'hybrid') {
    return value;
  }
  return 'hybrid';
}

export function setInvestmentSignalMode(mode: InvestmentSignalMode): void {
  if (!hasBrowserStorage()) return;
  window.localStorage.setItem(INVESTMENT_SIGNAL_MODE_KEY, mode);
}

export function listManualCompanySignals(): ManualCompanySignal[] {
  if (!hasBrowserStorage()) return [];
  return parseJsonList<ManualCompanySignal>(window.localStorage.getItem(MANUAL_SIGNALS_KEY));
}

export function createManualCompanySignal(
  payload: Omit<ManualCompanySignal, 'id' | 'createdAt'>
): ManualCompanySignal {
  const item: ManualCompanySignal = {
    ...payload,
    id: `manual-signal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const rows = [item, ...listManualCompanySignals()].slice(0, 200);
  if (hasBrowserStorage()) {
    window.localStorage.setItem(MANUAL_SIGNALS_KEY, JSON.stringify(rows));
  }
  return item;
}

export function removeManualCompanySignal(signalId: string): void {
  if (!hasBrowserStorage()) return;
  const next = listManualCompanySignals().filter((item) => item.id !== signalId);
  window.localStorage.setItem(MANUAL_SIGNALS_KEY, JSON.stringify(next));
}

export function listBuilderInvestmentRequests(): BuilderInvestmentRequest[] {
  if (!hasBrowserStorage()) return [];
  return parseJsonList<BuilderInvestmentRequest>(window.localStorage.getItem(BUILDER_REQUESTS_KEY));
}

export function createBuilderInvestmentRequest(
  payload: Omit<BuilderInvestmentRequest, 'id' | 'submittedAt' | 'status' | 'adminNote' | 'reviewedAt'>
): BuilderInvestmentRequest {
  const item: BuilderInvestmentRequest = {
    ...payload,
    id: `builder-invest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    submittedAt: new Date().toISOString(),
    status: 'pending',
    adminNote: '',
    reviewedAt: '',
  };
  const rows = [item, ...listBuilderInvestmentRequests()].slice(0, 500);
  if (hasBrowserStorage()) {
    window.localStorage.setItem(BUILDER_REQUESTS_KEY, JSON.stringify(rows));
  }
  return item;
}

export function updateBuilderInvestmentRequestStatus(
  requestId: string,
  status: 'approved' | 'rejected',
  adminNote: string
): void {
  if (!hasBrowserStorage()) return;
  const nowIso = new Date().toISOString();
  const next = listBuilderInvestmentRequests().map((item) =>
    item.id === requestId
      ? {
          ...item,
          status,
          adminNote: adminNote.trim(),
          reviewedAt: nowIso,
        }
      : item
  );
  window.localStorage.setItem(BUILDER_REQUESTS_KEY, JSON.stringify(next));
}
