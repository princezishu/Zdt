import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getGeoDistricts,
  getGeoPlaces,
  getGeoStates,
  getGeoSubdistricts,
  type GeoDistrictItem,
  type GeoPlaceItem,
  type GeoStateItem,
  type GeoSubdistrictItem,
} from '@/lib/geoApi';
import type { IndiaLocationSelection } from '@/lib/indiaLocationSelection';

interface AllIndiaLocationSelectorProps {
  initialSelection?: IndiaLocationSelection | null;
  onConfirm?: (selection: IndiaLocationSelection) => void;
}

const FETCH_LIMIT = 50;

interface GeoPlacePageCache {
  items: GeoPlaceItem[];
  totalMatched: number;
  hasMore: boolean;
}

interface GeoCache {
  states: Map<string, GeoStateItem[]>;
  districts: Map<string, GeoDistrictItem[]>;
  subdistricts: Map<string, GeoSubdistrictItem[]>;
  places: Map<string, GeoPlacePageCache>;
}

function normalizeCacheKey(value: string) {
  return String(value || '').trim().toLowerCase();
}

function dedupeByCode<T extends SearchableLocationItem>(items: T[]) {
  const map = new Map<string, T>();
  items.forEach((item) => {
    const code = String(item?.code || '').trim();
    if (!code) return;
    if (!map.has(code)) {
      map.set(code, item);
    }
  });
  return Array.from(map.values());
}

function mergeUniquePlaces(previous: GeoPlaceItem[], next: GeoPlaceItem[]) {
  const map = new Map<string, GeoPlaceItem>();
  previous.forEach((item) => {
    map.set(item.code, item);
  });
  next.forEach((item) => {
    map.set(item.code, item);
  });
  return Array.from(map.values());
}

interface SearchableLocationItem {
  code: string;
  name: string;
}

function defaultOptionLabel(item: SearchableLocationItem) {
  return `${item.name} (${item.code})`;
}

function placeTypeLabel(type: string) {
  return String(type || '').trim().toUpperCase() === 'CITY_OR_LOCAL_BODY'
    ? 'CITY/LOCAL BODY'
    : 'VILLAGE';
}

function formatPlaceOptionLabel(item: GeoPlaceItem) {
  return `${item.name} [${placeTypeLabel(item.type)}] (${item.code})`;
}

interface SearchableLocationComboboxProps<T extends SearchableLocationItem> {
  disabled?: boolean;
  disabledPlaceholder?: string;
  emptyLabel: string;
  getOptionLabel?: (item: T) => string;
  loading?: boolean;
  loadingLabel: string;
  onQueryChange: (value: string) => void;
  onSelect: (code: string) => void;
  options: T[];
  placeholder: string;
  query: string;
  searchPlaceholder: string;
  selectedItem: T | null;
}

function SearchableLocationCombobox<T extends SearchableLocationItem>({
  disabled = false,
  disabledPlaceholder,
  emptyLabel,
  getOptionLabel = defaultOptionLabel,
  loading = false,
  loadingLabel,
  onQueryChange,
  onSelect,
  options,
  placeholder,
  query,
  searchPlaceholder,
  selectedItem,
}: SearchableLocationComboboxProps<T>) {
  const listId = useId();

  const resolveCodeFromInput = (inputValue: string) => {
    const normalizedInput = normalizeCacheKey(inputValue);
    if (!normalizedInput) return '';

    const codeMatch = options.find((item) => normalizeCacheKey(item.code) === normalizedInput);
    if (codeMatch) return codeMatch.code;

    const labelMatch = options.find(
      (item) => normalizeCacheKey(getOptionLabel(item)) === normalizedInput
    );
    if (labelMatch) return labelMatch.code;

    const nameMatches = options.filter(
      (item) => normalizeCacheKey(item.name) === normalizedInput
    );
    if (nameMatches.length === 1) {
      return nameMatches[0].code;
    }

    const parsedCodeMatch = inputValue.match(/\(([^)]+)\)\s*$/);
    if (!parsedCodeMatch?.[1]) return '';
    const parsedCode = parsedCodeMatch[1].trim();
    const parsedMatch = options.find(
      (item) => normalizeCacheKey(item.code) === normalizeCacheKey(parsedCode)
    );
    return parsedMatch?.code || '';
  };

  const inputPlaceholder = disabled
    ? disabledPlaceholder || placeholder
    : searchPlaceholder;

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          value={query}
          onChange={(event) => {
            const nextValue = event.target.value;
            onQueryChange(nextValue);

            if (!nextValue.trim()) {
              onSelect('');
              return;
            }

            const matchedCode = resolveCodeFromInput(nextValue);
            if (matchedCode) {
              onSelect(matchedCode);
              return;
            }

            if (selectedItem) {
              const normalizedSelectedName = normalizeCacheKey(selectedItem.name);
              const normalizedSelectedLabel = normalizeCacheKey(getOptionLabel(selectedItem));
              const normalizedNextValue = normalizeCacheKey(nextValue);
              if (
                normalizedNextValue !== normalizedSelectedName &&
                normalizedNextValue !== normalizedSelectedLabel
              ) {
                onSelect('');
              }
            }
          }}
          placeholder={inputPlaceholder}
          list={!disabled && options.length > 0 ? listId : undefined}
          disabled={disabled}
          className="h-11 bg-white pr-10 disabled:bg-slate-100"
        />
        {loading ? (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" />
        ) : null}
      </div>
      {!disabled && query.trim() && options.length === 0 && !loading ? (
        <p className="text-xs text-slate-500">{emptyLabel}</p>
      ) : null}
      {loading ? (
        <p className="text-xs text-slate-500">{loadingLabel}</p>
      ) : null}
      {!disabled && options.length > 0 ? (
        <datalist id={listId}>
          {options.map((item) => (
            <option key={item.code} value={getOptionLabel(item)} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

export default function AllIndiaLocationSelector({
  initialSelection,
  onConfirm,
}: AllIndiaLocationSelectorProps) {
  const cacheRef = useRef<GeoCache>({
    states: new Map(),
    districts: new Map(),
    subdistricts: new Map(),
    places: new Map(),
  });

  const [stateQuery, setStateQuery] = useState(
    initialSelection?.stateCode
      ? defaultOptionLabel({
          code: initialSelection.stateCode,
          name: initialSelection.state,
        })
      : initialSelection?.state || ''
  );
  const [districtQuery, setDistrictQuery] = useState(
    initialSelection?.districtCode
      ? defaultOptionLabel({
          code: initialSelection.districtCode,
          name: initialSelection.district,
        })
      : initialSelection?.district || ''
  );
  const [subdistrictQuery, setSubdistrictQuery] = useState(
    initialSelection?.subdistrictCode
      ? defaultOptionLabel({
          code: initialSelection.subdistrictCode,
          name: initialSelection.subdistrict,
        })
      : initialSelection?.subdistrict || ''
  );
  const [placeQuery, setPlaceQuery] = useState(
    initialSelection?.placeCode
      ? formatPlaceOptionLabel({
          code: initialSelection.placeCode,
          name: initialSelection.place,
          type: initialSelection.placeType || 'VILLAGE',
          subdistrictCode: initialSelection.subdistrictCode || '',
          subdistrictName: initialSelection.subdistrict || '',
          districtCode: initialSelection.districtCode || '',
          districtName: initialSelection.district || '',
          stateCode: initialSelection.stateCode || '',
          stateName: initialSelection.state || '',
        })
      : initialSelection?.place || ''
  );

  const [stateOptions, setStateOptions] = useState<GeoStateItem[]>([]);
  const [districtOptions, setDistrictOptions] = useState<GeoDistrictItem[]>([]);
  const [subdistrictOptions, setSubdistrictOptions] = useState<GeoSubdistrictItem[]>([]);
  const [placeOptions, setPlaceOptions] = useState<GeoPlaceItem[]>([]);

  const [selectedState, setSelectedState] = useState<GeoStateItem | null>(
    initialSelection?.stateCode
      ? { code: initialSelection.stateCode, name: initialSelection.state }
      : null
  );
  const [selectedDistrict, setSelectedDistrict] = useState<GeoDistrictItem | null>(
    initialSelection?.districtCode
      ? {
          code: initialSelection.districtCode,
          name: initialSelection.district,
          stateCode: initialSelection.stateCode,
          stateName: initialSelection.state,
        }
      : null
  );
  const [selectedSubdistrict, setSelectedSubdistrict] = useState<GeoSubdistrictItem | null>(
    initialSelection?.subdistrictCode
      ? {
          code: initialSelection.subdistrictCode,
          name: initialSelection.subdistrict,
          districtCode: initialSelection.districtCode,
          districtName: initialSelection.district,
          stateCode: initialSelection.stateCode,
          stateName: initialSelection.state,
        }
      : null
  );
  const [selectedPlace, setSelectedPlace] = useState<GeoPlaceItem | null>(
    initialSelection?.placeCode
      ? {
          code: initialSelection.placeCode,
          name: initialSelection.place,
          type: initialSelection.placeType || 'VILLAGE',
          subdistrictCode: initialSelection.subdistrictCode,
          subdistrictName: initialSelection.subdistrict,
          districtCode: initialSelection.districtCode,
          districtName: initialSelection.district,
          stateCode: initialSelection.stateCode,
          stateName: initialSelection.state,
        }
      : null
  );

  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingSubdistricts, setLoadingSubdistricts] = useState(false);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [placeOffset, setPlaceOffset] = useState(0);
  const [placeHasMore, setPlaceHasMore] = useState(false);
  const [placeTotalMatched, setPlaceTotalMatched] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const q = stateQuery.trim();
    const cacheKey = normalizeCacheKey(q);

    const cached = cacheRef.current.states.get(cacheKey);
    if (cached) {
      setStateOptions(cached);
      return undefined;
    }

    const load = async () => {
      try {
        setLoadingStates(true);
        const response = await getGeoStates({ q: q || undefined, limit: FETCH_LIMIT });
        if (!active) return;
        const rows = dedupeByCode(Array.isArray(response.items) ? response.items : []);
        cacheRef.current.states.set(cacheKey, rows);
        setStateOptions(rows);
      } catch (requestError) {
        if (!active) return;
        setStateOptions([]);
        setError(requestError instanceof Error ? requestError.message : 'Could not load states.');
      } finally {
        if (active) {
          setLoadingStates(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [stateQuery]);

  useEffect(() => {
    let active = true;
    if (!selectedState?.code) {
      setDistrictOptions([]);
      return undefined;
    }

    const q = districtQuery.trim();
    const cacheKey = `${selectedState.code}::${normalizeCacheKey(q)}`;
    const cached = cacheRef.current.districts.get(cacheKey);
    if (cached) {
      setDistrictOptions(cached);
      return undefined;
    }

    const load = async () => {
      try {
        setLoadingDistricts(true);
        const response = await getGeoDistricts({
          stateCode: selectedState.code,
          q: q || undefined,
          limit: FETCH_LIMIT,
        });
        if (!active) return;
        const rows = dedupeByCode(Array.isArray(response.items) ? response.items : []);
        cacheRef.current.districts.set(cacheKey, rows);
        setDistrictOptions(rows);
      } catch (requestError) {
        if (!active) return;
        setDistrictOptions([]);
        setError(requestError instanceof Error ? requestError.message : 'Could not load districts.');
      } finally {
        if (active) {
          setLoadingDistricts(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [districtQuery, selectedState]);

  useEffect(() => {
    let active = true;
    if (!selectedDistrict?.code) {
      setSubdistrictOptions([]);
      return undefined;
    }

    const q = subdistrictQuery.trim();
    const cacheKey = `${selectedDistrict.code}::${normalizeCacheKey(q)}`;
    const cached = cacheRef.current.subdistricts.get(cacheKey);
    if (cached) {
      setSubdistrictOptions(cached);
      return undefined;
    }

    const load = async () => {
      try {
        setLoadingSubdistricts(true);
        const response = await getGeoSubdistricts({
          districtCode: selectedDistrict.code,
          q: q || undefined,
          limit: FETCH_LIMIT,
        });
        if (!active) return;
        const rows = dedupeByCode(Array.isArray(response.items) ? response.items : []);
        cacheRef.current.subdistricts.set(cacheKey, rows);
        setSubdistrictOptions(rows);
      } catch (requestError) {
        if (!active) return;
        setSubdistrictOptions([]);
        setError(requestError instanceof Error ? requestError.message : 'Could not load sub-districts.');
      } finally {
        if (active) {
          setLoadingSubdistricts(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [selectedDistrict, subdistrictQuery]);

  useEffect(() => {
    let active = true;
    if (!selectedSubdistrict?.code) {
      setPlaceOptions([]);
      setPlaceHasMore(false);
      setPlaceTotalMatched(0);
      setPlaceOffset(0);
      return undefined;
    }

    const q = placeQuery.trim();
    const cacheKey = `${selectedSubdistrict.code}::${normalizeCacheKey(q)}::${placeOffset}`;
    const cached = cacheRef.current.places.get(cacheKey);
    if (cached) {
      setPlaceOptions((previous) =>
        placeOffset === 0 ? cached.items : mergeUniquePlaces(previous, cached.items)
      );
      setPlaceHasMore(cached.hasMore);
      setPlaceTotalMatched(cached.totalMatched);
      return undefined;
    }

    const load = async () => {
      try {
        setLoadingPlaces(true);
        const response = await getGeoPlaces({
          subdistrictCode: selectedSubdistrict.code,
          q: q || undefined,
          limit: FETCH_LIMIT,
          offset: placeOffset,
        });
        if (!active) return;
        const rows = dedupeByCode(Array.isArray(response.items) ? response.items : []);
        const totalMatched = Number(response.totalMatched) || 0;
        const hasMore = Boolean(response.hasMore);
        const cacheValue: GeoPlacePageCache = {
          items: rows,
          totalMatched,
          hasMore,
        };
        cacheRef.current.places.set(cacheKey, cacheValue);
        setPlaceOptions((previous) => (placeOffset === 0 ? rows : mergeUniquePlaces(previous, rows)));
        setPlaceHasMore(hasMore);
        setPlaceTotalMatched(totalMatched);
      } catch (requestError) {
        if (!active) return;
        if (placeOffset === 0) {
          setPlaceOptions([]);
          setPlaceHasMore(false);
          setPlaceTotalMatched(0);
        }
        setError(requestError instanceof Error ? requestError.message : 'Could not load places.');
      } finally {
        if (active) {
          setLoadingPlaces(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [placeOffset, placeQuery, selectedSubdistrict]);

  const canConfirm =
    !!selectedState &&
    !!selectedDistrict &&
    !!selectedSubdistrict &&
    !!selectedPlace;

  const handleStateSelect = (code: string) => {
    const row = stateOptions.find((item) => item.code === code) || null;
    setSelectedState(row);
    if (row) {
      setStateQuery(defaultOptionLabel(row));
    }
    setSelectedDistrict(null);
    setSelectedSubdistrict(null);
    setSelectedPlace(null);
    setDistrictQuery('');
    setSubdistrictQuery('');
    setPlaceQuery('');
    setPlaceOffset(0);
    setPlaceHasMore(false);
    setPlaceTotalMatched(0);
    setError('');
    setMessage('');
  };

  const handleDistrictSelect = (code: string) => {
    const row = districtOptions.find((item) => item.code === code) || null;
    setSelectedDistrict(row);
    if (row) {
      setDistrictQuery(defaultOptionLabel(row));
    }
    setSelectedSubdistrict(null);
    setSelectedPlace(null);
    setSubdistrictQuery('');
    setPlaceQuery('');
    setPlaceOffset(0);
    setPlaceHasMore(false);
    setPlaceTotalMatched(0);
    setError('');
    setMessage('');
  };

  const handleSubdistrictSelect = (code: string) => {
    const row = subdistrictOptions.find((item) => item.code === code) || null;
    setSelectedSubdistrict(row);
    if (row) {
      setSubdistrictQuery(defaultOptionLabel(row));
    }
    setSelectedPlace(null);
    setPlaceQuery('');
    setPlaceOffset(0);
    setPlaceHasMore(false);
    setPlaceTotalMatched(0);
    setError('');
    setMessage('');
  };

  const handlePlaceSelect = (code: string) => {
    const row = placeOptions.find((item) => item.code === code) || null;
    setSelectedPlace(row);
    if (row) {
      setPlaceQuery(formatPlaceOptionLabel(row));
    }
    setError('');
    setMessage('');
  };

  const handleChangeState = () => {
    setSelectedState(null);
    setSelectedDistrict(null);
    setSelectedSubdistrict(null);
    setSelectedPlace(null);
    setStateQuery('');
    setDistrictQuery('');
    setSubdistrictQuery('');
    setPlaceQuery('');
    setPlaceOffset(0);
    setPlaceHasMore(false);
    setPlaceTotalMatched(0);
    setError('');
    setMessage('');
  };

  const handleChangeDistrict = () => {
    setSelectedDistrict(null);
    setSelectedSubdistrict(null);
    setSelectedPlace(null);
    setDistrictQuery('');
    setSubdistrictQuery('');
    setPlaceQuery('');
    setPlaceOffset(0);
    setPlaceHasMore(false);
    setPlaceTotalMatched(0);
    setError('');
    setMessage('');
  };

  const handleChangeSubdistrict = () => {
    setSelectedSubdistrict(null);
    setSelectedPlace(null);
    setSubdistrictQuery('');
    setPlaceQuery('');
    setPlaceOffset(0);
    setPlaceHasMore(false);
    setPlaceTotalMatched(0);
    setError('');
    setMessage('');
  };

  const handleChangePlace = () => {
    setSelectedPlace(null);
    setPlaceQuery('');
    setPlaceOffset(0);
    setPlaceHasMore(false);
    setPlaceTotalMatched(0);
    setError('');
    setMessage('');
  };

  const handleStateQueryChange = (value: string) => {
    setStateQuery(value);
    setError('');
    setMessage('');
  };

  const handleDistrictQueryChange = (value: string) => {
    setDistrictQuery(value);
    setError('');
    setMessage('');
  };

  const handleSubdistrictQueryChange = (value: string) => {
    setSubdistrictQuery(value);
    setError('');
    setMessage('');
  };

  const handlePlaceQueryChange = (value: string) => {
    setPlaceQuery(value);
    setPlaceOffset(0);
    setSelectedPlace(null);
    setMessage('');
    setError('');
  };

  const handleLoadMorePlaces = () => {
    if (!placeHasMore || loadingPlaces) return;
    setPlaceOffset((previous) => previous + FETCH_LIMIT);
  };

  const handleConfirm = () => {
    if (!canConfirm || !selectedState || !selectedDistrict || !selectedSubdistrict || !selectedPlace) {
      return;
    }

    const payload: IndiaLocationSelection = {
      state: selectedState.name,
      stateCode: selectedState.code,
      district: selectedDistrict.name,
      districtCode: selectedDistrict.code,
      subdistrict: selectedSubdistrict.name,
      subdistrictCode: selectedSubdistrict.code,
      place: selectedPlace.name,
      placeCode: selectedPlace.code,
      placeType: selectedPlace.type || 'VILLAGE',
      confirmedAt: new Date().toISOString(),
    };

    onConfirm?.(payload);
    setMessage('Location confirmed. This will be used as your default across India.');
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Coverage Across India</h3>
      <p className="mt-1 text-sm text-slate-600">
        Fill all 4 fields below to map your location exactly using official LGD codes.
      </p>

      <div className="mt-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              State
            </p>
            <SearchableLocationCombobox
              options={stateOptions}
              selectedItem={selectedState}
              query={stateQuery}
              onQueryChange={handleStateQueryChange}
              onSelect={handleStateSelect}
              getOptionLabel={defaultOptionLabel}
              placeholder="Select state"
              searchPlaceholder="Search state"
              emptyLabel="No states found."
              loading={loadingStates}
              loadingLabel="Loading states..."
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              District
            </p>
            <SearchableLocationCombobox
              disabled={!selectedState}
              disabledPlaceholder="Select state first"
              options={districtOptions}
              selectedItem={selectedDistrict}
              query={districtQuery}
              onQueryChange={handleDistrictQueryChange}
              onSelect={handleDistrictSelect}
              getOptionLabel={defaultOptionLabel}
              placeholder="Select district"
              searchPlaceholder="Search district"
              emptyLabel="No districts found."
              loading={loadingDistricts}
              loadingLabel="Loading districts..."
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Sub-district
            </p>
            <SearchableLocationCombobox
              disabled={!selectedDistrict}
              disabledPlaceholder="Select district first"
              options={subdistrictOptions}
              selectedItem={selectedSubdistrict}
              query={subdistrictQuery}
              onQueryChange={handleSubdistrictQueryChange}
              onSelect={handleSubdistrictSelect}
              getOptionLabel={defaultOptionLabel}
              placeholder="Select sub-district"
              searchPlaceholder="Search taluk / tehsil"
              emptyLabel="No sub-districts found."
              loading={loadingSubdistricts}
              loadingLabel="Loading sub-districts..."
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              City / Village
            </p>
            <SearchableLocationCombobox
              disabled={!selectedSubdistrict}
              disabledPlaceholder="Select sub-district first"
              options={placeOptions}
              selectedItem={selectedPlace}
              query={placeQuery}
              onQueryChange={handlePlaceQueryChange}
              onSelect={handlePlaceSelect}
              getOptionLabel={formatPlaceOptionLabel}
              placeholder="Select city / village"
              searchPlaceholder="Search city or village"
              emptyLabel="No places found."
              loading={loadingPlaces}
              loadingLabel="Loading places..."
            />
          </div>
        </div>

        {selectedSubdistrict && placeTotalMatched > 0 ? (
          <p className="text-xs text-slate-500">
            Showing {placeOptions.length} of {placeTotalMatched} places. Use code in brackets for exact match.
          </p>
        ) : null}
        {selectedSubdistrict && placeHasMore ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-lg px-3 text-xs"
            onClick={handleLoadMorePlaces}
            disabled={loadingPlaces}
          >
            {loadingPlaces ? 'Loading...' : 'Load more places'}
          </Button>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Selected Path
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {selectedState?.name || 'State'} {'>'} {selectedDistrict?.name || 'District'} {'>'}{' '}
            {selectedSubdistrict?.name || 'Sub-district'} {'>'} {selectedPlace?.name || 'City / Village'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedState ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-full px-3 text-xs"
                onClick={handleChangeState}
              >
                Change state
              </Button>
            ) : null}
            {selectedDistrict ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-full px-3 text-xs"
                onClick={handleChangeDistrict}
              >
                Change district
              </Button>
            ) : null}
            {selectedSubdistrict ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-full px-3 text-xs"
                onClick={handleChangeSubdistrict}
              >
                Change sub-district
              </Button>
            ) : null}
            {selectedPlace ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-full px-3 text-xs"
                onClick={handleChangePlace}
              >
                Change place
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={!canConfirm}
          className="h-10 rounded-xl bg-blue-700 px-4 text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleConfirm}
        >
          Confirm Location
        </Button>
        {selectedPlace ? (
          <p className="text-xs text-slate-600">
            Selected: {selectedPlace.name}, {selectedSubdistrict?.name}, {selectedDistrict?.name}, {selectedState?.name}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {message}
        </p>
      ) : null}

      <p className="mt-3 text-xs text-slate-500">
        We use official LGD / government directories for location accuracy.
      </p>
    </div>
  );
}
