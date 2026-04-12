import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  ShoppingCart,
  Truck,
  Package,
  Star,
  Plus,
  ImagePlus,
  X,
  Loader2,
  AlertCircle,
  Zap,
  Droplets,
  TreePine,
  Hammer,
  Wrench,
  BrickWall,
  Blocks,
  Paintbrush,
  Layers,
  ArrowRight,
  BadgePercent,
  ShieldCheck,
  Clock,
  Heart,
  Share2,
  ChevronLeft,
  ChevronRight,
  Tag,
  Minus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  quoteMaterialDelivery,
  type MaterialDeliveryQuote,
} from '@/lib/materialDelivery';
import {
  calculateDalalCoinPreview,
  getDalalCoinWallet,
  type DalalCoinWalletSummary,
} from '@/lib/dalalCoinApi';
import { uploadImageFile } from '@/lib/mediaUploadApi';
import {
  createMaterialsCheckout,
  getBuildingMaterials,
  verifyMaterialsCheckout,
  createMaterialItem,
  updateMaterialItemPhoto,
  type MaterialItem,
  type MaterialSort,
  type CreateMaterialItemPayload,
} from '@/lib/materialsApi';
import {
  openRazorpayCheckout,
  RazorpayCheckoutCancelledError,
} from '@/lib/razorpayCheckout';
import type { AuthUser } from '@/lib/session';

/* ------------------------------------------------------------------ */
/*  Props & constants                                                  */
/* ------------------------------------------------------------------ */

interface MaterialsCatalogProps {
  token: string;
  user: AuthUser | null;
}

const CATEGORY_NAV: { key: string; label: string; icon: typeof Package }[] = [
  { key: '', label: 'All', icon: Layers },
  { key: 'Cement', label: 'Cement', icon: Blocks },
  { key: 'Steel', label: 'Steel', icon: Layers },
  { key: 'Bricks', label: 'Bricks', icon: BrickWall },
  { key: 'Sand', label: 'Sand', icon: TreePine },
  { key: 'Tiles', label: 'Tiles', icon: Paintbrush },
  { key: 'Electrical', label: 'Electrical', icon: Zap },
  { key: 'Plumbing', label: 'Plumbing', icon: Droplets },
  { key: 'Paint', label: 'Paint', icon: Paintbrush },
  { key: 'Wood', label: 'Wood', icon: TreePine },
  { key: 'Hardware', label: 'Hardware', icon: Wrench },
  { key: 'Tools', label: 'Tools', icon: Hammer },
];

function getCategoryIcon(category: string) {
  const found = CATEGORY_NAV.find((c) => category.toLowerCase().includes(c.key.toLowerCase()) && c.key);
  return found?.icon || Package;
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(price);
}

function fakeOriginalPrice(price: number) {
  const markup = 1 + (0.08 + Math.random() * 0.17);
  return Math.round(price * markup);
}

function calcDiscount(original: number, current: number) {
  return Math.round(((original - current) / original) * 100);
}

function stockInfo(status: string) {
  if (status === 'in_stock') return { label: 'In Stock', color: 'text-green-600', dot: 'bg-green-500' };
  if (status === 'limited') return { label: 'Only Few Left', color: 'text-orange-600', dot: 'bg-orange-500' };
  return { label: 'Out of Stock', color: 'text-red-600', dot: 'bg-red-500' };
}

interface CartItem {
  item: MaterialItem;
  qty: number;
}

interface CheckoutContactForm {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  shippingCity: string;
  shippingAddress: string;
  notes: string;
}

const SORT_OPTIONS: { value: MaterialSort; label: string }[] = [
  { value: 'featured', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'delivery_fast', label: 'Delivery Speed' },
];

const WHATSAPP_NUMBER = '917676815237';

function getMinimumOrderQty(item: MaterialItem) {
  return Math.max(1, Number(item.minOrderQty || 1));
}

function getOrderQty(item: MaterialItem, qty = 1) {
  return Math.max(getMinimumOrderQty(item), Math.round(Number(qty || 1)));
}

function getLineSubtotal(item: MaterialItem, qty = 1) {
  return item.unitPrice * getOrderQty(item, qty);
}

function getItemDeliveryQuote(
  item: MaterialItem,
  distanceKm: number,
  qty = 1,
  applyPromotions = true
) {
  return quoteMaterialDelivery({
    category: item.category,
    distanceKm,
    orderSubtotal: getLineSubtotal(item, qty),
    quantity: getOrderQty(item, qty),
    applyPromotions,
  });
}

function deliveryTimelineLabel(deliveryDays: number) {
  if (deliveryDays === 0) {
    return 'Same-day dispatch available';
  }
  return `ETA ${deliveryDays} day${deliveryDays > 1 ? 's' : ''}`;
}

function deliveryHeadline(quote: MaterialDeliveryQuote) {
  if (quote.finalCharge === 0) {
    return 'FREE delivery';
  }
  if (quote.capApplied) {
    return `₹${formatPrice(quote.finalCharge)} capped delivery`;
  }
  if (quote.bulkDiscountApplied) {
    return `₹${formatPrice(quote.finalCharge)} discounted delivery`;
  }
  return `₹${formatPrice(quote.finalCharge)} delivery`;
}

function formatOfferLabel(label: string | null) {
  return label ? label.replace(/Rs /g, '₹') : null;
}

function buildWhatsAppUrl(item: MaterialItem, distanceKm: number) {
  const qty = getOrderQty(item);
  const subtotal = getLineSubtotal(item, qty);
  const quote = getItemDeliveryQuote(item, distanceKm, qty);
  const deliveryLines = [
    `🚚 Delivery estimate: ${quote.finalCharge === 0 ? 'FREE' : '₹' + formatPrice(quote.finalCharge)}`,
    `📏 Distance: ${quote.distanceKm} km`,
    `📦 Delivery type: ${quote.tierLabel}`,
    `⏱️ ${deliveryTimelineLabel(item.deliveryDays)}`,
  ];
  if (quote.capApplied) {
    deliveryLines.push(`💸 Actual cost ₹${formatPrice(quote.rawCharge)} -> You pay ₹${formatPrice(quote.finalCharge)} (Capped)`);
  }
  if (quote.offerLabel) {
    deliveryLines.push(`🎁 ${formatOfferLabel(quote.offerLabel)}`);
  }
  const text = encodeURIComponent(
    `Hi, I want to order:\n\n📦 *${item.itemName}*\n🏷️ Code: ${item.itemCode}\n💰 Price: ₹${formatPrice(item.unitPrice)}/${item.unit}\n📐 Minimum order: ${qty} ${item.unit}${qty > 1 ? 's' : ''}\n🧾 Product total: ₹${formatPrice(subtotal)}\n📍 Dispatch city: ${item.locationCity}\n${deliveryLines.join('\n')}\n\nPlease confirm availability and delivery.`
  );
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}

function buildCartWhatsAppUrl(
  cartItems: CartItem[],
  _distanceKm: number,
  cartDelivery: number,
  cartSubtotal: number,
  cartTotal: number,
  cartOfferLabel: string | null,
  dalalCoinSummary?: {
    orderReference?: string;
    coinsUsed?: number;
    discountValue?: number;
    finalMaterialsAmount?: number;
  }
) {
  const lines = cartItems.map((ci, i) => {
    const qty = getOrderQty(ci.item, ci.qty);
    return `${i + 1}. ${ci.item.itemName} (${ci.item.itemCode}) x ${qty} ${ci.item.unit}${qty > 1 ? 's' : ''} = ₹${formatPrice(ci.item.unitPrice * qty)}`;
  });
  const dalalCoinLines = dalalCoinSummary
    ? [
        dalalCoinSummary.orderReference ? `🪙 Dalal Coin order: ${dalalCoinSummary.orderReference}` : '',
        dalalCoinSummary.coinsUsed ? `🪙 Coins used: ${dalalCoinSummary.coinsUsed} DC` : '',
        dalalCoinSummary.discountValue ? `💸 Coin discount: ₹${formatPrice(dalalCoinSummary.discountValue)}` : '',
        dalalCoinSummary.finalMaterialsAmount !== undefined
          ? `🧱 Materials after coins: ₹${formatPrice(dalalCoinSummary.finalMaterialsAmount)}`
          : '',
      ].filter(Boolean)
    : [];
  const text = encodeURIComponent(
    `Hi, I want to place a bulk order:\n\n${lines.join('\n')}\n\n📏 Delivery distance: ${_distanceKm} km\n💰 Subtotal: ₹${formatPrice(cartSubtotal)}\n🚚 Delivery: ${cartDelivery === 0 ? 'FREE' : '₹' + formatPrice(cartDelivery)}${cartOfferLabel ? `\n🎁 ${cartOfferLabel}` : ''}${dalalCoinLines.length ? `\n${dalalCoinLines.join('\n')}` : ''}\n🧾 Total: ₹${formatPrice(cartTotal)}\n\nPlease confirm availability.`
  );
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}

function calculateCartDeliveryAmount(subtotal: number, totalUnits: number) {
  if (subtotal >= 20000) {
    return 0;
  }
  return Math.min(1500, Math.max(250, totalUnits * 75));
}

const EMPTY_FORM: CreateMaterialItemPayload = {
  itemName: '', category: '', brand: '', unit: 'Bag',
  unitPrice: 0, minOrderQty: 1, deliveryDays: 2,
  locationCity: '', description: '', bulkSlab1: '', bulkSlab2: '',
  stockStatus: 'in_stock',
};

const DEALS_BANNERS = [
  { bg: 'from-orange-500 to-red-500', title: '🔥 Mega Deals on Cement', sub: 'Up to 15% off on bulk orders • Free delivery', cta: 'Shop Now' },
  { bg: 'from-blue-600 to-indigo-600', title: '🏗️ Steel at Factory Price', sub: 'TMT Bars, Channels & Angles • Direct from manufacturer', cta: 'View Deals' },
  { bg: 'from-emerald-600 to-teal-600', title: '🎨 Paint Season Sale', sub: 'Premium paints starting ₹150/litre • All brands', cta: 'Explore' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MaterialsCatalog({ token, user }: MaterialsCatalogProps) {
  const isAdmin = Boolean(token && user?.role === 'admin' && user?.isMainAdmin);
  const canAddMaterial = Boolean(token && (isAdmin || user?.role === 'admin'));

  const [items, setItems] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [sortBy, setSortBy] = useState<MaterialSort>('featured');
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState(8);
  const [categories, setCategories] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedItem, setSelectedItem] = useState<MaterialItem | null>(null);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [wallet, setWallet] = useState<DalalCoinWalletSummary | null>(null);
  const [dalalCoinsToUse, setDalalCoinsToUse] = useState('');
  const [dalalCheckoutSubmitting, setDalalCheckoutSubmitting] = useState(false);
  const [checkoutContact, setCheckoutContact] = useState<CheckoutContactForm>({
    contactName: user?.name || '',
    contactPhone: user?.phone || '',
    contactEmail: user?.email || '',
    shippingCity: '',
    shippingAddress: '',
    notes: '',
  });

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const cartCount = cart.reduce((s, ci) => s + ci.qty, 0);
  const normalizedDeliveryDistanceKm = Math.max(0, Math.round(deliveryDistanceKm));
  const cartLineQuotes = useMemo(
    () =>
      cart.map((ci) => ({
        ...ci,
        qty: getOrderQty(ci.item, ci.qty),
        quote: getItemDeliveryQuote(ci.item, normalizedDeliveryDistanceKm, ci.qty, false),
      })),
    [cart, normalizedDeliveryDistanceKm]
  );
  const cartSubtotal = cartLineQuotes.reduce((sum, entry) => sum + entry.item.unitPrice * entry.qty, 0);
  const cartTotalUnits = cartLineQuotes.reduce((sum, entry) => sum + entry.qty, 0);
  const cartDelivery = calculateCartDeliveryAmount(cartSubtotal, cartTotalUnits);
  const cartOfferLabel =
    cartDelivery === 0
      ? 'Free delivery unlocked on orders above ₹20,000.'
      : `Order delivery is calculated once at checkout: ₹${formatPrice(cartDelivery)} for ${cartTotalUnits} unit${cartTotalUnits === 1 ? '' : 's'}.`;
  const cartTotal = cartSubtotal + cartDelivery;
  const cartDalalPreview = useMemo(
    () =>
      wallet
        ? calculateDalalCoinPreview({
            kind: 'ecommerce',
            baseAmount: cartSubtotal,
            requestedCoins: wallet.phoneVerified === false ? 0 : Number(dalalCoinsToUse || 0),
            spendableCoins: wallet.spendableCoins,
          })
        : null,
    [wallet, cartSubtotal, dalalCoinsToUse]
  );
  const cartGrandTotalAfterCoins =
    (cartDalalPreview ? cartDalalPreview.finalAmount : cartSubtotal) + cartDelivery;
  const selectedItemDeliveryQuote = useMemo(() => {
    if (!selectedItem) {
      return null;
    }
    return getItemDeliveryQuote(
      selectedItem,
      normalizedDeliveryDistanceKm,
      getMinimumOrderQty(selectedItem)
    );
  }, [selectedItem, normalizedDeliveryDistanceKm]);

  // Search suggestions
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return items.filter(it => `${it.itemName} ${it.brand} ${it.category}`.toLowerCase().includes(q)).slice(0, 6);
  }, [searchQuery, items]);

  // Admin add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<CreateMaterialItemPayload>({ ...EMPTY_FORM });
  const [addingItem, setAddingItem] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Banner auto-slide
  useEffect(() => {
    const timer = setInterval(() => setBannerIdx((i) => (i + 1) % DEALS_BANNERS.length), 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadWallet = async () => {
      if (!token || !user) {
        if (!cancelled) {
          setWallet(null);
        }
        return;
      }

      try {
        const response = await getDalalCoinWallet(10);
        if (!cancelled) {
          setWallet(response.wallet);
        }
      } catch {
        if (!cancelled) {
          setWallet(null);
        }
      }
    };

    void loadWallet();

    return () => {
      cancelled = true;
    };
  }, [token, user]);

  useEffect(() => {
    setCheckoutContact((currentValue) => ({
      ...currentValue,
      contactName: currentValue.contactName || user?.name || '',
      contactPhone: currentValue.contactPhone || user?.phone || '',
      contactEmail: currentValue.contactEmail || user?.email || '',
    }));
  }, [user?.email, user?.name, user?.phone]);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getBuildingMaterials({
        q: searchQuery.trim() || undefined,
        category: selectedCategory || undefined,
        city: selectedCity || undefined,
        sort: sortBy,
        limit: 400,
      });
      setItems(res.items || []);
      setCategories(res.filters?.categories || []);
      setCities(res.filters?.cities || []);
      setTotalCount(res.pagination?.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load materials.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, selectedCity, sortBy]);

  useEffect(() => {
    const timer = setTimeout(() => void loadItems(), 300);
    return () => clearTimeout(timer);
  }, [loadItems]);

  const toggleWishlist = (id: string) => {
    setWishlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addToCart = (item: MaterialItem) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.item.id === item.id);
      if (existing) return prev.map((ci) => ci.item.id === item.id ? { ...ci, qty: ci.qty + 1 } : ci);
      return [...prev, { item, qty: getMinimumOrderQty(item) }];
    });
    toast.success(`${item.itemName} added to cart`);
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((ci) => ci.item.id !== itemId));
  };

  const updateCartQty = (itemId: string, delta: number) => {
    setCart((prev) => prev.map((ci) => {
      if (ci.item.id !== itemId) return ci;
      const next = ci.qty + delta;
      if (next <= 0) {
        return ci;
      }
      return { ...ci, qty: Math.max(getMinimumOrderQty(ci.item), next) };
    }).filter((ci) => ci.qty > 0));
  };

  const handleCartCheckout = async () => {
    const openUrl = (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    };

    if (!cart.length) {
      toast.info('Add materials to your cart first.');
      return;
    }

    if (!token || !user) {
      toast.info('Sign in to use secure checkout and Dalal Coin discounts. Falling back to WhatsApp for now.');
      openUrl(
        buildCartWhatsAppUrl(
          cart,
          normalizedDeliveryDistanceKm,
          cartDelivery,
          cartSubtotal,
          cartTotal,
          cartOfferLabel
        )
      );
      return;
    }

    if (checkoutContact.contactName.trim().length < 2) {
      toast.error('Enter the contact name for this order.');
      return;
    }

    if (checkoutContact.contactPhone.trim().replace(/[^\d]/g, '').length < 10) {
      toast.error('Enter a valid contact phone number.');
      return;
    }

    if (checkoutContact.contactEmail.trim() && !/\S+@\S+\.\S+/.test(checkoutContact.contactEmail.trim())) {
      toast.error('Enter a valid contact email or leave it blank.');
      return;
    }

    if (checkoutContact.shippingCity.trim().length < 2) {
      toast.error('Enter the shipping city.');
      return;
    }

    if (checkoutContact.shippingAddress.trim().length < 5) {
      toast.error('Enter the shipping address.');
      return;
    }

    const requestedCoins = wallet && cartDalalPreview ? cartDalalPreview.coinsApplied : 0;
    if (requestedCoins > 0 && wallet && wallet.phoneVerified === false) {
      toast.error('Verify your phone in the Dalal Coin wallet before using coins on materials checkout.');
      return;
    }

    try {
      setDalalCheckoutSubmitting(true);
      const response = await createMaterialsCheckout({
        items: cart.map((entry) => ({
          itemId: entry.item.id,
          quantity: getOrderQty(entry.item, entry.qty),
        })),
        contactName: checkoutContact.contactName.trim(),
        contactPhone: checkoutContact.contactPhone.trim(),
        contactEmail: checkoutContact.contactEmail.trim(),
        shippingCity: checkoutContact.shippingCity.trim(),
        shippingAddress: checkoutContact.shippingAddress.trim(),
        notes: checkoutContact.notes.trim(),
        coinsRequested: requestedCoins,
      });

      const payment = await openRazorpayCheckout(response.checkout);
      const verification = await verifyMaterialsCheckout({
        billingOrderId: response.billingOrder.id,
        ecommerceOrderId: response.ecommerceOrder.id,
        payment,
      });

      if (verification.wallet) {
        setWallet(verification.wallet);
      }
      setCart([]);
      setShowCart(false);
      setDalalCoinsToUse('');
      toast.success(verification.message || 'Materials order paid successfully.');
    } catch (checkoutError) {
      if (checkoutError instanceof RazorpayCheckoutCancelledError) {
        toast.info('Payment checkout was closed before completion.');
      } else {
        toast.error(checkoutError instanceof Error ? checkoutError.message : 'Unable to create secure materials checkout.');
      }
    } finally {
      setDalalCheckoutSubmitting(false);
    }
  };

  const handleAddItem = async () => {
    if (!token || !canAddMaterial) return;
    if (!addForm.itemName.trim() || !addForm.category.trim() || !addForm.brand.trim() || !addForm.locationCity.trim()) {
      toast.error('Please fill all required fields.'); return;
    }
    if (addForm.unitPrice <= 0) { toast.error('Price must be positive.'); return; }
    try {
      setAddingItem(true);
      const res = await createMaterialItem(token, addForm);
      toast.success(res.message || 'Material added!');
      setAddForm({ ...EMPTY_FORM });
      setShowAddForm(false);
      await loadItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add material.');
    } finally {
      setAddingItem(false);
    }
  };

  const handlePhotoUpload = async (itemId: string, file: File) => {
    if (!token || !isAdmin) return;
    try {
      setUploadingPhoto(itemId);
      const upload = await uploadImageFile(token, 'material', file, { maxSide: 1200, mimeType: 'image/webp', quality: 0.88 });
      await updateMaterialItemPhoto(token, itemId, upload.imageUrl);
      toast.success('Photo updated.');
      await loadItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadingPhoto(null);
    }
  };

  const allCats = CATEGORY_NAV.map((c) => c.key).filter(Boolean);
  const dynamicCats = categories.filter((c) => !allCats.some((ac) => c.toLowerCase().includes(ac.toLowerCase())));

  return (
    <div className="space-y-0">

      {/* ========== TOP SEARCH BAR (Amazon-style) ========== */}
      <div className="sticky top-[64px] z-30 -mx-4 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-3 shadow-lg sm:-mx-6 sm:px-6 md:top-[72px]">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="relative flex-1" ref={searchRef}>
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search for cement, steel, bricks, tiles, paint, plumbing..."
              className="h-12 w-full rounded-lg border-2 border-amber-400 bg-white pl-12 pr-4 text-sm text-slate-900 shadow-inner outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
            {/* Search Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
                {suggestions.map((sug) => {
                  const Icon = getCategoryIcon(sug.category);
                  return (
                    <button
                      key={sug.id}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-blue-50 border-b border-slate-100 last:border-0"
                      onClick={() => { setSelectedItem(sug); setShowSuggestions(false); }}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                        {sug.imageUrl ? <img src={sug.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <Icon className="h-5 w-5 text-slate-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{sug.itemName}</p>
                        <p className="text-xs text-slate-500">{sug.brand} • {sug.category} • ₹{formatPrice(sug.unitPrice)}/{sug.unit}</p>
                      </div>
                      <span className="shrink-0 text-xs text-blue-600 font-medium">View →</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="h-12 rounded-lg border-2 border-slate-600 bg-slate-700 px-3 text-sm text-white outline-none transition hover:border-amber-400"
            >
              <option value="">📍 All Cities</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* Cart Button */}
          <button onClick={() => setShowCart(!showCart)} className="relative flex h-12 w-12 items-center justify-center rounded-lg border-2 border-slate-600 bg-slate-700 text-white transition hover:border-amber-400 hover:bg-slate-600">
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-slate-900 shadow">{cartCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* ========== CATEGORY NAV BAR (Flipkart-style) ========== */}
      <div className="overflow-x-auto border-b border-slate-200 bg-white py-3 scrollbar-hide">
        <div className="mx-auto flex max-w-7xl items-center gap-1 px-2">
          {CATEGORY_NAV.map((cat) => {
            const Icon = cat.icon;
            const isActive = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`flex flex-col items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md scale-105'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {cat.label}
              </button>
            );
          })}
          {dynamicCats.map((cat) => {
            const Icon = getCategoryIcon(cat);
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(isActive ? '' : cat)}
                className={`flex flex-col items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium transition-all whitespace-nowrap ${
                  isActive ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* ========== DEALS BANNER CAROUSEL ========== */}
      <div className="relative mt-4 overflow-hidden rounded-2xl shadow-lg">
        <div className="flex transition-transform duration-500" style={{ transform: `translateX(-${bannerIdx * 100}%)` }}>
          {DEALS_BANNERS.map((deal, i) => (
            <div key={i} className={`flex min-w-full items-center justify-between bg-gradient-to-r ${deal.bg} px-8 py-8 sm:px-12 sm:py-10`}>
              <div>
                <h2 className="text-2xl font-bold text-white sm:text-3xl">{deal.title}</h2>
                <p className="mt-1 text-sm text-white/80 sm:text-base">{deal.sub}</p>
              </div>
              <button className="hidden rounded-lg bg-white px-6 py-2.5 text-sm font-bold text-slate-900 shadow-lg transition hover:scale-105 sm:block">
                {deal.cta} <ArrowRight className="ml-1 inline h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => setBannerIdx((i) => (i - 1 + DEALS_BANNERS.length) % DEALS_BANNERS.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-lg transition hover:bg-white">
          <ChevronLeft className="h-5 w-5 text-slate-700" />
        </button>
        <button onClick={() => setBannerIdx((i) => (i + 1) % DEALS_BANNERS.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-lg transition hover:bg-white">
          <ChevronRight className="h-5 w-5 text-slate-700" />
        </button>
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {DEALS_BANNERS.map((_, i) => (
            <button key={i} onClick={() => setBannerIdx(i)} className={`h-2 rounded-full transition-all ${i === bannerIdx ? 'w-6 bg-white' : 'w-2 bg-white/50'}`} />
          ))}
        </div>
      </div>

      {/* ========== RESULTS BAR ========== */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{totalCount}</span> products available
          {selectedCategory && <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-700">{selectedCategory} <button onClick={() => setSelectedCategory('')}><X className="h-3 w-3" /></button></Badge>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Distance</span>
            <Input
              type="number"
              min={0}
              max={250}
              value={deliveryDistanceKm}
              onChange={(e) => setDeliveryDistanceKm(Math.max(0, Number(e.target.value) || 0))}
              className="h-7 w-20 border-0 px-0 text-right text-sm font-semibold text-slate-900 shadow-none focus-visible:ring-0"
            />
            <span className="text-xs text-slate-500">km</span>
          </div>
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
            Free order delivery over ₹20,000
          </Badge>
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
            Order delivery cap ₹1,500
          </Badge>
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
            Minimum delivery ₹250
          </Badge>
          <span className="text-xs text-slate-500">Sort by:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as MaterialSort)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none">
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {canAddMaterial && (
            <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} className="gap-1.5 bg-amber-500 text-white hover:bg-amber-600 shadow-md">
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          )}
        </div>
      </div>

      {/* ========== ADMIN ADD FORM ========== */}
      {showAddForm && canAddMaterial && (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">📦 Add New Product to Marketplace</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Item Name *</label><Input value={addForm.itemName} onChange={(e) => setAddForm(f => ({ ...f, itemName: e.target.value }))} placeholder="OPC 53 Grade Cement" className="bg-white" /></div>
            <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Category *</label><Input value={addForm.category} onChange={(e) => setAddForm(f => ({ ...f, category: e.target.value }))} placeholder="Cement" className="bg-white" /></div>
            <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Brand *</label><Input value={addForm.brand} onChange={(e) => setAddForm(f => ({ ...f, brand: e.target.value }))} placeholder="UltraTech" className="bg-white" /></div>
            <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Unit</label><Input value={addForm.unit} onChange={(e) => setAddForm(f => ({ ...f, unit: e.target.value }))} placeholder="Bag" className="bg-white" /></div>
            <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Price (₹) *</label><Input type="number" value={addForm.unitPrice || ''} onChange={(e) => setAddForm(f => ({ ...f, unitPrice: Number(e.target.value) }))} placeholder="380" className="bg-white" /></div>
            <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Min Order Qty</label><Input type="number" value={addForm.minOrderQty || ''} onChange={(e) => setAddForm(f => ({ ...f, minOrderQty: Number(e.target.value) || 1 }))} className="bg-white" /></div>
            <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Delivery Days</label><Input type="number" value={addForm.deliveryDays ?? ''} onChange={(e) => setAddForm(f => ({ ...f, deliveryDays: Number(e.target.value) || 0 }))} className="bg-white" /></div>
            <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">City *</label><Input value={addForm.locationCity} onChange={(e) => setAddForm(f => ({ ...f, locationCity: e.target.value }))} placeholder="Hyderabad" className="bg-white" /></div>
            <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Stock</label><select value={addForm.stockStatus} onChange={(e) => setAddForm(f => ({ ...f, stockStatus: e.target.value as 'in_stock' | 'limited' | 'out_of_stock' }))} className="h-10 w-full rounded-lg border bg-white px-3 text-sm"><option value="in_stock">In Stock</option><option value="limited">Limited</option><option value="out_of_stock">Out of Stock</option></select></div>
            <div className="sm:col-span-2 lg:col-span-3"><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Description</label><Textarea value={addForm.description} onChange={(e) => setAddForm(f => ({ ...f, description: e.target.value }))} placeholder="Product details..." className="min-h-16 bg-white" /></div>
            <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Bulk Slab 1</label><Input value={addForm.bulkSlab1} onChange={(e) => setAddForm(f => ({ ...f, bulkSlab1: e.target.value }))} placeholder="100+ bags: ₹360/bag" className="bg-white" /></div>
            <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Bulk Slab 2</label><Input value={addForm.bulkSlab2} onChange={(e) => setAddForm(f => ({ ...f, bulkSlab2: e.target.value }))} placeholder="500+ bags: ₹340/bag" className="bg-white" /></div>
          </div>
          <Button onClick={() => void handleAddItem()} disabled={addingItem} className="bg-amber-500 text-white hover:bg-amber-600">
            {addingItem ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding...</> : <><Plus className="mr-2 h-4 w-4" />Add Product</>}
          </Button>
        </div>
      )}

      {/* ========== LOADING ========== */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Loader2 className="h-12 w-12 animate-spin" />
          <p className="mt-3 text-sm">Loading products...</p>
        </div>
      )}

      {/* ========== ERROR ========== */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 py-16 text-center mt-4">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="mt-3 text-sm text-red-700">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void loadItems()}>Retry</Button>
        </div>
      )}

      {/* ========== EMPTY ========== */}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center mt-4">
          <ShoppingCart className="h-16 w-16 text-slate-200" />
          <h3 className="mt-4 text-xl font-bold text-slate-700">No products found</h3>
          <p className="mt-1 max-w-md text-sm text-slate-500">Try a different search or category. New products are added daily by verified suppliers.</p>
        </div>
      )}

      {/* ========== PRODUCT GRID (Amazon/Flipkart-style cards) ========== */}
      {!loading && !error && items.length > 0 && (
        <div className="mt-4 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => {
            const stock = stockInfo(item.stockStatus);
            const Icon = getCategoryIcon(item.category);
            const origPrice = fakeOriginalPrice(item.unitPrice);
            const discount = calcDiscount(origPrice, item.unitPrice);
            const isWished = wishlist.has(item.id);
            const minimumQty = getMinimumOrderQty(item);
            const deliveryQuote = getItemDeliveryQuote(item, normalizedDeliveryDistanceKm, minimumQty);
            const cartEntry = cart.find((ci) => ci.item.id === item.id);

            return (
              <article
                key={item.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-200 hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)] hover:-translate-y-0.5"
              >
                {/* Wishlist */}
                <button onClick={() => toggleWishlist(item.id)} className="absolute right-2 top-2 z-10 rounded-full bg-white p-1.5 shadow-md transition hover:scale-110">
                  <Heart className={`h-4 w-4 ${isWished ? 'fill-red-500 text-red-500' : 'text-slate-300'}`} />
                </button>

                {/* Discount badge */}
                {discount >= 5 && (
                  <div className="absolute left-0 top-3 z-10 rounded-r-md bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                    {discount}% OFF
                  </div>
                )}

                {/* Image */}
                <div className="relative aspect-square overflow-hidden bg-slate-50 cursor-pointer" onClick={() => setSelectedItem(item)}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.itemName} loading="lazy" className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-110" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Icon className="h-16 w-16 text-slate-200" />
                    </div>
                  )}
                  {isAdmin && (
                    <label className="absolute bottom-1.5 right-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white shadow-md transition hover:bg-slate-50">
                      {uploadingPhoto === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" /> : <ImagePlus className="h-3.5 w-3.5 text-slate-400" />}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handlePhotoUpload(item.id, f); }} />
                    </label>
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-1 flex-col p-3 pt-2 border-t border-slate-100">
                  {/* Brand */}
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">{item.brand}</p>

                  {/* Title */}
                  <h3 className="mt-0.5 text-xs font-medium text-slate-800 line-clamp-2 leading-4 cursor-pointer hover:text-blue-600 transition" onClick={() => setSelectedItem(item)}>
                    {item.itemName}
                  </h3>

                  {/* Rating (cosmetic) */}
                  <div className="mt-1.5 flex items-center gap-1">
                    <span className="inline-flex items-center gap-0.5 rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      4.{Math.floor(Math.random() * 5) + 1} <Star className="h-2.5 w-2.5 fill-white" />
                    </span>
                    <span className="text-[10px] text-slate-400">({Math.floor(Math.random() * 900 + 100)})</span>
                  </div>

                  {/* Price */}
                  <div className="mt-2 space-y-0.5">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-lg font-bold text-slate-900">₹{formatPrice(item.unitPrice)}</span>
                      <span className="text-xs text-slate-400 line-through">₹{formatPrice(origPrice)}</span>
                      {discount >= 5 && <span className="text-xs font-semibold text-green-600">{discount}% off</span>}
                    </div>
                    <p className="text-[10px] text-slate-500">per {item.unit}</p>
                  </div>

                  {/* Bulk deals */}
                  {item.bulkSlab1 && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-orange-600 font-medium">
                      <Tag className="h-3 w-3" /> {item.bulkSlab1}
                    </div>
                  )}

                  {/* Delivery + Stock + Charges */}
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-1 text-[11px]">
                      <Truck className="h-3 w-3 text-slate-400" />
                      <span className="text-slate-600">
                        <span className={deliveryQuote.finalCharge === 0 ? 'font-semibold text-green-600' : 'font-medium text-slate-700'}>
                          {deliveryHeadline(deliveryQuote)}
                        </span>{' '}
                        • {deliveryTimelineLabel(item.deliveryDays)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                        {deliveryQuote.tierLabel}
                      </Badge>
                      <span>{deliveryQuote.bandLabel}</span>
                      <span>•</span>
                      <span>at {normalizedDeliveryDistanceKm} km</span>
                    </div>
                    {deliveryQuote.capApplied && (
                      <p className="text-[10px] font-medium text-emerald-700">
                        Actual ₹{formatPrice(deliveryQuote.rawCharge)} {'->'} You pay ₹{formatPrice(deliveryQuote.finalCharge)} (Capped)
                      </p>
                    )}
                    {!deliveryQuote.capApplied && deliveryQuote.offerLabel && (
                      <p className="text-[10px] font-medium text-emerald-700">{formatOfferLabel(deliveryQuote.offerLabel)}</p>
                    )}
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className={`h-1.5 w-1.5 rounded-full ${stock.dot}`} />
                      <span className={`font-medium ${stock.color}`}>{stock.label}</span>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="mt-3 flex flex-col gap-1.5">
                    {cartEntry ? (
                      <div className="flex items-center justify-center rounded-lg border-2 border-amber-400 bg-amber-50">
                        <button
                          onClick={() => updateCartQty(item.id, -1)}
                          disabled={cartEntry.qty <= minimumQty}
                          className="rounded-l-lg px-3 py-2 text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="px-3 py-2 text-xs font-bold text-amber-800">{cartEntry.qty}</span>
                        <button onClick={() => updateCartQty(item.id, 1)} className="px-3 py-2 text-amber-700 transition hover:bg-amber-100 rounded-r-lg"><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(item)}
                        disabled={item.stockStatus === 'out_of_stock'}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-slate-900 shadow-sm transition hover:bg-amber-300 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        Add to Cart
                      </button>
                    )}
                    <a
                      href={buildWhatsAppUrl(item, normalizedDeliveryDistanceKm)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs font-medium text-green-700 transition hover:bg-green-100 active:scale-[0.98]"
                    >
                      Ask on WhatsApp
                    </a>
                    {minimumQty > 1 && (
                      <p className="text-center text-[10px] text-slate-400">Minimum order {minimumQty} {item.unit}{minimumQty > 1 ? 's' : ''}</p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ========== TRUST STRIP ========== */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: ShieldCheck, label: 'Verified Suppliers', sub: 'Quality assured materials' },
          { icon: Truck, label: 'Fast Delivery', sub: 'Direct from warehouse' },
          { icon: BadgePercent, label: 'Best Prices', sub: 'Bulk discounts available' },
          { icon: Clock, label: 'Easy Returns', sub: 'Hassle-free process' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <item.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">{item.label}</p>
              <p className="text-[10px] text-slate-500">{item.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ========== CART DRAWER ========== */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={() => setShowCart(false)}>
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <h2 className="text-lg font-bold text-slate-900">🛒 My Cart ({cartCount})</h2>
              <button onClick={() => setShowCart(false)} className="rounded-full bg-slate-100 p-2 transition hover:bg-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ShoppingCart className="h-16 w-16 text-slate-200" />
                  <p className="mt-3 text-sm text-slate-500">Your cart is empty</p>
                  <p className="text-xs text-slate-400">Add products to get started</p>
                </div>
              )}
              {cartLineQuotes.map((ci) => {
                return (
                  <div key={ci.item.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="h-16 w-16 shrink-0 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden">
                      {ci.item.imageUrl ? <img src={ci.item.imageUrl} alt="" className="h-full w-full object-contain" /> : <Package className="h-8 w-8 text-slate-200" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{ci.item.itemName}</p>
                      <p className="text-xs text-slate-500">{ci.item.brand} • ₹{formatPrice(ci.item.unitPrice)}/{ci.item.unit}</p>
                      <p className="text-[10px] text-slate-400">
                        🚚 {deliveryTimelineLabel(ci.item.deliveryDays)} • order delivery is confirmed at checkout
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="inline-flex items-center rounded-lg border border-slate-200">
                          <button
                            onClick={() => updateCartQty(ci.item.id, -1)}
                            disabled={ci.qty <= getMinimumOrderQty(ci.item)}
                            className="px-2 py-1 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="px-2 text-xs font-bold text-slate-800">{ci.qty}</span>
                          <button onClick={() => updateCartQty(ci.item.id, 1)} className="px-2 py-1 text-slate-500 hover:bg-slate-50"><Plus className="h-3 w-3" /></button>
                        </div>
                        <span className="text-sm font-bold text-slate-900">₹{formatPrice(ci.item.unitPrice * ci.qty)}</span>
                        <button onClick={() => removeFromCart(ci.item.id)} className="ml-auto text-slate-400 hover:text-red-500 transition"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {cart.length > 0 && (
              <div className="border-t border-slate-200 p-4 space-y-3">
                {token && user ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                      Delivery Contact
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Input
                        className="bg-white"
                        placeholder="Contact name"
                        value={checkoutContact.contactName}
                        onChange={(event) =>
                          setCheckoutContact((currentValue) => ({
                            ...currentValue,
                            contactName: event.target.value,
                          }))
                        }
                      />
                      <Input
                        className="bg-white"
                        inputMode="tel"
                        placeholder="Phone number"
                        value={checkoutContact.contactPhone}
                        onChange={(event) =>
                          setCheckoutContact((currentValue) => ({
                            ...currentValue,
                            contactPhone: event.target.value,
                          }))
                        }
                      />
                      <Input
                        className="bg-white"
                        inputMode="email"
                        placeholder="Email (optional)"
                        value={checkoutContact.contactEmail}
                        onChange={(event) =>
                          setCheckoutContact((currentValue) => ({
                            ...currentValue,
                            contactEmail: event.target.value,
                          }))
                        }
                      />
                      <Input
                        className="bg-white"
                        placeholder="Shipping city"
                        value={checkoutContact.shippingCity}
                        onChange={(event) =>
                          setCheckoutContact((currentValue) => ({
                            ...currentValue,
                            shippingCity: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <Textarea
                      className="mt-3 min-h-[80px] bg-white"
                      placeholder="Shipping address"
                      value={checkoutContact.shippingAddress}
                      onChange={(event) =>
                        setCheckoutContact((currentValue) => ({
                          ...currentValue,
                          shippingAddress: event.target.value,
                        }))
                      }
                    />
                    <Textarea
                      className="mt-3 min-h-[76px] bg-white"
                      placeholder="Order notes (optional)"
                      value={checkoutContact.notes}
                      onChange={(event) =>
                        setCheckoutContact((currentValue) => ({
                          ...currentValue,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
                    Sign in to use secure Razorpay checkout and Dalal Coin discounts. You can still continue on WhatsApp below.
                  </div>
                )}
                {wallet ? (
                  <div
                    className={`rounded-xl p-3 ${
                      wallet.phoneVerified === false
                        ? 'border border-amber-200 bg-amber-50/80'
                        : 'border border-emerald-200 bg-emerald-50/80'
                    }`}
                  >
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                        wallet.phoneVerified === false ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      Dalal Coin Checkout
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Spendable wallet: {wallet.spendableCoins} DC • Materials discount applies only on product subtotal before delivery.
                    </p>
                    {wallet.phoneVerified === false ? (
                      <p className="mt-2 text-xs text-amber-800">
                        Phone verification is required before coins can be spent. You can still pay securely without coins right now.
                      </p>
                    ) : (
                      <>
                        <Input
                          className="mt-3 bg-white"
                          inputMode="numeric"
                          placeholder={`Use up to ${Math.min(cartDalalPreview?.maxCoinsAllowed || 0, wallet.spendableCoins)} DC`}
                          value={dalalCoinsToUse}
                          onChange={(event) => setDalalCoinsToUse(event.target.value.replace(/[^\d]/g, ''))}
                        />
                        {cartDalalPreview ? (
                          <div className="mt-3 rounded-xl border border-white/80 bg-white px-3 py-2 text-xs text-slate-600">
                            <p>
                              Coin discount:{' '}
                              <span className="font-semibold text-slate-900">₹{formatPrice(cartDalalPreview.discountValue)}</span>
                            </p>
                            <p>
                              Materials after coins:{' '}
                              <span className="font-semibold text-slate-900">₹{formatPrice(cartDalalPreview.finalAmount)}</span>
                            </p>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>₹{formatPrice(cartSubtotal)}</span></div>
                  {cartDalalPreview && cartDalalPreview.coinsApplied > 0 ? (
                    <div className="flex justify-between text-emerald-700"><span>Dalal Coin discount</span><span>-₹{formatPrice(cartDalalPreview.discountValue)}</span></div>
                  ) : null}
                  <div className="flex justify-between text-slate-600"><span>Delivery</span><span className={cartDelivery === 0 ? 'text-green-600 font-semibold' : ''}>{cartDelivery === 0 ? 'FREE' : `₹${formatPrice(cartDelivery)}`}</span></div>
                  <div className="flex justify-between text-lg font-bold text-slate-900 pt-1 border-t border-dashed border-slate-200"><span>Total</span><span>₹{formatPrice(cartGrandTotalAfterCoins)}</span></div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                  <p>Total quantity: {cartTotalUnits} unit{cartTotalUnits === 1 ? '' : 's'}</p>
                  <p>{cartOfferLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCartCheckout()}
                  disabled={dalalCheckoutSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-green-400 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {dalalCheckoutSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                  {!token || !user
                    ? 'Continue On WhatsApp'
                    : cartDalalPreview && cartDalalPreview.coinsApplied > 0
                      ? 'Apply Coins & Pay Securely'
                      : 'Pay Securely with Razorpay'}
                </button>
                <p className="text-center text-[10px] text-slate-400">
                  {!token || !user
                    ? 'Sign in to switch this cart to ZDT secure checkout.'
                    : 'Payment is processed through Razorpay and your order is saved inside ZDT.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== PRODUCT DETAIL MODAL ========== */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 pt-20" onClick={() => setSelectedItem(null)}>
          <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedItem(null)} className="absolute right-4 top-4 z-10 rounded-full bg-slate-100 p-2 transition hover:bg-slate-200"><X className="h-5 w-5 text-slate-500" /></button>

            <div className="grid gap-6 p-6 sm:grid-cols-2">
              {/* Left: Image */}
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-xl bg-slate-50 border border-slate-200">
                  {selectedItem.imageUrl ? (
                    <img src={selectedItem.imageUrl} alt={selectedItem.itemName} className="w-full aspect-square object-contain p-6" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center"><Package className="h-24 w-24 text-slate-200" /></div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleWishlist(selectedItem.id)} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                    <Heart className={`h-4 w-4 ${wishlist.has(selectedItem.id) ? 'fill-red-500 text-red-500' : ''}`} /> Wishlist
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Link copied!'); }} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                    <Share2 className="h-4 w-4" /> Share
                  </button>
                </div>
              </div>

              {/* Right: Details */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-blue-600 uppercase">{selectedItem.brand}</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{selectedItem.itemName}</h2>
                  <p className="mt-1 text-xs text-slate-400">Product Code: {selectedItem.itemCode} • {selectedItem.category}</p>
                </div>

                {/* Rating */}
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-xs font-bold text-white">
                    4.{Math.floor(Math.random() * 5) + 1} <Star className="h-3 w-3 fill-white" />
                  </span>
                  <span className="text-xs text-slate-500">{Math.floor(Math.random() * 900 + 100)} Ratings & {Math.floor(Math.random() * 200 + 50)} Reviews</span>
                </div>

                {/* Price block */}
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-900">₹{formatPrice(selectedItem.unitPrice)}</span>
                    <span className="text-base text-slate-400 line-through">₹{formatPrice(fakeOriginalPrice(selectedItem.unitPrice))}</span>
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">{calcDiscount(fakeOriginalPrice(selectedItem.unitPrice), selectedItem.unitPrice)}% off</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">per {selectedItem.unit} (inclusive of all taxes)</p>
                  {selectedItem.minOrderQty > 1 && <p className="mt-1 text-xs text-slate-500">Minimum order: {selectedItem.minOrderQty} {selectedItem.unit}s</p>}
                </div>

                {/* Offers */}
                {(selectedItem.bulkSlab1 || selectedItem.bulkSlab2) && (
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-slate-800">Available Offers</p>
                    {selectedItem.bulkSlab1 && <div className="flex items-center gap-2 text-xs text-slate-700"><Tag className="h-4 w-4 text-green-600" /><span><strong className="text-green-700">Bulk Deal:</strong> {selectedItem.bulkSlab1}</span></div>}
                    {selectedItem.bulkSlab2 && <div className="flex items-center gap-2 text-xs text-slate-700"><Tag className="h-4 w-4 text-green-600" /><span><strong className="text-green-700">Bulk Deal:</strong> {selectedItem.bulkSlab2}</span></div>}
                  </div>
                )}

                {/* Delivery */}
                <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm"><Truck className="h-4 w-4 text-blue-600" /><span className="font-medium text-slate-800">Delivery to {selectedItem.locationCity}</span></div>
                  {selectedItemDeliveryQuote && (
                    <>
                      <p className="text-xs text-slate-600">
                        {deliveryTimelineLabel(selectedItem.deliveryDays)} • {selectedItemDeliveryQuote.tierLabel} • {selectedItemDeliveryQuote.bandLabel} at {normalizedDeliveryDistanceKm} km
                      </p>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-sm font-semibold text-slate-900">
                          {selectedItemDeliveryQuote.finalCharge === 0
                            ? 'FREE delivery unlocked'
                            : `Estimated delivery ₹${formatPrice(selectedItemDeliveryQuote.finalCharge)}`}
                        </p>
                        {selectedItemDeliveryQuote.capApplied ? (
                          <p className="mt-1 text-xs font-medium text-emerald-700">
                            Actual cost ₹{formatPrice(selectedItemDeliveryQuote.rawCharge)} {'->'} You pay ₹{formatPrice(selectedItemDeliveryQuote.finalCharge)} (Capped)
                          </p>
                        ) : selectedItemDeliveryQuote.offerLabel ? (
                          <p className="mt-1 text-xs font-medium text-emerald-700">{formatOfferLabel(selectedItemDeliveryQuote.offerLabel)}</p>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500">
                            Base ₹{formatPrice(selectedItemDeliveryQuote.basePrice)} + distance rate up to ₹{selectedItemDeliveryQuote.maxPerKm}/km with cap ₹{formatPrice(selectedItemDeliveryQuote.defaultCap)}.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${stockInfo(selectedItem.stockStatus).dot}`} /><span className={`text-sm font-semibold ${stockInfo(selectedItem.stockStatus).color}`}>{stockInfo(selectedItem.stockStatus).label}</span></div>
                </div>

                {/* Description */}
                {selectedItem.description && (
                  <div>
                    <p className="text-sm font-bold text-slate-800">Product Details</p>
                    <p className="mt-1 text-sm text-slate-600 leading-relaxed">{selectedItem.description}</p>
                  </div>
                )}

                {/* CTA Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      addToCart(selectedItem);
                      setShowCart(true);
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 py-3.5 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-amber-300 hover:shadow-xl hover:-translate-y-0.5"
                  >
                    <ShoppingCart className="h-4 w-4" /> ADD TO SECURE CART
                  </button>
                  <a
                    href={buildWhatsAppUrl(selectedItem, normalizedDeliveryDistanceKm)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-green-400 hover:shadow-xl hover:-translate-y-0.5"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.612l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.3 0-4.438-.754-6.163-2.029l-.44-.337-2.67.895.895-2.67-.337-.44A9.935 9.935 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>
                    ASK ON WHATSAPP
                  </a>
                </div>

                {/* Seller info */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-700">Sold by: <span className="text-blue-600">ZDT Verified Supplier</span></p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Supplier ships from {selectedItem.locationCity} • Return policy applies</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
