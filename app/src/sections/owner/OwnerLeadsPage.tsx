import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, PhoneCall, Search, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface OwnerLeadsPageProps {
  onOpenDashboard: () => void;
  onOpenListings: () => void;
  onOpenRentals: () => void;
}

interface LeadItem {
  id: number;
  leadType: 'sale' | 'rent';
  message: string;
  status: 'new' | 'contacted' | 'closed';
  notes: string;
  createdAt: string;
  lead: { name?: string; email?: string; phone?: string };
  listing: { id: number; title: string; city: string; locality: string; image?: string };
}

interface LeadsResponse {
  leads: LeadItem[];
}

export default function OwnerLeadsPage({
  onOpenDashboard,
  onOpenListings,
  onOpenRentals,
}: OwnerLeadsPageProps) {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(true);

  const loadLeads = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (period !== 'all') params.set('period', period);
    apiRequest<LeadsResponse>(`/api/owner/leads?${params.toString()}`)
      .then((response) => setLeads(response.leads || []))
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLeads();
  }, [status, period]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return leads;
    return leads.filter((item) =>
      `${item.listing.title} ${item.listing.city} ${item.listing.locality} ${item.lead?.name}`
        .toLowerCase()
        .includes(text)
    );
  }, [leads, query]);

  const updateLead = async (lead: LeadItem, updates: { status?: string; notes?: string }) => {
    try {
      await apiRequest(`/api/owner/leads/${lead.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          leadType: lead.leadType,
          status: updates.status,
          notes: updates.notes,
        }),
      });
      toast.success('Lead updated');
      loadLeads();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update lead');
    }
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Owner Leads</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">Lead management</h1>
            <p className="mt-2 text-sm text-slate-600">Track calls, follow-ups, and conversions.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={onOpenDashboard}>
              Back to Dashboard
            </Button>
            <Button variant="outline" onClick={onOpenListings}>
              Sale Listings
            </Button>
            <Button variant="outline" onClick={onOpenRentals}>
              Rental Listings
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by listing, city, or lead name..."
                className="h-11 pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11 w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-11 w-[160px]">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This week</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Loading leads...
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No leads available for the selected filters.
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {filtered.map((lead) => (
                <div key={`${lead.leadType}-${lead.id}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{lead.listing.title}</p>
                      <p className="text-xs text-slate-500">
                        {lead.listing.locality || lead.listing.city} • {lead.leadType.toUpperCase()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {new Date(lead.createdAt).toLocaleDateString('en-IN')}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                    <div className="space-y-2 text-sm text-slate-600">
                      <p>{lead.message}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <UserCheck className="h-3.5 w-3.5" />
                          {lead.lead?.name || 'Guest lead'}
                        </span>
                        <span>{lead.lead?.email || 'no email'}</span>
                        <span>{lead.lead?.phone || 'no phone'}</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Status</span>
                        <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
                          {lead.status}
                        </span>
                      </div>
                      <Textarea
                        value={lead.notes || ''}
                        onChange={(event) => {
                          const next = event.target.value;
                          setLeads((prev) =>
                            prev.map((item) => (item.id === lead.id && item.leadType === lead.leadType ? { ...item, notes: next } : item))
                          );
                        }}
                        className="mt-3 min-h-20 text-xs"
                        placeholder="Add notes for follow-up..."
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateLead(lead, { status: 'contacted', notes: lead.notes })}
                        >
                          Mark Contacted
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateLead(lead, { status: 'closed', notes: lead.notes })}
                        >
                          Mark Closed
                        </Button>
                        <Button size="sm" className="bg-blue-700 text-white hover:bg-blue-800">
                          <PhoneCall className="mr-1 h-3.5 w-3.5" />
                          Call
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
