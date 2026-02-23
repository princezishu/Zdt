import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  createAdminPromotion,
  deleteAdminPromotion,
  getAdminPromotions,
  updateAdminPromotion,
  type PromotionItem,
  type PromotionType,
} from '@/lib/promotionsApi';
import { uploadImageFile } from '@/lib/mediaUploadApi';
import type { AuthUser } from '@/lib/session';

interface MainAdminPromotionsPanelProps {
  token: string;
  user: AuthUser | null;
  onActionMessage?: (message: string) => void;
  onActionError?: (message: string) => void;
}

type PromotionFilter = 'all' | PromotionType;

interface PromotionFormState {
  promoType: PromotionType;
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  propertyReference: string;
  ctaLabel: string;
  badgeText: string;
  openInNewTab: boolean;
  isActive: boolean;
  sortOrder: string;
  startAt: string;
  endAt: string;
}

const typeLabels: Record<PromotionType, string> = {
  sponsored_banner: 'Sponsored Banner',
  popup_ad: 'Popup Ad',
  top_property: 'Top Listed Property',
};

const initialFormState: PromotionFormState = {
  promoType: 'sponsored_banner',
  title: '',
  subtitle: '',
  description: '',
  imageUrl: '',
  linkUrl: '',
  propertyReference: '',
  ctaLabel: '',
  badgeText: '',
  openInNewTab: true,
  isActive: true,
  sortOrder: '100',
  startAt: '',
  endAt: '',
};

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (num: number) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoOrNull(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MainAdminPromotionsPanel({
  token,
  user,
  onActionMessage,
  onActionError,
}: MainAdminPromotionsPanelProps) {
  const isAdmin = Boolean(token && user?.role === 'admin');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState<PromotionItem[]>([]);
  const [filterType, setFilterType] = useState<PromotionFilter>('all');
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState<PromotionFormState>(initialFormState);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<PromotionItem | null>(null);

  const filteredItems = useMemo(() => {
    if (filterType === 'all') return items;
    return items.filter((item) => item.promoType === filterType);
  }, [filterType, items]);

  const loadPromotions = useCallback(async () => {
    if (!isAdmin) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await getAdminPromotions(token, {
        includeInactive: true,
        limit: 400,
      });
      setItems(response.items || []);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load promotions.';
      setError(message);
      onActionError?.(message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, onActionError, token]);

  useEffect(() => {
    void loadPromotions();
  }, [loadPromotions]);

  const resetForm = () => {
    setEditingId('');
    setForm(initialFormState);
  };

  const startEdit = (item: PromotionItem) => {
    setEditingId(item.id);
    setForm({
      promoType: item.promoType,
      title: item.title || '',
      subtitle: item.subtitle || '',
      description: item.description || '',
      imageUrl: item.imageUrl || '',
      linkUrl: item.linkUrl || '',
      propertyReference: item.propertyReference || '',
      ctaLabel: item.ctaLabel || '',
      badgeText: item.badgeText || '',
      openInNewTab: item.openInNewTab,
      isActive: item.isActive,
      sortOrder: String(item.sortOrder || 100),
      startAt: toDateTimeLocal(item.startAt),
      endAt: toDateTimeLocal(item.endAt),
    });
  };

  const submitForm = async () => {
    if (!isAdmin) return;

    const title = form.title.trim();
    if (title.length < 2) {
      const message = 'Title must be at least 2 characters.';
      setError(message);
      onActionError?.(message);
      return;
    }

    const sortOrderNum = Number(form.sortOrder || '0');
    if (!Number.isFinite(sortOrderNum) || sortOrderNum < 0) {
      const message = 'Sort order must be a non-negative number.';
      setError(message);
      onActionError?.(message);
      return;
    }

    if (form.promoType === 'top_property' && !form.propertyReference.trim()) {
      const message = 'Top Listed Property promotions require a Property Reference ID.';
      setError(message);
      onActionError?.(message);
      return;
    }

    const startAtIso = toIsoOrNull(form.startAt);
    const endAtIso = toIsoOrNull(form.endAt);
    if (form.startAt.trim() && !startAtIso) {
      const message = 'Invalid start date/time.';
      setError(message);
      onActionError?.(message);
      return;
    }
    if (form.endAt.trim() && !endAtIso) {
      const message = 'Invalid end date/time.';
      setError(message);
      onActionError?.(message);
      return;
    }
    if (startAtIso && endAtIso && new Date(startAtIso).getTime() > new Date(endAtIso).getTime()) {
      const message = 'Start date/time cannot be after end date/time.';
      setError(message);
      onActionError?.(message);
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = {
        promoType: form.promoType,
        title,
        subtitle: form.subtitle.trim(),
        description: form.description.trim(),
        imageUrl: form.imageUrl.trim(),
        linkUrl: form.linkUrl.trim(),
        propertyReference: form.propertyReference.trim(),
        ctaLabel: form.ctaLabel.trim(),
        badgeText: form.badgeText.trim(),
        openInNewTab: form.openInNewTab,
        isActive: form.isActive,
        sortOrder: sortOrderNum,
        startAt: startAtIso,
        endAt: endAtIso,
      };

      if (editingId) {
        const response = await updateAdminPromotion(token, editingId, payload);
        onActionMessage?.(response.message);
      } else {
        const response = await createAdminPromotion(token, payload);
        onActionMessage?.(response.message);
      }

      resetForm();
      await loadPromotions();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to save promotion.';
      setError(message);
      onActionError?.(message);
    } finally {
      setSaving(false);
    }
  };

  const togglePromotionActive = async (item: PromotionItem) => {
    if (!isAdmin) return;
    try {
      setSaving(true);
      setError('');
      const response = await updateAdminPromotion(token, item.id, {
        isActive: !item.isActive,
      });
      onActionMessage?.(response.message);
      await loadPromotions();
    } catch (toggleError) {
      const message = toggleError instanceof Error ? toggleError.message : 'Unable to update promotion status.';
      setError(message);
      onActionError?.(message);
    } finally {
      setSaving(false);
    }
  };

  const removePromotion = (item: PromotionItem) => {
    if (!isAdmin) return;
    setPendingDeleteItem(item);
  };

  const confirmRemovePromotion = async () => {
    if (!isAdmin || !pendingDeleteItem) return;

    try {
      setDeletingId(pendingDeleteItem.id);
      setError('');
      const response = await deleteAdminPromotion(token, pendingDeleteItem.id);
      onActionMessage?.(response.message);
      setPendingDeleteItem(null);
      await loadPromotions();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Unable to remove promotion.';
      setError(message);
      onActionError?.(message);
    } finally {
      setDeletingId('');
    }
  };

  const handleImageSelection = async (file: File | null) => {
    if (!isAdmin || !token || !file) return;

    try {
      setUploadingImage(true);
      setError('');
      const response = await uploadImageFile(token, 'promotion', file, {
        maxSide: 1920,
        mimeType: 'image/webp',
        quality: 0.9,
      });
      setForm((current) => ({ ...current, imageUrl: response.imageUrl }));
      onActionMessage?.('Promotion image uploaded.');
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Unable to upload promotion image.';
      setError(message);
      onActionError?.(message);
    } finally {
      setUploadingImage(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <section className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Admin Promotions</h2>
          <p className="text-sm text-slate-600">
            Control sponsored banners, popup ads, and top listed properties on website.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={(event) => setFilterType(event.target.value as PromotionFilter)}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">All Types</option>
            <option value="sponsored_banner">Sponsored Banner</option>
            <option value="popup_ad">Popup Ad</option>
            <option value="top_property">Top Listed Property</option>
          </select>
          <Button variant="outline" onClick={() => void loadPromotions()} disabled={loading || saving}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-900">
          {editingId ? 'Edit Promotion' : 'Create Promotion'}
        </p>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <select
            value={form.promoType}
            onChange={(event) =>
              setForm((current) => ({ ...current, promoType: event.target.value as PromotionType }))
            }
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="sponsored_banner">Sponsored Banner</option>
            <option value="popup_ad">Popup Ad</option>
            <option value="top_property">Top Listed Property</option>
          </select>
          <Input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Title"
            className="h-10 bg-white"
          />
          <Input
            value={form.subtitle}
            onChange={(event) => setForm((current) => ({ ...current, subtitle: event.target.value }))}
            placeholder="Subtitle"
            className="h-10 bg-white"
          />
          <Input
            value={form.badgeText}
            onChange={(event) => setForm((current) => ({ ...current, badgeText: event.target.value }))}
            placeholder="Badge text (optional)"
            className="h-10 bg-white"
          />
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              event.target.value = '';
              void handleImageSelection(file);
            }}
            className="h-10 bg-white xl:col-span-2"
          />
          <Input
            value={form.linkUrl}
            onChange={(event) => setForm((current) => ({ ...current, linkUrl: event.target.value }))}
            placeholder="Link URL (optional)"
            className="h-10 bg-white xl:col-span-2"
          />
          <Input
            value={form.propertyReference}
            onChange={(event) =>
              setForm((current) => ({ ...current, propertyReference: event.target.value }))
            }
            placeholder="Reference ID (e.g. ZDT-BUY-101 or PROJECT-12)"
            className="h-10 bg-white xl:col-span-2"
          />
          <Input
            value={form.ctaLabel}
            onChange={(event) => setForm((current) => ({ ...current, ctaLabel: event.target.value }))}
            placeholder="CTA label (optional)"
            className="h-10 bg-white xl:col-span-2"
          />
          <Input
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Description (optional)"
            className="h-10 bg-white xl:col-span-4"
          />
          <Input
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
            placeholder="Sort order"
            className="h-10 bg-white"
          />
          <Input
            type="datetime-local"
            value={form.startAt}
            onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))}
            className="h-10 bg-white"
          />
          <Input
            type="datetime-local"
            value={form.endAt}
            onChange={(event) => setForm((current) => ({ ...current, endAt: event.target.value }))}
            className="h-10 bg-white"
          />
          <select
            value={form.openInNewTab ? 'yes' : 'no'}
            onChange={(event) =>
              setForm((current) => ({ ...current, openInNewTab: event.target.value === 'yes' }))
            }
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="yes">Open link in new tab</option>
            <option value="no">Open link in same tab</option>
          </select>
          <select
            value={form.isActive ? 'yes' : 'no'}
            onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === 'yes' }))}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="yes">Active</option>
            <option value="no">Inactive</option>
          </select>
        </div>

        {form.imageUrl ? (
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <div className="relative h-40 overflow-hidden rounded-lg bg-slate-100">
              <img src={form.imageUrl} alt="Promotion preview" className="h-full w-full object-cover" />
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm((current) => ({ ...current, imageUrl: '' }))}
                disabled={uploadingImage}
              >
                Remove Image
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void submitForm()} disabled={saving || uploadingImage}>
            <Plus className="mr-2 h-4 w-4" />
            {uploadingImage
              ? 'Uploading image...'
              : saving
                ? 'Saving...'
                : editingId
                  ? 'Update Promotion'
                  : 'Add Promotion'}
          </Button>
          <Button variant="outline" onClick={resetForm} disabled={saving}>
            Clear
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Tip: for Construct With Us project highlights, set Top Listed Property reference as
          <span className="font-semibold"> PROJECT-&lt;id&gt; </span>
          (example: <span className="font-semibold">PROJECT-12</span>).
        </p>
      </div>

      {loading ? <p className="text-sm text-slate-600">Loading promotions...</p> : null}

      {!loading && filteredItems.length === 0 ? (
        <p className="text-sm text-slate-600">No promotions found for selected filter.</p>
      ) : null}

      {!loading && filteredItems.length > 0 ? (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-600">
                    {typeLabels[item.promoType]} | Sort: {item.sortOrder} | {item.isActive ? 'Active' : 'Inactive'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => startEdit(item)} disabled={saving}>
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void togglePromotionActive(item)}
                    disabled={saving}
                  >
                    {item.isActive ? 'Mark Inactive' : 'Mark Active'}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void removePromotion(item)}
                    disabled={deletingId === item.id}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {deletingId === item.id ? 'Removing...' : 'Remove'}
                  </Button>
                </div>
              </div>

              <p className="text-sm text-slate-700">{item.subtitle || item.description || '-'}</p>

              <div className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                <p>Property Ref: {item.propertyReference || '-'}</p>
                <p>CTA: {item.ctaLabel || '-'}</p>
                <p>Badge: {item.badgeText || '-'}</p>
                <p>Start: {formatDateTime(item.startAt)}</p>
                <p>End: {formatDateTime(item.endAt)}</p>
                <p>Updated: {formatDateTime(item.updatedAt)}</p>
              </div>

              {item.linkUrl ? (
                <a
                  href={item.linkUrl}
                  target={item.openInNewTab ? '_blank' : '_self'}
                  rel="noreferrer"
                  className="inline-flex text-xs font-semibold text-blue-700 underline"
                >
                  Open promotion link
                </a>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      <AlertDialog
        open={Boolean(pendingDeleteItem)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteItem(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Promotion?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteItem
                ? `This will remove "${pendingDeleteItem.title}" from promotions.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRemovePromotion()} disabled={Boolean(deletingId)}>
              {deletingId ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
