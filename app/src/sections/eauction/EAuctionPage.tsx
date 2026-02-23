import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Landmark, Search } from 'lucide-react';
import { apiRequest } from '@/lib/http';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import styles from './EAuctionPage.module.scss';

type EAuctionCategory = 'plots' | 'apartments' | 'complex' | 'all';
type SortKey = 'official' | 'az' | 'newest';

interface EAuctionCard {
  id: number;
  name: string;
  portalUrl: string;
  category: EAuctionCategory;
  description: string;
  badges: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

const CATEGORY_TABS: Array<{ key: EAuctionCategory; label: string; subtitle: string }> = [
  { key: 'plots', label: 'Plots/Land', subtitle: 'Land & layouts' },
  { key: 'apartments', label: 'Apartments/Flats', subtitle: 'Residential units' },
  { key: 'complex', label: 'Complex/Commercial', subtitle: 'Retail & offices' },
  { key: 'all', label: 'All', subtitle: 'All sources' },
];

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'official', label: 'Official First' },
  { key: 'az', label: 'A-Z' },
  { key: 'newest', label: 'Newest' },
];

const AUCTION_STEPS = [
  'Choose portal',
  'Read notice (reserve price, EMD, date)',
  'Register / KYC',
  'Pay EMD',
  'Bid on auction day',
  'Verify property documents before final payment',
];

function isSafePortalUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function categoryChipLabel(category: EAuctionCategory): string {
  if (category === 'plots') return 'Plots/Land';
  if (category === 'apartments') return 'Apartments/Flats';
  if (category === 'complex') return 'Complex/Commercial';
  return 'All';
}

export default function EAuctionPage() {
  const [category, setCategory] = useState<EAuctionCategory>('plots');
  const [sort, setSort] = useState<SortKey>('official');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [cards, setCards] = useState<EAuctionCard[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError('');

    const params = new URLSearchParams();
    params.set('category', category);
    params.set('sort', sort);
    if (search) {
      params.set('search', search);
    }

    apiRequest<{ cards: EAuctionCard[] }>(`/api/eauction/cards?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((data) => {
        const nextCards = Array.isArray(data.cards) ? data.cards : [];
        setCards(nextCards);
      })
      .catch((err) => {
        const maybeAbort = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
        if (maybeAbort === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'Unable to load e-auction sources.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [category, sort, search, reloadKey]);

  const filteredCards = useMemo(() => {
    if (!activeOnly) {
      return cards;
    }
    return cards.filter((card) => card.isActive);
  }, [activeOnly, cards]);

  return (
    <main className={styles.page}>
      <div className="page-container">
        <section className={styles.hero}>
          <div className={styles.heroTop}>
            <div>
              <p className={styles.kicker}>ZDT Realty Verified Sources</p>
              <h1 className={styles.title}>Government & Bank E-Auction Properties</h1>
              <p className={styles.subtitle}>
                Verified sources for seized properties listed under bank/government e-auctions.
              </p>
            </div>
          </div>

          <div className={styles.disclaimer} role="note">
            <strong>Disclaimer:</strong> ZDT Realty does not conduct auctions. We only redirect to
            official bank/government portals. Verify details before bidding.
          </div>
        </section>

        <section className={styles.controls}>
          <div className={styles.tabs} role="tablist" aria-label="E-Auction categories">
            {CATEGORY_TABS.map((tab) => {
              const active = tab.key === category;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`${styles.tabButton} ${active ? styles.tabButtonActive : ''}`}
                  onClick={() => setCategory(tab.key)}
                >
                  <span className={styles.tabLabel}>{tab.label}</span>
                  <span className={styles.tabSubtitle}>{tab.subtitle}</span>
                </button>
              );
            })}
          </div>

          <div className={styles.filters}>
            <div className={styles.searchWrap}>
              <Search className={styles.searchIcon} aria-hidden="true" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className={styles.searchInput}
                placeholder="Search by bank / organization name..."
                aria-label="Search sources"
              />
            </div>

            <label className={styles.selectWrap}>
              <span className={styles.selectLabel}>Sort</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className={styles.select}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(event) => setActiveOnly(event.target.checked)}
              />
              <span>Show only Active</span>
            </label>
          </div>
        </section>

        <section className={styles.results}>
          <div className={styles.resultsHeader}>
            <h2 className={styles.resultsTitle}>Official Sources</h2>
            <p className={styles.resultsMeta}>
              {isLoading ? 'Loading...' : `${filteredCards.length} source(s)`}
            </p>
          </div>

          {error ? (
            <div className={styles.error} role="alert">
              <p className={styles.errorTitle}>Could not load sources</p>
              <p className={styles.errorBody}>{error}</p>
              <button type="button" className={styles.retry} onClick={() => setReloadKey((prev) => prev + 1)}>
                Retry
              </button>
            </div>
          ) : null}

          {isLoading ? (
            <div className={styles.loading}>
              <Spinner className="h-5 w-5" />
              <span>Fetching official portals...</span>
            </div>
          ) : (
            <div className={styles.grid}>
              {filteredCards.map((card) => (
                <article key={card.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.logo} aria-hidden="true">
                      <Landmark className={styles.logoIcon} />
                    </div>
                    <div className={styles.cardHeading}>
                      <h3 className={styles.cardName}>{card.name}</h3>
                      <div className={styles.chips}>
                        <span className={styles.categoryChip}>
                          {category !== 'all' ? categoryChipLabel(category) : categoryChipLabel(card.category)}
                        </span>
                        {card.badges?.length ? (
                          <span className={styles.badgeCount}>{card.badges.length} badges</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {card.badges?.length ? (
                    <div className={styles.badges} aria-label="Badges">
                      {card.badges.slice(0, 6).map((badge) => (
                        <span key={`${card.id}-${badge}`} className={styles.badge}>
                          {badge}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <p className={styles.description}>{card.description}</p>

                  <div className={styles.actions}>
                    <a
                      className={styles.visitButton}
                      href={card.portalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => {
                        if (!isSafePortalUrl(card.portalUrl)) {
                          event.preventDefault();
                        }
                      }}
                    >
                      Visit Official Portal <ExternalLink className={styles.visitIcon} />
                    </a>
                    <button
                      type="button"
                      className={styles.howLink}
                      onClick={() => setHowItWorksOpen(true)}
                    >
                      How it works
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.steps}>
          <div className={styles.stepsHeader}>
            <h2 className={styles.stepsTitle}>Auction Steps</h2>
            <p className={styles.stepsSubtitle}>
              Follow these steps on the official portal you choose.
            </p>
          </div>

          <ol className={styles.stepsList}>
            {AUCTION_STEPS.map((step, index) => (
              <li key={step} className={styles.stepItem}>
                <span className={styles.stepNumber}>{index + 1}</span>
                <span className={styles.stepText}>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <Dialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>How e-auctions work (quick guide)</DialogTitle>
              <DialogDescription>
                Always read the official notice carefully and verify property documents before bidding.
              </DialogDescription>
            </DialogHeader>
            <div className={styles.modalBody}>
              <ol className={styles.modalSteps}>
                {AUCTION_STEPS.map((step) => (
                  <li key={`modal-${step}`}>{step}</li>
                ))}
              </ol>
              <p className={styles.modalLegal}>
                ZDT Realty does not conduct auctions. We only redirect to official portals.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
