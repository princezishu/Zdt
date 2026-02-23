import { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listCompanies, type Company } from '@/lib/realtyApi';

interface DealersDirectoryPageProps {
  onOpenCompany: (companyId: number) => void;
}

export default function DealersDirectoryPage({ onOpenCompany }: DealersDirectoryPageProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    listCompanies({ limit: 60 })
      .then((rows) => {
        if (!active) return;
        setCompanies(rows);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load companies');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const cityOptions = useMemo(
    () => Array.from(new Set(companies.map((item) => item.city).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [companies]
  );

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return companies.filter((company) => {
      if (city && company.city !== city) {
        return false;
      }
      if (!text) {
        return true;
      }
      return `${company.name} ${company.description} ${company.city} ${company.area}`
        .toLowerCase()
        .includes(text);
    });
  }, [city, companies, query]);

  return (
    <section className="min-h-screen pb-16 pt-36 text-slate-900 lg:pt-40">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">ZDT Realty Network</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Dealers & Builders Directory</h1>
          <p className="mt-2 text-sm text-slate-600">
            Browse verified builders and dealers, view their company profiles, and discover projects and listings.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by company, city, or area"
                className="h-11 bg-white pl-9"
              />
            </div>
            <select
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400"
            >
              <option value="">All Cities</option>
              {cityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading companies...</div>
        ) : null}

        {!loading && filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            No dealers/builders found for the applied filters.
          </div>
        ) : null}

        {!loading && filtered.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((company) => (
              <article
                key={company.id}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    {company.logoUrl ? (
                      <img src={company.logoUrl} alt={`${company.name} logo`} className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className="h-6 w-6 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-base font-semibold text-slate-900 line-clamp-1">{company.name}</p>
                      {company.isVerified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Verified
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          Unverified
                        </span>
                      )}
                    </div>
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {[company.city, company.area].filter(Boolean).join(', ') || 'Location not set'}
                    </p>
                  </div>
                </div>

                <p className="mt-4 line-clamp-3 text-sm text-slate-600">
                  {company.description || 'Professional builder/dealer profile on ZDT Realty.'}
                </p>

                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                    {company.projectCount} Projects
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                    {company.propertyCount} Listings
                  </span>
                </div>

                <Button
                  className="mt-5 h-10 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800"
                  onClick={() => onOpenCompany(company.id)}
                >
                  View Profile
                </Button>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
