import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';

interface AmenitySelectorProps {
  title?: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  required?: boolean;
}

export default function AmenitySelector({
  title = 'Amenities',
  options,
  selected,
  onChange,
  required = false,
}: AmenitySelectorProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) {
      return options;
    }
    return options.filter((option) => option.toLowerCase().includes(text));
  }, [options, query]);

  const toggle = (amenity: string) => {
    const exists = selected.includes(amenity);
    if (exists) {
      onChange(selected.filter((item) => item !== amenity));
      return;
    }
    onChange([...selected, amenity]);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          {title}
          {required ? <span className="ml-1 text-red-600">*</span> : null}
        </p>
        <p className="text-xs text-slate-500">{selected.length} selected</p>
      </div>

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search amenities"
        className="mt-3 h-10 bg-white"
      />

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((amenity) => {
          const active = selected.includes(amenity);
          return (
            <label
              key={amenity}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                active
                  ? 'border-blue-300 bg-blue-50 text-blue-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200'
              }`}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(amenity)}
                className="h-4 w-4 accent-blue-700"
              />
              <span>{amenity}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
