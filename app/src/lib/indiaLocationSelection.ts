export const INDIA_LOCATION_SELECTION_KEY = 'zdt_india_location_selection';

export interface IndiaLocationSelection {
  state: string;
  stateCode: string;
  district: string;
  districtCode: string;
  subdistrict: string;
  subdistrictCode: string;
  place: string;
  placeCode: string;
  placeType: string;
  confirmedAt: string;
}

export function readIndiaLocationSelection(): IndiaLocationSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(INDIA_LOCATION_SELECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IndiaLocationSelection>;

    const required = [
      parsed.state,
      parsed.stateCode,
      parsed.district,
      parsed.districtCode,
      parsed.subdistrict,
      parsed.subdistrictCode,
      parsed.place,
      parsed.placeCode,
    ];
    if (required.some((entry) => !String(entry || '').trim())) {
      return null;
    }

    return {
      state: String(parsed.state || '').trim(),
      stateCode: String(parsed.stateCode || '').trim(),
      district: String(parsed.district || '').trim(),
      districtCode: String(parsed.districtCode || '').trim(),
      subdistrict: String(parsed.subdistrict || '').trim(),
      subdistrictCode: String(parsed.subdistrictCode || '').trim(),
      place: String(parsed.place || '').trim(),
      placeCode: String(parsed.placeCode || '').trim(),
      placeType: String(parsed.placeType || 'VILLAGE').trim(),
      confirmedAt: String(parsed.confirmedAt || ''),
    };
  } catch {
    return null;
  }
}

export function writeIndiaLocationSelection(selection: IndiaLocationSelection) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(INDIA_LOCATION_SELECTION_KEY, JSON.stringify(selection));
}
