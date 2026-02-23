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

export function LgdLocationInput({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
  suggestKind = 'india',
  indiaValueField = 'village',
  stateCode = '',
  districtCode = '',
  subdistrictCode = '',
  minQueryLength = 1,
  limit = 40,
  debounceMs = 250,
}: LgdLocationInputProps) {
  const listId = useId();
  const [options, setOptions] = useState<SuggestionOption[]>([]);

  const query = String(value || '').trim();
  const canSearchByKind = useMemo(() => {
    if (suggestKind === 'district') return !!stateCode.trim();
    if (suggestKind === 'subdistrict') return !!districtCode.trim();
    if (suggestKind === 'place') return !!subdistrictCode.trim();
    return true;
  }, [districtCode, stateCode, subdistrictCode, suggestKind]);
  const shouldShowSuggestions =
    !disabled && canSearchByKind && query.length >= Math.max(0, minQueryLength);
  const visibleOptions = shouldShowSuggestions ? options : [];

  useEffect(() => {
    if (!canSearchByKind || disabled || query.length < minQueryLength) {
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
        setOptions(cached);
      }, 0);
      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }

    let active = true;
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
          const response = await apiRequest<IndiaSuggestionResponse>(
            `/locations/india-suggest?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`
          );
          const rows = Array.isArray(response.suggestions) ? response.suggestions : [];
          nextOptions = rows
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

              return {
                key: `india-${String(item.id)}`,
                value: resolvedValue,
                label: withCode,
              };
            })
            .filter((item) => item.value && item.label);
        }

        const deduped: SuggestionOption[] = [];
        const seen = new Set<string>();
        nextOptions.forEach((item) => {
          const dedupeKey = `${normalize(item.value)}|${normalize(item.label)}`;
          if (!dedupeKey || seen.has(dedupeKey)) return;
          seen.add(dedupeKey);
          deduped.push(item);
        });

        if (!active) return;
        suggestionCache.set(cacheKey, deduped);
        setOptions(deduped);
      } catch {
        if (!active) return;
        setOptions([]);
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
    indiaValueField,
    limit,
    minQueryLength,
    query,
    stateCode,
    subdistrictCode,
    suggestKind,
  ]);

  return (
    <>
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
    </>
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
