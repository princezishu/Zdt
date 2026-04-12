import { apiRequest } from './http';

export interface LiveRealtyStockSignal {
  id: string;
  companyName: string;
  symbol: string;
  orderBookCr: number;
  projectCount: number;
  thesis: string;
  sourceLabel: string;
  sourceUrl: string;
  mode: 'auto';
  marketPrice: number;
  percentChange: number;
  tradedValueCr: number;
  tradedVolume: number;
}

export interface LiveRealtyStockSignalsResponse {
  asOf: string;
  source: string;
  stale: boolean;
  staleReason?: string;
  signals: LiveRealtyStockSignal[];
}

export async function listLiveRealtyStockSignals(limit = 10) {
  const safeLimit = Math.max(1, Math.min(10, Math.floor(Number(limit) || 10)));
  return apiRequest<LiveRealtyStockSignalsResponse>(`/api/invest/realty-stock-signals?limit=${safeLimit}`);
}

