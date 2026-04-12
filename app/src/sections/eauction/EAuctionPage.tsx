import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Landmark, Search, ShieldAlert } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { apiRequest } from '@/lib/http';
import type { AuthUser } from '@/lib/session';
import styles from './EAuctionPage.module.scss';

type SourceType = 'bank' | 'government' | 'common_portal';
type PropertyType =
  | 'plot_land'
  | 'apartment_flat'
  | 'commercial'
  | 'industrial'
  | 'agricultural'
  | 'mixed'
  | 'other';

interface EAuctionSource {
  id: number;
  sourceKey: string;
  name: string;
  authorityName: string;
  sourceType: SourceType;
  sourceBadge: string;
  officialListingUrl: string;
  officialDetailUrl: string;
  noticePdfUrl: string;
  sourceDomain: string;
  description: string;
  badges: string[];
  loginRequired: boolean;
  bidderRegistrationRequired: boolean;
  emdMentioned: boolean;
  domainStatus: string;
  lastCheckedAt?: string;
  isActive: boolean;
}

interface EAuctionListing {
  id: number;
  title: string;
  summary: string;
  propertyType: PropertyType;
  sourceBadge: string;
  bankAuthorityName: string;
  sourceType: SourceType;
  officialListingUrl: string;
  officialDetailUrl: string;
  noticePdfUrl: string;
  sourceDomain: string;
  loginRequired: boolean;
  bidderRegistrationRequired: boolean;
  emdMentioned: boolean;
  reservePriceDisplay: string;
  emdDisplay: string;
  auctionDate?: string;
  inspectionDate?: string;
  stateName: string;
  districtName: string;
  cityName: string;
  propertyLocation: string;
  pdfAvailable: boolean;
}

interface EAuctionPageProps {
  token?: string;
  user?: AuthUser | null;
}

interface EAuctionListingsResponse {
  listings: EAuctionListing[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZE = 60;

const SOURCE_TYPE_OPTIONS: Array<{ key: '' | SourceType; label: string }> = [
  { key: '', label: 'All sources' },
  { key: 'bank', label: 'Bank' },
  { key: 'government', label: 'Government' },
  { key: 'common_portal', label: 'Common portal' },
];

const PROPERTY_TYPE_OPTIONS: Array<{ key: '' | PropertyType; label: string }> = [
  { key: '', label: 'All property types' },
  { key: 'plot_land', label: 'Plots / Land' },
  { key: 'apartment_flat', label: 'Apartments / Flats' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'industrial', label: 'Industrial' },
  { key: 'agricultural', label: 'Agricultural' },
  { key: 'mixed', label: 'Mixed' },
  { key: 'other', label: 'Other' },
];

const HOW_TO_BUY_STEPS = [
  'Search the property on ZDT Realty.',
  'Open the official source page or the official notice PDF.',
  'Read reserve price, EMD, auction date, and all sale terms.',
  'Register on the official portal and complete KYC if required.',
  'Deposit EMD only as mentioned in the official notice.',
  'Verify title, dues, encumbrances, possession, and inspect physically.',
  'Bid only on the official platform.',
  'If you win, complete payment, sale certificate, and registration within deadline.',
];

const INDIA_STATE_OPTIONS = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli',
  'Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

function formatDate(value?: string): string {
  if (!value) return 'Check official notice';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Check official notice';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function propertyTypeLabel(value: PropertyType): string {
  return PROPERTY_TYPE_OPTIONS.find((option) => option.key === value)?.label || 'Other';
}

function locationLabel(item: EAuctionListing): string {
  return [item.cityName, item.districtName, item.stateName].filter(Boolean).join(', ') || item.propertyLocation || 'Official notice';
}

export default function EAuctionPage({ token = '', user = null }: EAuctionPageProps) {
  const canManageSources = Boolean(token && user?.role === 'admin' && user?.isMainAdmin);
  const [listings, setListings] = useState<EAuctionListing[]>([]);
  const [sources, setSources] = useState<EAuctionSource[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [loadingSources, setLoadingSources] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');
  const [stateName, setStateName] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [cityName, setCityName] = useState('');
  const [propertyType, setPropertyType] = useState<'' | PropertyType>('');
  const [sourceType, setSourceType] = useState<'' | SourceType>('');
  const [authority, setAuthority] = useState('');
  const [auctionFrom, setAuctionFrom] = useState('');
  const [auctionTo, setAuctionTo] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [listingPage, setListingPage] = useState(1);
  const [listingTotal, setListingTotal] = useState(0);
  const [listingTotalPages, setListingTotalPages] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [adminName, setAdminName] = useState('');
  const [adminAuthorityName, setAdminAuthorityName] = useState('');
  const [adminSourceType, setAdminSourceType] = useState<SourceType>('bank');
  const [adminListingUrl, setAdminListingUrl] = useState('');
  const [adminDetailUrl, setAdminDetailUrl] = useState('');
  const [adminNoticeUrl, setAdminNoticeUrl] = useState('');
  const [adminAllowedDomains, setAdminAllowedDomains] = useState('');
  const [adminDescription, setAdminDescription] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminDeletingId, setAdminDeletingId] = useState<number | null>(null);
  const [adminNotice, setAdminNotice] = useState('');

  useEffect(() => {
    setListingPage(1);
  }, [search, stateName, districtName, cityName, propertyType, sourceType, authority, auctionFrom, auctionTo, minPrice, maxPrice]);

  useEffect(() => {
    const listingsParams = new URLSearchParams();
    const sourceParams = new URLSearchParams();
    for (const [key, value] of [
      ['search', search],
      ['state', stateName],
      ['district', districtName],
      ['city', cityName],
      ['property_type', propertyType],
      ['source_type', sourceType],
      ['authority', authority],
      ['auction_from', auctionFrom],
      ['auction_to', auctionTo],
      ['min_price', minPrice],
      ['max_price', maxPrice],
    ]) {
      if (!value) continue;
      listingsParams.set(key, value);
    }
    listingsParams.set('page', String(listingPage));
    listingsParams.set('limit', String(PAGE_SIZE));
    if (sourceType) sourceParams.set('source_type', sourceType);
    if (search) sourceParams.set('search', search);

    setLoadingListings(true);
    setLoadingSources(true);
    setError('');

    Promise.all([
      apiRequest<EAuctionListingsResponse>(`/api/eauction/listings?${listingsParams.toString()}`),
      apiRequest<{ sources: EAuctionSource[] }>(`/api/eauction/sources?${sourceParams.toString()}`),
    ])
      .then(([listingData, sourceData]) => {
        setListings(Array.isArray(listingData.listings) ? listingData.listings : []);
        setListingTotal(Number(listingData.total || 0));
        setListingTotalPages(Math.max(1, Number(listingData.totalPages || 1)));
        setSources(Array.isArray(sourceData.sources) ? sourceData.sources : []);
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load official auction data.');
      })
      .finally(() => {
        setLoadingListings(false);
        setLoadingSources(false);
      });
  }, [search, stateName, districtName, cityName, propertyType, sourceType, authority, auctionFrom, auctionTo, minPrice, maxPrice, listingPage, reloadKey]);

  const authorities = useMemo(() => Array.from(new Set(listings.map((item) => item.bankAuthorityName).filter(Boolean))).sort(), [listings]);

  const openResolvedLink = async (kind: 'sources' | 'listings', id: number, target: 'page' | 'pdf') => {
    setActionError('');
    try {
      const data = await apiRequest<{ resolvedUrl: string }>(`/api/eauction/${kind}/${id}/resolve?target=${target}`);
      window.open(data.resolvedUrl, '_blank', 'noopener,noreferrer');
    } catch (openError) {
      setActionError(openError instanceof Error ? openError.message : 'Official source temporarily unavailable');
    }
  };

  const addSource = async () => {
    if (!canManageSources) return;
    setAdminSaving(true);
    setAdminNotice('');
    setActionError('');
    try {
      await apiRequest(
        '/api/eauction/sources',
        {
          method: 'POST',
          body: JSON.stringify({
            name: adminName,
            authorityName: adminAuthorityName || adminName,
            sourceType: adminSourceType,
            portalUrl: adminListingUrl,
            officialListingUrl: adminListingUrl,
            officialDetailUrl: adminDetailUrl,
            noticePdfUrl: adminNoticeUrl,
            allowedDomains: adminAllowedDomains.split(',').map((item) => item.trim()).filter(Boolean),
            description: adminDescription,
          }),
        },
        token
      );
      setAdminName('');
      setAdminAuthorityName('');
      setAdminListingUrl('');
      setAdminDetailUrl('');
      setAdminNoticeUrl('');
      setAdminAllowedDomains('');
      setAdminDescription('');
      setAdminNotice('Official source added.');
      setReloadKey((value) => value + 1);
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : 'Unable to add official source.');
    } finally {
      setAdminSaving(false);
    }
  };

  const deleteSource = async (id: number) => {
    if (!canManageSources || !window.confirm('Delete this source?')) return;
    setAdminDeletingId(id);
    setActionError('');
    try {
      await apiRequest(`/api/eauction/sources/${id}`, { method: 'DELETE' }, token);
      setReloadKey((value) => value + 1);
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'Unable to delete source.');
    } finally {
      setAdminDeletingId(null);
    }
  };

  return (
    <main className={styles.page}>
      <div className="page-container">
        <section className={styles.hero}>
          <div className={styles.heroTop}>
            <div>
              <p className={styles.kicker}>ZDT Realty Official Source Directory</p>
              <h1 className={styles.title}>Government & Bank E-Auction Properties</h1>
              <p className={styles.subtitle}>
                Browse auction properties from official bank and government sources. Open the original auction page or notice directly from the source authority.
              </p>
            </div>
          </div>
          <div className={styles.disclaimer} role="note">
            <strong>Trust note:</strong> We only help users discover official auction sources. We do not sell, broker, or conduct these auctions.
          </div>
          <div className={`${styles.disclaimer} mt-3`} role="note">
            <strong>Buyer warning:</strong> Always verify title, dues, litigation, physical condition, and all sale terms independently before bidding.
          </div>
        </section>

        {canManageSources ? (
          <section className={styles.adminPanel}>
            <div className={styles.adminHeader}>
              <h2 className={styles.adminTitle}>Main Admin Source Manager</h2>
              <p className={styles.adminSubtitle}>Only official-source domains are allowed here.</p>
            </div>
            <div className={styles.adminGrid}>
              <input value={adminName} onChange={(event) => setAdminName(event.target.value)} className={styles.adminInput} placeholder="Source name" />
              <input value={adminAuthorityName} onChange={(event) => setAdminAuthorityName(event.target.value)} className={styles.adminInput} placeholder="Bank / authority name" />
              <select value={adminSourceType} onChange={(event) => setAdminSourceType(event.target.value as SourceType)} className={styles.adminInput}>
                {SOURCE_TYPE_OPTIONS.filter((option) => option.key).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
              <input value={adminListingUrl} onChange={(event) => setAdminListingUrl(event.target.value)} className={styles.adminInput} placeholder="Official listing URL" />
              <input value={adminDetailUrl} onChange={(event) => setAdminDetailUrl(event.target.value)} className={styles.adminInput} placeholder="Official detail URL (optional)" />
              <input value={adminNoticeUrl} onChange={(event) => setAdminNoticeUrl(event.target.value)} className={styles.adminInput} placeholder="Notice PDF URL (optional)" />
              <input value={adminAllowedDomains} onChange={(event) => setAdminAllowedDomains(event.target.value)} className={styles.adminInput} placeholder="Allowed domains, comma separated" />
              <textarea value={adminDescription} onChange={(event) => setAdminDescription(event.target.value)} className={styles.adminTextarea} rows={2} placeholder="Source description" />
            </div>
            <div className={styles.adminActions}>
              <button type="button" className={styles.adminAddButton} onClick={() => void addSource()} disabled={adminSaving}>{adminSaving ? 'Saving...' : 'Add Official Source'}</button>
              {adminNotice ? <p className={styles.adminNotice}>{adminNotice}</p> : null}
            </div>
          </section>
        ) : null}

        <section className={styles.controls}>
          <div className={styles.filters}>
            <div className={`${styles.searchWrap} md:col-span-2`}>
              <Search className={styles.searchIcon} aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className={styles.searchInput} placeholder="Search title, bank, district, city..." aria-label="Search e-auction properties" />
            </div>
            <label className={styles.selectWrap}><span className={styles.selectLabel}>Source Type</span><select value={sourceType} onChange={(event) => setSourceType(event.target.value as '' | SourceType)} className={styles.select}>{SOURCE_TYPE_OPTIONS.map((option) => <option key={option.label} value={option.key}>{option.label}</option>)}</select></label>
            <label className={styles.selectWrap}><span className={styles.selectLabel}>Property Type</span><select value={propertyType} onChange={(event) => setPropertyType(event.target.value as '' | PropertyType)} className={styles.select}>{PROPERTY_TYPE_OPTIONS.map((option) => <option key={option.label} value={option.key}>{option.label}</option>)}</select></label>
            <label className={styles.selectWrap}><span className={styles.selectLabel}>State</span><input value={stateName} onChange={(event) => setStateName(event.target.value)} className={styles.select} list="eauction-states" placeholder="State" /></label>
            <label className={styles.selectWrap}><span className={styles.selectLabel}>District</span><input value={districtName} onChange={(event) => setDistrictName(event.target.value)} className={styles.select} placeholder="District" /></label>
            <label className={styles.selectWrap}><span className={styles.selectLabel}>City</span><input value={cityName} onChange={(event) => setCityName(event.target.value)} className={styles.select} placeholder="City" /></label>
            <label className={styles.selectWrap}><span className={styles.selectLabel}>Authority</span><input value={authority} onChange={(event) => setAuthority(event.target.value)} className={styles.select} list="eauction-authorities" placeholder="Bank / authority" /></label>
            <label className={styles.selectWrap}><span className={styles.selectLabel}>Auction From</span><input value={auctionFrom} onChange={(event) => setAuctionFrom(event.target.value)} className={styles.select} type="date" /></label>
            <label className={styles.selectWrap}><span className={styles.selectLabel}>Auction To</span><input value={auctionTo} onChange={(event) => setAuctionTo(event.target.value)} className={styles.select} type="date" /></label>
            <label className={styles.selectWrap}><span className={styles.selectLabel}>Min Price</span><input value={minPrice} onChange={(event) => setMinPrice(event.target.value)} className={styles.select} inputMode="numeric" placeholder="Reserve price min" /></label>
            <label className={styles.selectWrap}><span className={styles.selectLabel}>Max Price</span><input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} className={styles.select} inputMode="numeric" placeholder="Reserve price max" /></label>
          </div>
          <datalist id="eauction-states">{INDIA_STATE_OPTIONS.map((item) => <option key={item} value={item} />)}</datalist>
          <datalist id="eauction-authorities">{authorities.map((item) => <option key={item} value={item} />)}</datalist>
        </section>

        {error || actionError ? (
          <div className={styles.error} role="alert">
            <p className={styles.errorTitle}>Auction data needs attention</p>
            <p className={styles.errorBody}>{actionError || error}</p>
            <button type="button" className={styles.retry} onClick={() => setReloadKey((value) => value + 1)}>Retry</button>
          </div>
        ) : null}

        <section className={styles.results}>
          <div className={styles.resultsHeader}>
            <h2 className={styles.resultsTitle}>Government & Bank E-Auction Properties</h2>
            <p className={styles.resultsMeta}>
              {loadingListings ? 'Loading...' : `${listingTotal.toLocaleString('en-IN')} listing(s) across ${listingTotalPages.toLocaleString('en-IN')} page(s)`}
            </p>
          </div>
          {loadingListings ? (
            <div className={styles.loading}><Spinner className="h-5 w-5" /><span>Fetching official auction listings...</span></div>
          ) : !listings.length ? (
            <div className={styles.emptyState}>No official auction listings matched this search.</div>
          ) : (
            <>
              <div className={styles.grid}>
                {listings.map((item) => (
                  <article key={item.id} className={styles.card}>
                    <div className={styles.cardTop}>
                      <div className={styles.logo} aria-hidden="true"><Landmark className={styles.logoIcon} /></div>
                      <div className={styles.cardHeading}>
                        <h3 className={styles.cardName}>{item.title}</h3>
                        <div className={styles.chips}>
                          <span className={styles.categoryChip}>{item.sourceBadge}</span>
                          <span className={styles.badgeCount}>{propertyTypeLabel(item.propertyType)}</span>
                        </div>
                      </div>
                    </div>
                    <div className={styles.badges}>
                      <span className={styles.badge}>{item.bankAuthorityName}</span>
                      <span className={styles.badge}>{item.sourceDomain}</span>
                      <span className={styles.badge}>{item.loginRequired ? 'Login required' : 'Public page'}</span>
                      <span className={styles.badge}>{item.pdfAvailable ? 'PDF available' : 'PDF lookup on demand'}</span>
                    </div>
                    <p className={styles.description}>{item.summary}</p>
                    <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                      <p><strong>Location:</strong> {locationLabel(item)}</p>
                      <p><strong>Auction date:</strong> {formatDate(item.auctionDate)}</p>
                      <p><strong>Reserve price:</strong> {item.reservePriceDisplay || 'See official notice'}</p>
                      <p><strong>EMD:</strong> {item.emdDisplay || (item.emdMentioned ? 'Mentioned in notice' : 'Check official notice')}</p>
                      <p><strong>Inspection:</strong> {formatDate(item.inspectionDate)}</p>
                      <p><strong>Official domain:</strong> {item.sourceDomain}</p>
                    </div>
                    <div className={styles.actions}>
                      <button type="button" className={styles.visitButton} onClick={() => void openResolvedLink('listings', item.id, 'page')}>Open Official Page <ExternalLink className={styles.visitIcon} /></button>
                      <button type="button" className={styles.visitButton} onClick={() => void openResolvedLink('listings', item.id, 'pdf')}>Open Notice PDF <FileText className={styles.visitIcon} /></button>
                    </div>
                  </article>
                ))}
              </div>
              {listingTotalPages > 1 ? (
                <div className={styles.pagination}>
                  <button type="button" className={styles.paginationButton} onClick={() => setListingPage((value) => Math.max(1, value - 1))} disabled={listingPage <= 1}>
                    Previous
                  </button>
                  <p className={styles.paginationMeta}>
                    Page {listingPage.toLocaleString('en-IN')} of {listingTotalPages.toLocaleString('en-IN')}
                  </p>
                  <button type="button" className={styles.paginationButton} onClick={() => setListingPage((value) => Math.min(listingTotalPages, value + 1))} disabled={listingPage >= listingTotalPages}>
                    Next
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className={styles.results}>
          <div className={styles.resultsHeader}>
            <h2 className={styles.resultsTitle}>Verified Source Directory</h2>
            <p className={styles.resultsMeta}>{loadingSources ? 'Loading...' : `${sources.length} official source(s)`}</p>
          </div>
          {loadingSources ? (
            <div className={styles.loading}><Spinner className="h-5 w-5" /><span>Checking official source directory...</span></div>
          ) : (
            <div className={styles.grid}>
              {sources.map((source) => (
                <article key={source.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.logo} aria-hidden="true"><ShieldAlert className={styles.logoIcon} /></div>
                    <div className={styles.cardHeading}>
                      <h3 className={styles.cardName}>{source.name}</h3>
                      <div className={styles.chips}><span className={styles.categoryChip}>{source.sourceBadge}</span></div>
                    </div>
                  </div>
                  <div className={styles.badges}>
                    <span className={styles.badge}>{source.authorityName}</span>
                    <span className={styles.badge}>{source.sourceDomain}</span>
                    <span className={styles.badge}>{source.bidderRegistrationRequired ? 'Registration required' : 'No registration before search'}</span>
                  </div>
                  <p className={styles.description}>{source.description}</p>
                  <p className="text-sm text-slate-700"><strong>Last checked:</strong> {formatDate(source.lastCheckedAt)}</p>
                  <div className={styles.actions}>
                    <button type="button" className={styles.visitButton} onClick={() => void openResolvedLink('sources', source.id, 'page')}>Open Official Page <ExternalLink className={styles.visitIcon} /></button>
                    {canManageSources ? <button type="button" className={styles.deleteSourceButton} onClick={() => void deleteSource(source.id)} disabled={adminDeletingId === source.id}>{adminDeletingId === source.id ? 'Deleting...' : 'Delete Source'}</button> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.steps}>
          <div className={styles.stepsHeader}>
            <h2 className={styles.stepsTitle}>How To Buy E-Auction Properties</h2>
            <p className={styles.stepsSubtitle}>Use ZDT to discover the source. Complete the actual process only on the official platform.</p>
          </div>
          <ol className={styles.stepsList}>{HOW_TO_BUY_STEPS.map((step, index) => <li key={step} className={styles.stepItem}><span className={styles.stepNumber}>{index + 1}</span><span className={styles.stepText}>{step}</span></li>)}</ol>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className={styles.steps}>
            <div className={styles.stepsHeader}><h2 className={styles.stepsTitle}>Buyer Safety</h2></div>
            <ul className="mt-4 grid gap-3 text-sm text-slate-700">
              <li>Always check the official source domain before bidding.</li>
              <li>Always read the sale notice PDF or official notice page.</li>
              <li>Never pay outside the official process.</li>
              <li>Verify title, encumbrances, taxes, possession, and litigation independently.</li>
              <li>Inspect the property physically wherever possible.</li>
              <li>Never rely on unofficial brokers for these listings.</li>
            </ul>
          </div>
          <div className={styles.steps}>
            <div className={styles.stepsHeader}><h2 className={styles.stepsTitle}>Legal + Disclaimer</h2></div>
            <p className="mt-4 text-sm leading-6 text-slate-700">
              ZDT Realty does not sell, broker, or conduct these auctions. We only redirect users to official bank or government auction sources. Final terms, eligibility, bidding process, and property details are governed only by the official source portal and sale notice.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
