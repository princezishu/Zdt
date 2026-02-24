import { useEffect, useId, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { getGeoDistricts, getGeoPlaces, getGeoStates, getGeoSubdistricts } from '@/lib/geoApi';
import { apiRequest } from '@/lib/http';
import { cn } from '@/lib/utils';

type LgdSuggestKind = 'india' | 'state' | 'district' | 'subdistrict' | 'place';
type IndiaValueField = 'label' | 'village' | 'subdistrict' | 'district' | 'state';

interface IndiaSuggestionItem {
  id: string | number;
  villageCode: string;
  village: string;
  subdistrict: string;
  district: string;
  state: string;
  label: string;
}

interface IndiaSuggestionResponse {
  suggestions: IndiaSuggestionItem[];
  totalMatched: number;
}

interface SuggestionOption {
  key: string;
  value: string;
  label: string;
}

interface LgdLocationInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  suggestKind?: LgdSuggestKind;
  indiaValueField?: IndiaValueField;
  indiaState?: string;
  indiaDistrict?: string;
  indiaSubdistrict?: string;
  stateCode?: string;
  districtCode?: string;
  subdistrictCode?: string;
  minQueryLength?: number;
  limit?: number;
  debounceMs?: number;
}

const suggestionCache = new Map<string, SuggestionOption[]>();

function normalize(value: string) {
  return String(value || '').trim().toLowerCase();
}

async function fetchIndiaSuggestions(query: string, limit: number) {
  const encodedQuery = encodeURIComponent(query);
  const encodedLimit = encodeURIComponent(String(limit));
  const primaryPath = `/api/locations/india-suggest?q=${encodedQuery}&limit=${encodedLimit}`;
  const fallbackPath = `/locations/india-suggest?q=${encodedQuery}&limit=${encodedLimit}`;

  try {
    return await apiRequest<IndiaSuggestionResponse>(primaryPath);
  } catch (primaryError) {
    try {
      return await apiRequest<IndiaSuggestionResponse>(fallbackPath);
    } catch {
      throw primaryError;
    }
  }
}

export function LgdLocationInput({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
  suggestKind = 'india',
  indiaValueField = 'village',
  indiaState,
  indiaDistrict,
  indiaSubdistrict,
  stateCode = '',
  districtCode = '',
  subdistrictCode = '',
  minQueryLength,
  limit = 40,
  debounceMs = 250,
}: LgdLocationInputProps) {
  const listId = useId();
  const [options, setOptions] = useState<SuggestionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  const query = String(value || '').trim();
  const effectiveMinQueryLength = Math.max(0, minQueryLength ?? (suggestKind === 'state' ? 0 : 1));
  const canSearchByKind = useMemo(() => {
    if (suggestKind === 'india') {
      const requiresState = indiaValueField === 'district' && indiaState !== undefined;
      const requiresDistrict = indiaValueField === 'subdistrict' && indiaDistrict !== undefined;
      const requiresSubdistrict = indiaValueField === 'village' && indiaSubdistrict !== undefined;
      const requiresVillageDistrict =
        indiaValueField === 'village' &&
        indiaSubdistrict === undefined &&
        indiaDistrict !== undefined;
      if (requiresState) return !!String(indiaState || '').trim();
      if (requiresDistrict) return !!String(indiaDistrict || '').trim();
      if (requiresSubdistrict) return !!String(indiaSubdistrict || '').trim();
      if (requiresVillageDistrict) return !!String(indiaDistrict || '').trim();
      return true;
    }
    if (suggestKind === 'district') return !!stateCode.trim();
    if (suggestKind === 'subdistrict') return !!districtCode.trim();
    if (suggestKind === 'place') return !!subdistrictCode.trim();
    return true;
  }, [districtCode, indiaDistrict, indiaState, indiaValueField, stateCode, subdistrictCode, suggestKind]);
  const shouldShowSuggestions =
    !disabled && canSearchByKind && query.length >= effectiveMinQueryLength;
  const visibleOptions = shouldShowSuggestions ? options : [];

  useEffect(() => {
    if (!canSearchByKind || disabled || query.length < effectiveMinQueryLength) {
      setLoading(false);
      setErrorText('');
      if (!query.length) {
        setOptions([]);
      }
      return;
    }

    const cacheKey = [
      suggestKind,
      normalize(query),
      stateCode.trim(),
      districtCode.trim(),
      subdistrictCode.trim(),
      indiaValueField,
      String(limit),
    ].join('|');

    const cached = suggestionCache.get(cacheKey);
    if (cached) {
      let active = true;
      const timer = window.setTimeout(() => {
        if (!active) return;
        setLoading(false);
        setErrorText('');
        setOptions(cached);
      }, 0);
      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }

    let active = true;
    setLoading(true);
    setErrorText('');
    const timer = window.setTimeout(async () => {
      try {
        let nextOptions: SuggestionOption[] = [];

        if (suggestKind === 'state') {
          const response = await getGeoStates({ q: query, limit });
          const rows = Array.isArray(response.items) ? response.items : [];
          nextOptions = rows
            .map((item) => ({
              key: `state-${item.code}`,
              value: item.name.trim(),
              label: `${item.name.trim()} (${item.code.trim()})`,
            }))
            .filter((item) => item.value && item.label);
        } else if (suggestKind === 'district') {
          const response = await getGeoDistricts({
            stateCode: stateCode.trim(),
            q: query,
            limit,
          });
          const rows = Array.isArray(response.items) ? response.items : [];
          nextOptions = rows
            .map((item) => ({
              key: `district-${item.code}`,
              value: item.name.trim(),
              label: `${item.name.trim()}, ${item.stateName.trim()} (${item.code.trim()})`,
            }))
            .filter((item) => item.value && item.label);
        } else if (suggestKind === 'subdistrict') {
          const response = await getGeoSubdistricts({
            districtCode: districtCode.trim(),
            q: query,
            limit,
          });
          const rows = Array.isArray(response.items) ? response.items : [];
          nextOptions = rows
            .map((item) => ({
              key: `subdistrict-${item.code}`,
              value: item.name.trim(),
              label: `${item.name.trim()}, ${item.districtName.trim()}, ${item.stateName.trim()} (${item.code.trim()})`,
            }))
            .filter((item) => item.value && item.label);
        } else if (suggestKind === 'place') {
          const response = await getGeoPlaces({
            subdistrictCode: subdistrictCode.trim(),
            q: query,
            limit,
          });
          const rows = Array.isArray(response.items) ? response.items : [];
          nextOptions = rows
            .map((item) => ({
              key: `place-${item.code}`,
              value: item.name.trim(),
              label: `${item.name.trim()}, ${item.subdistrictName.trim()}, ${item.districtName.trim()}, ${item.stateName.trim()} (${item.code.trim()})`,
            }))
            .filter((item) => item.value && item.label);
        } else {
          const response = await fetchIndiaSuggestions(query, limit);
          const rows = Array.isArray(response.suggestions) ? response.suggestions : [];
          const normalizedStateFilter = normalize(indiaState || '');
          const normalizedDistrictFilter = normalize(indiaDistrict || '');
          const normalizedSubdistrictFilter = normalize(indiaSubdistrict || '');
          const filteredRows = rows.filter((item) => {
            const itemState = normalize(item.state || '');
            const itemDistrict = normalize(item.district || '');
            const itemSubdistrict = normalize(item.subdistrict || '');
            if (normalizedStateFilter && itemState !== normalizedStateFilter) return false;
            if (normalizedDistrictFilter && itemDistrict !== normalizedDistrictFilter) return false;
            if (normalizedSubdistrictFilter && itemSubdistrict !== normalizedSubdistrictFilter) return false;
            return true;
          });
          nextOptions = filteredRows
            .map((item) => {
              const label =
                item.label?.trim() ||
                [item.village, item.subdistrict, item.district, item.state]
                  .map((part) => String(part || '').trim())
                  .filter(Boolean)
                  .join(', ');

              const valueMap: Record<IndiaValueField, string> = {
                label,
                village: String(item.village || '').trim(),
                subdistrict: String(item.subdistrict || '').trim(),
                district: String(item.district || '').trim(),
                state: String(item.state || '').trim(),
              };

              const resolvedValue = valueMap[indiaValueField].trim() || label;
              const villageCode = String(item.villageCode || '').trim();
              const withCode = villageCode ? `${label} [LGD ${villageCode}]` : label;

              let resolvedLabel = withCode;
              if (indiaValueField === 'state') {
                resolvedLabel = valueMap.state.trim() || resolvedValue;
              } else if (indiaValueField === 'district') {
                resolvedLabel =
                  [valueMap.district.trim(), valueMap.state.trim()].filter(Boolean).join(', ') ||
                  resolvedValue;
              } else if (indiaValueField === 'subdistrict') {
                resolvedLabel =
                  [
                    valueMap.subdistrict.trim(),
                    valueMap.district.trim(),
                    valueMap.state.trim(),
                  ]
                    .filter(Boolean)
                    .join(', ') || resolvedValue;
              } else if (indiaValueField === 'village') {
                const villageLabel = [
                  valueMap.village.trim(),
                  valueMap.subdistrict.trim(),
                  valueMap.district.trim(),
                  valueMap.state.trim(),
                ]
                  .filter(Boolean)
                  .join(', ');
                resolvedLabel = villageCode
                  ? `${villageLabel || resolvedValue} [LGD ${villageCode}]`
                  : villageLabel || resolvedValue;
              }

              return {
                key: `india-${String(item.id)}`,
                value: resolvedValue,
                label: resolvedLabel,
              };
            })
            .filter((item) => item.value && item.label);
        }

        const deduped: SuggestionOption[] = [];
        const seen = new Set<string>();
        nextOptions.forEach((item) => {
          const dedupeKey =
            indiaValueField === 'state' ||
            indiaValueField === 'district' ||
            indiaValueField === 'subdistrict'
              ? normalize(item.value)
              : `${normalize(item.value)}|${normalize(item.label)}`;
          if (!dedupeKey || seen.has(dedupeKey)) return;
          seen.add(dedupeKey);
          deduped.push(item);
        });

        if (!active) return;
        setLoading(false);
        setErrorText('');
        suggestionCache.set(cacheKey, deduped);
        setOptions(deduped);
      } catch (error) {
        if (!active) return;
        setLoading(false);
        setOptions([]);
        const message =
          error instanceof Error ? String(error.message || '').toLowerCase() : '';
        if (message.includes('dataset') || message.includes('prepare:india-villages')) {
          setErrorText('Location dataset not ready on server. Run prepare:india-villages.');
          return;
        }
        if (message.includes('failed to fetch') || message.includes('network')) {
          setErrorText('Unable to reach API server for location suggestions.');
          return;
        }
        setErrorText('Unable to load location suggestions right now.');
      }
    }, Math.max(0, debounceMs));

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    canSearchByKind,
    debounceMs,
    disabled,
    districtCode,
    effectiveMinQueryLength,
    indiaDistrict,
    indiaState,
    indiaSubdistrict,
    indiaValueField,
    limit,
    query,
    stateCode,
    subdistrictCode,
    suggestKind,
  ]);

  const dependencyHint = useMemo(() => {
    if (suggestKind === 'india') {
      if (indiaValueField === 'district' && indiaState !== undefined && !String(indiaState || '').trim()) {
        return 'Select a state first to get district suggestions.';
      }
      if (indiaValueField === 'subdistrict' && indiaDistrict !== undefined && !String(indiaDistrict || '').trim()) {
        return 'Select a district first to get subdistrict suggestions.';
      }
      if (indiaValueField === 'village' && indiaSubdistrict !== undefined && !String(indiaSubdistrict || '').trim()) {
        return 'Select a city/subdistrict first to get locality suggestions.';
      }
      if (
        indiaValueField === 'village' &&
        indiaSubdistrict === undefined &&
        indiaDistrict !== undefined &&
        !String(indiaDistrict || '').trim()
      ) {
        return 'Select a district first to get location suggestions.';
      }
    }
    if (suggestKind === 'district' && !stateCode.trim()) return 'Select a state first to get district suggestions.';
    if (suggestKind === 'subdistrict' && !districtCode.trim()) return 'Select a district first to get subdistrict suggestions.';
    if (suggestKind === 'place' && !subdistrictCode.trim()) return 'Select a subdistrict first to get place suggestions.';
    return '';
  }, [districtCode, indiaDistrict, indiaState, indiaValueField, stateCode, subdistrictCode, suggestKind]);

  const showTypeHint =
    !disabled &&
    canSearchByKind &&
    query.length < effectiveMinQueryLength &&
    effectiveMinQueryLength > 0;
  const showNoMatches =
    !disabled &&
    canSearchByKind &&
    !loading &&
    !errorText &&
    query.length >= effectiveMinQueryLength &&
    visibleOptions.length === 0;

  return (
    <div className="space-y-1">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={visibleOptions.length > 0 ? listId : undefined}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
      />
      {visibleOptions.length > 0 ? (
        <datalist id={listId}>
          {visibleOptions.map((option) => (
            <option key={option.key} value={option.value} label={option.label} />
          ))}
        </datalist>
      ) : null}
      {!disabled && dependencyHint ? (
        <p className="text-xs text-slate-500">{dependencyHint}</p>
      ) : null}
      {loading ? (
        <p className="text-xs text-slate-500">Loading location suggestions...</p>
      ) : null}
      {!loading && errorText ? (
        <p className="text-xs text-red-600">{errorText}</p>
      ) : null}
      {showTypeHint ? (
        <p className="text-xs text-slate-500">
          Type at least {effectiveMinQueryLength} character{effectiveMinQueryLength === 1 ? '' : 's'} to see suggestions.
        </p>
      ) : null}
      {showNoMatches ? (
        <p className="text-xs text-slate-500">No matching location suggestions found.</p>
      ) : null}
    </div>
  );
}

interface LgdLocationAccuracyNoteProps {
  className?: string;
}

export function LgdLocationAccuracyNote({ className }: LgdLocationAccuracyNoteProps) {
  return (
    <p className={cn('text-xs text-slate-500', className)}>
      We use official LGD / government directories for location accuracy.
    </p>
  );
}
