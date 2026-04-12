import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import {
  deleteInfraSubscription,
  getInfraSubscriptions,
  type InfraSubscriptionChannel,
  type InfraSubscriptionItem,
} from '@/lib/infraSubscriptionsApi';

const CHANNEL_OPTIONS: Array<{ key: InfraSubscriptionChannel | ''; label: string }> = [
  { key: '', label: 'All' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'EMAIL', label: 'Email' },
];

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

export default function AdminInfraSubscribersPage() {
  const [adminToken, setAdminToken] = useState('session');
  const [stateName, setStateName] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [channel, setChannel] = useState<InfraSubscriptionChannel | ''>('');
  const [query, setQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const [items, setItems] = useState<InfraSubscriptionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const requestQuery = useMemo(
    () => ({
      state: stateName.trim() || undefined,
      district: district.trim() || undefined,
      city: city.trim() || undefined,
      channel,
      q: query.trim() || undefined,
      includeInactive,
    }),
    [channel, city, district, includeInactive, query, stateName]
  );

  const load = async () => {
    setError('');
    setMessage('');

    if (!adminToken.trim()) {
      setItems([]);
      return;
    }

    try {
      setLoading(true);
      const response = await getInfraSubscriptions(requestQuery, adminToken.trim());
      setItems(Array.isArray(response.items) ? response.items : []);
    } catch (requestError) {
      setItems([]);
      setError(requestError instanceof Error ? requestError.message : 'Could not load subscribers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken, requestQuery]);

  const copyContacts = async () => {
    setError('');
    setMessage('');
    if (items.length === 0) {
      setError('No subscribers to copy.');
      return;
    }

    try {
      const text = items.map((item) => item.contact).join('\n');
      await navigator.clipboard.writeText(text);
      setMessage('Copied contacts to clipboard.');
    } catch {
      setError('Could not copy contacts automatically.');
    }
  };

  const deleteSubscriber = async (id: number) => {
    setError('');
    setMessage('');

    

    const confirmed = window.confirm('Delete this subscriber? This cannot be undone.');
    if (!confirmed) return;

    try {
      await deleteInfraSubscription(id, adminToken.trim());
      setMessage('Deleted subscriber.');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not delete subscriber.');
    }
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold sm:text-3xl">Admin: Infrastructure Subscribers</h1>
          <p className="mt-2 text-sm text-slate-600">
            Read-only listing for outreach operations. Use only for infrastructure updates.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-1 xl:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Admin Session
              </p>
              <Input
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                type="password"
                placeholder="Admin session is active"
                className="h-11 bg-white"
              />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">State</p>
              <LgdLocationInput
                value={stateName}
                onChange={setStateName}
                placeholder="All"
                className="h-11 bg-white"
                suggestKind="state"
                indiaValueField="state"
              />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">District</p>
              <LgdLocationInput
                value={district}
                onChange={setDistrict}
                placeholder="All"
                className="h-11 bg-white"
                suggestKind="india"
                indiaValueField="district"
              />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">City</p>
              <LgdLocationInput
                value={city}
                onChange={setCity}
                placeholder="All"
                className="h-11 bg-white"
                suggestKind="india"
                indiaValueField="village"
              />
            </label>
          </div>
          <LgdLocationAccuracyNote className="mt-2" />

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Channel</p>
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value as InfraSubscriptionChannel | '')}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
              >
                {CHANNEL_OPTIONS.map((option) => (
                  <option key={option.key || 'all'} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 xl:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Search (contact contains)
              </p>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try: +91, gmail, etc."
                className="h-11 bg-white"
              />
            </label>

            <label className="flex items-end gap-2 text-sm text-slate-700">
              <input
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
                type="checkbox"
                className="h-4 w-4"
              />
              Include inactive
            </label>

            <div className="flex items-end gap-2 xl:col-span-1">
              <Button type="button" variant="outline" className="h-11 rounded-xl px-4" onClick={() => void load()}>
                Refresh
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="h-10 rounded-xl px-4" onClick={copyContacts}>
              Copy contacts
            </Button>
            {error ? (
              <p className="inline-flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="inline-flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">
            Total subscribers shown: <strong>{items.length}</strong>
          </div>

          {loading ? <p className="mt-3 text-sm text-slate-500">Loading...</p> : null}

          {!loading ? (
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">ID</th>
                    <th className="px-3 py-2 font-semibold">State</th>
                    <th className="px-3 py-2 font-semibold">District</th>
                    <th className="px-3 py-2 font-semibold">City</th>
                    <th className="px-3 py-2 font-semibold">Channel</th>
                    <th className="px-3 py-2 font-semibold">Contact</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Created</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{item.id}</td>
                      <td className="px-3 py-2">{item.state}</td>
                      <td className="px-3 py-2">{item.district}</td>
                      <td className="px-3 py-2">{item.city}</td>
                      <td className="px-3 py-2">{item.channel}</td>
                      <td className="px-3 py-2 break-all">{item.contact}</td>
                      <td className="px-3 py-2">{item.isActive ? 'ACTIVE' : 'INACTIVE'}</td>
                      <td className="px-3 py-2">{formatDateTime(item.createdAt)}</td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 rounded-lg px-3 text-xs"
                          onClick={() => void deleteSubscriber(item.id)}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {items.length === 0 ? (
                <p className="border-t border-slate-100 px-3 py-3 text-sm text-slate-500">
                  No subscribers found for this filter.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className="text-xs text-slate-500">
          Privacy note: Use subscriber contacts only for infrastructure alerts. Honor removal requests promptly.
        </p>
      </div>
    </section>
  );
}

