import React, { useMemo, useState } from 'react';
import { Archive, Calendar, Edit3, Plus, Save, Search, Tag, X } from 'lucide-react';
import type { MenuItem, MenuPromotionDiscount, Restaurant } from '../src/types';
import {
  getDefaultPromotionDiscount,
  getMenuItemEffectivePrice,
  isMenuPromotionActive,
  isMenuPromotionArchived,
  normalizeMenuPromotionDiscount,
  toLocalDateKey,
} from '../lib/menuPricing';
import { toast } from './Toast';

interface Props {
  restaurant: Pick<Restaurant, 'id' | 'menu'>;
  currencySymbol: string;
  onUpdateMenu?: (restaurantId: string, item: MenuItem) => void | Promise<void>;
}

type PromoStatus = 'ACTIVE' | 'ARCHIVED';
type PromotionVariantDiscount = NonNullable<MenuPromotionDiscount['variantDiscounts']>[number];

const getPromotionVariantOptions = (item?: MenuItem | null): Array<{ key: string; label: string; price: number }> => {
  if (!item) return [];

  const options = new Map<string, { key: string; label: string; price: number }>();
  options.set('base', { key: 'base', label: 'Base item', price: Number(item.price || 0) });

  if (Array.isArray(item.sizes)) {
    item.sizes.forEach(size => {
      if (size?.name) options.set(`size:${size.name}`, { key: `size:${size.name}`, label: `Size: ${size.name}`, price: Number(item.price || 0) + Number(size.price || 0) });
    });
  }

  if (Array.isArray(item.otherVariants)) {
    item.otherVariants.forEach(variant => {
      if (variant?.name) options.set(`other:${variant.name}`, { key: `other:${variant.name}`, label: `${item.otherVariantName || 'Option'}: ${variant.name}`, price: Number(item.price || 0) + Number(variant.price || 0) });
    });
  }

  if (item.tempOptions?.enabled && Array.isArray(item.tempOptions.options)) {
    item.tempOptions.options.forEach(option => {
      if (option?.name) options.set(`temp:${option.name}`, { key: `temp:${option.name}`, label: `Temp: ${option.name}`, price: Number(item.price || 0) + Number(option.price || 0) });
    });
  }

  if (item.variantOptions?.enabled && Array.isArray(item.variantOptions.options)) {
    item.variantOptions.options.forEach(option => {
      if (option?.name) options.set(`variant:${option.name}`, { key: `variant:${option.name}`, label: `Variant: ${option.name}`, price: Number(item.price || 0) + Number(option.price || 0) });
    });
  }

  return Array.from(options.values());
};

const mergeVariantDiscounts = (item: MenuItem | undefined, promotion: MenuPromotionDiscount): PromotionVariantDiscount[] => {
  const existing = new Map((promotion.variantDiscounts || []).map(discount => [discount.key, discount]));
  return getPromotionVariantOptions(item).map(option => {
    const saved = existing.get(option.key);
    return {
      key: option.key,
      label: option.label,
      enabled: saved?.enabled === true,
      type: saved?.type || promotion.type,
      value: Number(saved?.value || 0),
    };
  });
};

const getPromotionValueLabel = (promotion: MenuPromotionDiscount, currencySymbol: string) => {
  if (promotion.appliesTo === 'variants') {
    const count = (promotion.variantDiscounts || []).filter(discount => discount.enabled && discount.value > 0).length;
    return count === 1 ? '1 adjusted variant' : `${count} adjusted variants`;
  }

  return promotion.type === 'percentage'
    ? `${Number(promotion.value || 0)}% off`
    : `${currencySymbol}${Number(promotion.value || 0).toFixed(2)} off`;
};

const getPromotionDateLabel = (promotion: MenuPromotionDiscount) => {
  if (promotion.startDate && promotion.endDate) return `${promotion.startDate} to ${promotion.endDate}`;
  if (promotion.startDate) return `From ${promotion.startDate}`;
  if (promotion.endDate) return `Until ${promotion.endDate}`;
  return 'No date limit';
};

const PromotionDiscountManager: React.FC<Props> = ({ restaurant, currencySymbol, onUpdateMenu }) => {
  const editableItems = useMemo(() => (
    restaurant.menu.filter(item => !item.isArchived).sort((a, b) => a.name.localeCompare(b.name))
  ), [restaurant.menu]);

  const firstEditableItem = editableItems[0];
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PromoStatus>('ACTIVE');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(firstEditableItem?.id || '');
  const [dateEnabled, setDateEnabled] = useState(false);
  const [form, setForm] = useState<MenuPromotionDiscount>(() => ({
    ...getDefaultPromotionDiscount(),
    enabled: true,
  }));
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const selectedItem = useMemo(() => (
    editableItems.find(item => item.id === selectedItemId) || firstEditableItem
  ), [editableItems, firstEditableItem, selectedItemId]);

  const activePromos = useMemo(() => (
    editableItems.filter(item => isMenuPromotionActive(item.promotionDiscount))
  ), [editableItems]);

  const archivedPromos = useMemo(() => (
    editableItems.filter(item => isMenuPromotionArchived(item.promotionDiscount))
  ), [editableItems]);

  const visiblePromos = useMemo(() => {
    const q = search.trim().toLowerCase();
    const source = statusFilter === 'ACTIVE' ? activePromos : archivedPromos;
    return source.filter(item => (
      !q ||
      item.name.toLowerCase().includes(q) ||
      (item.category || '').toLowerCase().includes(q) ||
      (normalizeMenuPromotionDiscount(item.promotionDiscount).label || '').toLowerCase().includes(q)
    ));
  }, [activePromos, archivedPromos, search, statusFilter]);

  const openPromoModal = (item?: MenuItem) => {
    const target = item || firstEditableItem;
    if (!target) {
      toast('Add a menu item before creating a promotion.', 'warning');
      return;
    }

    const normalized = normalizeMenuPromotionDiscount(item?.promotionDiscount || getDefaultPromotionDiscount());
    const draft = {
      ...normalized,
      enabled: true,
      appliesTo: normalized.appliesTo || 'all',
      variantDiscounts: mergeVariantDiscounts(target, normalized),
    };

    setSelectedItemId(target.id);
    setDateEnabled(Boolean(draft.startDate || draft.endDate));
    setForm(draft);
    setIsModalOpen(true);
  };

  const updateSelectedItem = (itemId: string) => {
    const nextItem = editableItems.find(item => item.id === itemId);
    if (!nextItem) return;

    const nextBase = {
      ...getDefaultPromotionDiscount(),
      enabled: true,
      type: form.type,
      value: form.value,
      appliesTo: form.appliesTo,
      startDate: form.startDate,
      endDate: form.endDate,
      label: form.label,
    };

    setSelectedItemId(itemId);
    setForm({
      ...nextBase,
      variantDiscounts: mergeVariantDiscounts(nextItem, nextBase),
    });
  };

  const updateVariantDiscount = (key: string, patch: Partial<PromotionVariantDiscount>) => {
    setForm(prev => ({
      ...prev,
      variantDiscounts: mergeVariantDiscounts(selectedItem, prev).map(discount => (
        discount.key === key ? { ...discount, ...patch } : discount
      )),
    }));
  };

  const savePromotion = async () => {
    if (!onUpdateMenu) {
      toast('Menu editing is not enabled for this account.', 'warning');
      return;
    }
    if (!selectedItem) {
      toast('Choose a menu item for this promotion.', 'warning');
      return;
    }

    const normalized = normalizeMenuPromotionDiscount({
      ...form,
      enabled: true,
      startDate: dateEnabled ? form.startDate : '',
      endDate: dateEnabled ? form.endDate : '',
      variantDiscounts: mergeVariantDiscounts(selectedItem, form),
    });

    if (dateEnabled && (!normalized.startDate || !normalized.endDate)) {
      toast('Choose both promotion start and end dates.', 'warning');
      return;
    }
    if (normalized.startDate && normalized.endDate && normalized.endDate < normalized.startDate) {
      toast('Promotion end date cannot be before the start date.', 'warning');
      return;
    }

    const hasDiscount = normalized.appliesTo === 'variants'
      ? (normalized.variantDiscounts || []).some(discount => discount.enabled && discount.value > 0)
      : normalized.value > 0;

    if (!hasDiscount) {
      toast('Enter a promotion discount value.', 'warning');
      return;
    }

    setSavingItemId(selectedItem.id);
    try {
      await onUpdateMenu(restaurant.id, { ...selectedItem, promotionDiscount: normalized });
      setIsModalOpen(false);
      toast('Promotion saved', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to save promotion', 'error');
    } finally {
      setSavingItemId(null);
    }
  };

  const archivePromotion = async (item: MenuItem) => {
    if (!onUpdateMenu) {
      toast('Menu editing is not enabled for this account.', 'warning');
      return;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const archived = normalizeMenuPromotionDiscount({
      ...item.promotionDiscount,
      enabled: true,
      endDate: toLocalDateKey(yesterday),
    });

    setSavingItemId(item.id);
    try {
      await onUpdateMenu(restaurant.id, { ...item, promotionDiscount: archived });
      toast('Promotion archived', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to archive promotion', 'error');
    } finally {
      setSavingItemId(null);
    }
  };

  const rows = visiblePromos.map(item => ({
    item,
    promotion: normalizeMenuPromotionDiscount(item.promotionDiscount),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search promo..."
            className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-xs font-bold text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white sm:w-56"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex h-9 rounded-lg border border-gray-200 bg-gray-50 p-1 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 text-[10px] font-black uppercase tracking-widest transition ${statusFilter === 'ACTIVE' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ARCHIVED')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 text-[10px] font-black uppercase tracking-widest transition ${statusFilter === 'ARCHIVED' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            >
              <Archive size={13} /> Archived
            </button>
          </div>
          <button
            type="button"
            onClick={() => openPromoModal()}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-black px-4 text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-orange-500 dark:bg-white dark:text-gray-900 dark:hover:bg-orange-500 dark:hover:text-white"
          >
            <Plus size={14} /> Add Promo
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-gray-50 text-gray-400 dark:bg-gray-900/40">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest">Menu</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest">Discount</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest">Date</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest">Promo Price</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/70">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-14 text-center">
                    <Tag size={28} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {statusFilter === 'ACTIVE' ? '0 active promotions' : 'No archived promotions'}
                    </p>
                  </td>
                </tr>
              ) : rows.map(({ item, promotion }) => {
                const isVariantPromo = promotion.appliesTo === 'variants';
                const effectivePrice = getMenuItemEffectivePrice(item);

                return (
                  <tr key={item.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-tight text-gray-900 dark:text-white">{item.name}</p>
                        <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-400">{item.category || 'Uncategorized'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-black text-gray-900 dark:text-white">{getPromotionValueLabel(promotion, currencySymbol)}</p>
                      <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-400">{isVariantPromo ? 'Adjusted variants' : 'All variants'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400">
                        <Calendar size={13} />
                        {getPromotionDateLabel(promotion)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isVariantPromo ? (
                        <span className="text-xs font-black text-orange-500">Variant based</span>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[10px] font-bold text-gray-400 line-through">{currencySymbol}{Number(item.price || 0).toFixed(2)}</span>
                          <span className="text-xs font-black text-orange-500">{currencySymbol}{effectivePrice.toFixed(2)}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {statusFilter === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => archivePromotion(item)}
                            disabled={savingItemId === item.id}
                            className="p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-900/20 rounded-lg"
                            title="Archive promotion"
                          >
                            <Archive size={17} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openPromoModal(item)}
                          className="p-2 text-gray-400 transition hover:bg-orange-50 hover:text-orange-500 dark:hover:bg-orange-900/20 rounded-lg"
                          title="Edit promotion"
                        >
                          <Edit3 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && selectedItem && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight text-gray-900 dark:text-white">Add Promo</h3>
                <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-orange-500">Choose menu, date, discount type, and variant scope</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">Menu</label>
                  <select
                    value={selectedItem.id}
                    onChange={event => updateSelectedItem(event.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  >
                    {editableItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">Promo Label</label>
                  <input
                    value={form.label || ''}
                    onChange={event => setForm(prev => ({ ...prev, label: event.target.value }))}
                    placeholder="Optional label"
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={dateEnabled}
                    onChange={event => {
                      setDateEnabled(event.target.checked);
                      if (!event.target.checked) setForm(prev => ({ ...prev, startDate: '', endDate: '' }));
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  Need date?
                </label>

                {dateEnabled && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-gray-400">When from</label>
                      <input
                        type="date"
                        value={form.startDate || ''}
                        onChange={event => setForm(prev => ({ ...prev, startDate: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-gray-400">When to</label>
                      <input
                        type="date"
                        value={form.endDate || ''}
                        onChange={event => setForm(prev => ({ ...prev, endDate: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_160px_140px]">
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">Discount Applicable</label>
                  <div className="grid grid-cols-2 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900">
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, appliesTo: 'all' }))}
                      className={`h-9 rounded-lg text-[10px] font-black uppercase tracking-widest transition ${form.appliesTo !== 'variants' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                      All Variants
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, appliesTo: 'variants', variantDiscounts: mergeVariantDiscounts(selectedItem, prev) }))}
                      className={`h-9 rounded-lg text-[10px] font-black uppercase tracking-widest transition ${form.appliesTo === 'variants' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                      Adjust Variant
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">Type</label>
                  <select
                    value={form.type}
                    onChange={event => setForm(prev => ({ ...prev, type: event.target.value as MenuPromotionDiscount['type'] }))}
                    disabled={form.appliesTo === 'variants'}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-bold text-gray-900 outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  >
                    <option value="percentage">Discount %</option>
                    <option value="fixed">Amount Off</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">Value</label>
                  <div className="relative">
                    {form.type === 'fixed' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">{currencySymbol}</span>}
                    <input
                      type="number"
                      min="0"
                      max={form.type === 'percentage' ? 100 : undefined}
                      step="0.01"
                      value={form.value === 0 ? '' : form.value}
                      onChange={event => setForm(prev => ({ ...prev, value: event.target.value === '' ? 0 : Number(event.target.value) }))}
                      disabled={form.appliesTo === 'variants'}
                      placeholder="0"
                      className={`h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-right text-xs font-bold text-gray-900 outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white ${form.type === 'fixed' ? 'pl-8' : 'pr-8'}`}
                    />
                    {form.type === 'percentage' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">%</span>}
                  </div>
                </div>
              </div>

              {form.appliesTo === 'variants' && (
                <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="grid grid-cols-[1fr_120px_130px_110px] gap-2 bg-gray-50 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:bg-gray-900/40">
                    <span>Variant</span>
                    <span className="text-right">Price</span>
                    <span>Type</span>
                    <span className="text-right">Value</span>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-700/70">
                    {mergeVariantDiscounts(selectedItem, form).map(discount => {
                      const option = getPromotionVariantOptions(selectedItem).find(item => item.key === discount.key);
                      return (
                        <div key={discount.key} className="grid grid-cols-[1fr_120px_130px_110px] items-center gap-2 px-4 py-3">
                          <label className="flex min-w-0 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={discount.enabled}
                              onChange={event => updateVariantDiscount(discount.key, { enabled: event.target.checked })}
                              className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                            />
                            <span className="truncate text-xs font-black text-gray-900 dark:text-white">{discount.label}</span>
                          </label>
                          <span className="text-right text-xs font-black text-orange-500">{currencySymbol}{Number(option?.price || 0).toFixed(2)}</span>
                          <select
                            value={discount.type}
                            onChange={event => updateVariantDiscount(discount.key, { type: event.target.value as MenuPromotionDiscount['type'] })}
                            className="h-9 rounded-lg border border-gray-200 bg-gray-50 px-2 text-[10px] font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                          >
                            <option value="percentage">Discount %</option>
                            <option value="fixed">Amount Off</option>
                          </select>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max={discount.type === 'percentage' ? 100 : undefined}
                              step="0.01"
                              value={discount.value === 0 ? '' : discount.value}
                              onChange={event => updateVariantDiscount(discount.key, { value: event.target.value === '' ? 0 : Number(event.target.value) })}
                              className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 text-right text-[10px] font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                              placeholder="0"
                            />
                            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-400">{discount.type === 'percentage' ? '%' : currencySymbol}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-900/40">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="h-10 rounded-xl border border-gray-200 px-4 text-xs font-black uppercase tracking-widest text-gray-500 transition hover:bg-white dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePromotion}
                disabled={savingItemId === selectedItem.id}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-600 disabled:opacity-50"
              >
                <Save size={15} /> Save Promo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromotionDiscountManager;
