import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImagePlus, Plus, RefreshCcw, Search, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import { uploadImageFile } from '@/lib/mediaUploadApi';
import type { AuthUser } from '@/lib/session';
import {
  createMaterialItem,
  getBuildingMaterials,
  updateMaterialItemPhoto,
  type MaterialItem,
  type MaterialItemsResponse,
  type MaterialSort,
} from '@/lib/materialsApi';

interface BuildingMaterialsPageProps {
  token: string;
  user: AuthUser | null;
}

const OTHER_OPTION = '__other__';
const defaultCategoryOptions = [
  'Cement',
  'Steel',
  'Bricks and Blocks',
  'Sand and Aggregates',
  'Tiles and Flooring',
  'Electrical',
  'Plumbing',
  'Paint and Coatings',
  'Interior Fit-out',
  'Concrete',
  'Chemicals',
  'Doors and Windows',
];
const defaultBrandOptions = [
  'UltraTech',
  'ACC',
  'Tata Tiscon',
  'JSW',
  'Kajaria',
  'Somany',
  'Polycab',
  'Schneider',
  'Astral',
  'Supreme',
  'Asian Paints',
  'Berger',
  'Spacewood',
  'Saint-Gobain',
  'RMC India',
  'Dr Fixit',
  'Fenesta',
];

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

function formatPrice(value: number, unit: string) {
  return `INR ${Number(value || 0).toLocaleString('en-IN')} / ${unit}`;
}

function stockBadgeVariant(status: MaterialItem['stockStatus']) {
  if (status === 'in_stock') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (status === 'limited') {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-red-50 text-red-700 border-red-200';
}

function stockLabel(status: MaterialItem['stockStatus']) {
  if (status === 'in_stock') return 'In Stock';
  if (status === 'limited') return 'Limited';
  return 'Out of Stock';
}

function isInteriorCategory(category: string) {
  const normalized = category.trim().toLowerCase();
  return normalized.includes('interior');
}

export default function BuildingMaterialsPage({ token, user }: BuildingMaterialsPageProps) {
  const isMainAdmin = Boolean(token && user?.role === 'admin' && user?.isMainAdmin);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<MaterialItemsResponse | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [sort, setSort] = useState<MaterialSort>('featured');

  const [savingPhotoId, setSavingPhotoId] = useState('');
  const [creatingItem, setCreatingItem] = useState(false);
  const [categoryOption, setCategoryOption] = useState('');
  const [brandOption, setBrandOption] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [customBrand, setCustomBrand] = useState('');
  const [createForm, setCreateForm] = useState({
    itemName: '',
    category: '',
    brand: '',
    unit: '',
    unitPrice: '',
    minOrderQty: '1',
    deliveryDays: '2',
    locationCity: '',
    description: '',
    bulkSlab1: '',
    bulkSlab2: '',
    stockStatus: 'in_stock' as MaterialItem['stockStatus'],
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(searchInput.trim());
    }, 260);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadMaterials = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await getBuildingMaterials({
        q,
        category,
        city,
        sort,
        limit: 500,
      });
      setPayload(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load materials.');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [category, city, q, sort]);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  const handleSavePhoto = async (itemId: string, value: string) => {
    if (!isMainAdmin || !token) return;

    try {
      setSavingPhotoId(itemId);
      const response = await updateMaterialItemPhoto(token, itemId, value.trim());

      setPayload((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) => (item.id === itemId ? response.item : item)),
        };
      });

      toast.success(response.message);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Unable to update product photo.');
    } finally {
      setSavingPhotoId('');
    }
  };

  const handleUploadPhoto = async (itemId: string, file: File | null) => {
    if (!isMainAdmin || !token || !file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }

    try {
      setSavingPhotoId(itemId);
      const upload = await uploadImageFile(token, 'material', file, {
        maxSide: 1600,
        mimeType: 'image/webp',
        quality: 0.9,
      });
      const response = await updateMaterialItemPhoto(token, itemId, upload.imageUrl);
      setPayload((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) => (item.id === itemId ? response.item : item)),
        };
      });
      toast.success(response.message);
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : 'Unable to upload product photo.');
    } finally {
      setSavingPhotoId('');
    }
  };

  const handleCreateItem = async () => {
    if (!isMainAdmin || !token) return;

    const unitPrice = Number(createForm.unitPrice);
    const minOrderQty = Number(createForm.minOrderQty);
    const deliveryDays = Number(createForm.deliveryDays);

    if (!createForm.itemName.trim()) {
      toast.error('Product name is required.');
      return;
    }
    if (!createForm.category.trim()) {
      toast.error('Category is required.');
      return;
    }
    if (!createForm.brand.trim()) {
      toast.error('Brand is required.');
      return;
    }
    if (!createForm.unit.trim()) {
      toast.error('Unit is required.');
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      toast.error('Unit price must be greater than zero.');
      return;
    }
    if (!createForm.locationCity.trim()) {
      toast.error('City is required.');
      return;
    }
    if (!Number.isFinite(minOrderQty) || minOrderQty <= 0) {
      toast.error('Minimum order quantity must be at least 1.');
      return;
    }
    if (!Number.isFinite(deliveryDays) || deliveryDays < 0) {
      toast.error('Delivery days cannot be negative.');
      return;
    }

    try {
      setCreatingItem(true);
      const response = await createMaterialItem(token, {
        itemName: createForm.itemName.trim(),
        category: createForm.category.trim(),
        brand: createForm.brand.trim(),
        unit: createForm.unit.trim(),
        unitPrice,
        minOrderQty,
        deliveryDays,
        locationCity: createForm.locationCity.trim(),
        description: createForm.description.trim(),
        bulkSlab1: createForm.bulkSlab1.trim(),
        bulkSlab2: createForm.bulkSlab2.trim(),
        stockStatus: createForm.stockStatus,
      });

      toast.success(response.message);
      setCreateForm({
        itemName: '',
        category: '',
        brand: '',
        unit: '',
        unitPrice: '',
        minOrderQty: '1',
        deliveryDays: '2',
        locationCity: '',
        description: '',
        bulkSlab1: '',
        bulkSlab2: '',
        stockStatus: 'in_stock',
      });
      setCategoryOption('');
      setBrandOption('');
      setCustomCategory('');
      setCustomBrand('');
      await loadMaterials();
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Unable to add product.');
    } finally {
      setCreatingItem(false);
    }
  };

  const summary = useMemo(() => {
    const items = payload?.items || [];
    const inStock = items.filter((item) => item.stockStatus === 'in_stock').length;
    const interiorProducts = items.filter((item) => isInteriorCategory(item.category)).length;
    const withPhoto = items.filter((item) => Boolean(item.imageUrl)).length;
    return {
      totalItems: payload?.pagination.total || 0,
      inStock,
      interiorProducts,
      withPhoto,
    };
  }, [payload]);

  const items = payload?.items || [];
  const categoryOptions = useMemo(
    () =>
      Array.from(new Set([...(payload?.filters.categories || []), ...defaultCategoryOptions])).sort((a, b) =>
        a.localeCompare(b)
      ),
    [payload?.filters.categories]
  );
  const brandOptions = useMemo(
    () =>
      Array.from(new Set([...(payload?.filters.brands || []), ...defaultBrandOptions])).sort((a, b) =>
        a.localeCompare(b)
      ),
    [payload?.filters.brands]
  );

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="zdt-panel-hero rounded-3xl border p-6 text-slate-50 shadow-xl">
          <p className="text-xs uppercase tracking-[0.18em] text-blue-100/90">Building Materials</p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Product Catalog</h1>
          <p className="mt-2 text-sm text-blue-100/90">
            Product-only listing for construction and interior materials. Vendor details are hidden.
            Main Admin can add product photos.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-blue-100/90">
            <Badge variant="secondary" className="border-white/25 bg-white/15 text-white">
              Total products: {summary.totalItems}
            </Badge>
            <Badge variant="secondary" className="border-white/25 bg-white/15 text-white">
              In stock: {summary.inStock}
            </Badge>
            <Badge variant="secondary" className="border-white/25 bg-white/15 text-white">
              Interior products: {summary.interiorProducts}
            </Badge>
            <Badge variant="secondary" className="border-white/25 bg-white/15 text-white">
              Photos added: {summary.withPhoto}
            </Badge>
            <Badge variant="secondary" className="border-white/25 bg-white/15 text-white">
              Last updated: {formatDateTime(payload?.lastUpdated)}
            </Badge>
          </div>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative xl:col-span-2">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Search className="h-4 w-4 text-slate-500" />
              </div>
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search products"
                className="h-11 bg-white pl-10 text-slate-900 placeholder:text-slate-500 caret-slate-900"
              />
            </div>

            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              <option value="">All categories</option>
              {(payload?.filters.categories || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <LgdLocationInput
              value={city}
              onChange={setCity}
              placeholder="All cities"
              className="h-11 bg-white"
              suggestKind="india"
              indiaValueField="village"
            />

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as MaterialSort)}
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              <option value="featured">Featured</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="delivery_fast">Fastest Delivery</option>
            </select>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void loadMaterials()} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Badge variant="outline">Products shown: {items.length}</Badge>
            {isMainAdmin ? <Badge variant="outline">Main Admin photo edit enabled</Badge> : null}
          </div>
        </div>

        {isMainAdmin ? (
          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Main Admin Add Product
              </h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <Input
                value={createForm.itemName}
                onChange={(event) => setCreateForm((current) => ({ ...current, itemName: event.target.value }))}
                placeholder="Product name"
                className="h-10 bg-white xl:col-span-2"
              />
              <select
                value={categoryOption}
                onChange={(event) => {
                  const value = event.target.value;
                  setCategoryOption(value);
                  if (value === OTHER_OPTION) {
                    setCreateForm((current) => ({ ...current, category: customCategory }));
                    return;
                  }
                  setCustomCategory('');
                  setCreateForm((current) => ({ ...current, category: value }));
                }}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              >
                <option value="">Select category</option>
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                <option value={OTHER_OPTION}>Others</option>
              </select>
              {categoryOption === OTHER_OPTION ? (
                <Input
                  value={customCategory}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCustomCategory(value);
                    setCreateForm((current) => ({ ...current, category: value }));
                  }}
                  placeholder="Enter category"
                  className="h-10 bg-white"
                />
              ) : null}
              <select
                value={brandOption}
                onChange={(event) => {
                  const value = event.target.value;
                  setBrandOption(value);
                  if (value === OTHER_OPTION) {
                    setCreateForm((current) => ({ ...current, brand: customBrand }));
                    return;
                  }
                  setCustomBrand('');
                  setCreateForm((current) => ({ ...current, brand: value }));
                }}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              >
                <option value="">Select brand</option>
                {brandOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                <option value={OTHER_OPTION}>Others</option>
              </select>
              {brandOption === OTHER_OPTION ? (
                <Input
                  value={customBrand}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCustomBrand(value);
                    setCreateForm((current) => ({ ...current, brand: value }));
                  }}
                  placeholder="Enter brand"
                  className="h-10 bg-white"
                />
              ) : null}
              <Input
                value={createForm.unit}
                onChange={(event) => setCreateForm((current) => ({ ...current, unit: event.target.value }))}
                placeholder="Unit (e.g. 50kg bag)"
                className="h-10 bg-white"
              />
              <Input
                value={createForm.unitPrice}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, unitPrice: event.target.value.replace(/[^0-9.]/g, '') }))
                }
                placeholder="Unit price"
                className="h-10 bg-white"
              />
              <LgdLocationInput
                value={createForm.locationCity}
                onChange={(value) => setCreateForm((current) => ({ ...current, locationCity: value }))}
                placeholder="City"
                className="h-10 bg-white"
                suggestKind="india"
                indiaValueField="village"
              />
              <div className="md:col-span-2">
                <LgdLocationAccuracyNote />
              </div>
              <Input
                value={createForm.minOrderQty}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, minOrderQty: event.target.value.replace(/[^0-9]/g, '') }))
                }
                placeholder="MOQ"
                className="h-10 bg-white"
              />
              <Input
                value={createForm.deliveryDays}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, deliveryDays: event.target.value.replace(/[^0-9]/g, '') }))
                }
                placeholder="Delivery days"
                className="h-10 bg-white"
              />
              <select
                value={createForm.stockStatus}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    stockStatus: event.target.value as MaterialItem['stockStatus'],
                  }))
                }
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              >
                <option value="in_stock">In Stock</option>
                <option value="limited">Limited</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
              <Input
                value={createForm.bulkSlab1}
                onChange={(event) => setCreateForm((current) => ({ ...current, bulkSlab1: event.target.value }))}
                placeholder="Bulk slab 1"
                className="h-10 bg-white"
              />
              <Input
                value={createForm.bulkSlab2}
                onChange={(event) => setCreateForm((current) => ({ ...current, bulkSlab2: event.target.value }))}
                placeholder="Bulk slab 2"
                className="h-10 bg-white"
              />
              <Input
                value={createForm.description}
                onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Description"
                className="h-10 bg-white xl:col-span-2"
              />
            </div>
            <div className="mt-3">
              <Button onClick={() => void handleCreateItem()} disabled={creatingItem}>
                <Plus className="mr-2 h-4 w-4" />
                {creatingItem ? 'Adding...' : 'Add Product'}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={`material-skeleton-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <Skeleton className="h-44 w-full rounded-xl" />
                <Skeleton className="mt-3 h-4 w-1/3" />
                <Skeleton className="mt-2 h-6 w-5/6" />
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-4 h-20 w-full" />
              </div>
            ))}
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            No products found for the selected filters.
          </div>
        ) : null}

        {!loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              return (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  {item.imageUrl ? (
                    <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                      <img
                        src={item.imageUrl}
                        alt={item.itemName}
                        className="h-44 w-full object-cover"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-500">
                      <ImagePlus className="mb-2 h-5 w-5" />
                      Photo not added
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{item.category}</Badge>
                    <Badge className={`border ${stockBadgeVariant(item.stockStatus)}`}>{stockLabel(item.stockStatus)}</Badge>
                    <Badge variant="outline">{item.locationCity}</Badge>
                  </div>

                  <h2 className="mt-3 text-base font-semibold text-slate-900">{item.itemName}</h2>
                  <p className="mt-1 text-xs text-slate-500">Brand: {item.brand}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.description}</p>

                  <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-600">Unit Price</span>
                      <span className="font-semibold text-slate-900">{formatPrice(item.unitPrice, item.unit)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-600">Minimum Order</span>
                      <span className="font-medium text-slate-900">{item.minOrderQty}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-600">Delivery</span>
                      <span className="inline-flex items-center gap-1 font-medium text-slate-900">
                        <Truck className="h-3.5 w-3.5" />
                        {item.deliveryDays} day{item.deliveryDays === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <p>{item.bulkSlab1 || 'Bulk slab not available'}</p>
                    <p>{item.bulkSlab2 || 'Bulk slab not available'}</p>
                  </div>

                  {isMainAdmin ? (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Main Admin Photo Control
                      </p>
                      <Input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          event.target.value = '';
                          void handleUploadPhoto(item.id, file);
                        }}
                        className="h-9 bg-white text-xs"
                      />
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleSavePhoto(item.id, '')}
                          disabled={savingPhotoId === item.id}
                        >
                          {savingPhotoId === item.id ? 'Updating...' : 'Remove'}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
