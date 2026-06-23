import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Percent, Save, Search, Tag, X } from 'lucide-react';
import type { MenuItem, MenuPromotionDiscount, Restaurant } from '../src/types';
import {
  getDefaultPromotionDiscount,
  getMenuItemEffectivePrice,
  isMenuPromotionActive,
  normalizeMenuPromotionDiscount,
} from '../lib/menuPricing';
import { toast } from './Toast';

interface Props {
  restaurant: Pick<Restaurant, 'id' | 'menu'>;
  currencySymbol: string;
  onUpdateMenu?: (restaurantId: string, item: MenuItem) => void | Promise<void>;
}

const PromotionDiscountManager: React.FC<Props> = ({ restaurant, currencySymbol, onUpdateMenu }) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [drafts, setDrafts] = useState<Record<string, MenuPromotionDiscount>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const names = Array.from(new Set(restaurant.menu.map(item => item.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return ['All', ...names];
  }, [restaurant.menu]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return restaurant.menu
      .filter(item => !item.isArchived)
      .filter(item => categoryFilter === 'All' || item.category === categoryFilter)
      .filter(item => !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [restaurant.menu, categoryFilter, search]);

  const activeCount = useMemo(() => (
    restaurant.menu.filter(item => !item.isArchived && isMenuPromotionActive(item.promotionDiscount)).length
  ), [restaurant.menu]);

  const getDraft = (item: MenuItem): MenuPromotionDiscount => (
    drafts[item.id] || normalizeMenuPromotionDiscount(item.promotionDiscount)
  );

  const updateDraft = (item: MenuItem, patch: Partial<MenuPromotionDiscount>) => {
    setDrafts(prev => ({
      ...prev,
      [item.id]: {
        ...getDraft(item),
        ...patch,
      },
    }));
  };

  const savePromotion = async (item: MenuItem, promotion: MenuPromotionDiscount) => {
    if (!onUpdateMenu) {
      toast('Menu editing is not enabled for this account.', 'warning');
      return;
    }

    const normalized = normalizeMenuPromotionDiscount(promotion);
    setSavingItemId(item.id);
    try {
      await onUpdateMenu(restaurant.id, { ...item, promotionDiscount: normalized });
      setDrafts(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      toast(normalized.enabled ? 'Promotion saved' : 'Promotion cleared', 'success');
    } catch (error: any) {
      toast(error?.message || 'Failed to save promotion', 'error');
    } finally {
      setSavingItemId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-gray-700 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search menu..."
              className="h-9 w-56 rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-xs font-bold text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={event => setCategoryFilter(event.target.value)}
            className="h-9 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-bold text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          >
            {categories.map(category => <option key={category} value={category}>{category === 'All' ? 'All Categories' : category}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-orange-600 dark:border-orange-900/40 dark:bg-orange-900/20 dark:text-orange-300">
          <Percent size={14} />
          {activeCount} Active
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="divide-y divide-gray-100 dark:divide-gray-700/70">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center">
              <Tag size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">No menu items found</p>
            </div>
          ) : filteredItems.map(item => {
            const draft = getDraft(item);
            const active = isMenuPromotionActive(item.promotionDiscount);
            const effectivePrice = getMenuItemEffectivePrice(item);
            const valueLabel = draft.type === 'percentage' ? '%' : currencySymbol;

            return (
              <div key={item.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(180px,1fr)_minmax(520px,2fr)] lg:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white">{item.name}</p>
                    {active && <CheckCircle2 size={14} className="shrink-0 text-green-500" />}
                  </div>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">{item.category}</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    {active ? (
                      <>
                        <span className="text-xs font-black text-gray-400 line-through">{currencySymbol}{Number(item.price || 0).toFixed(2)}</span>
                        <span className="text-sm font-black text-orange-500">{currencySymbol}{effectivePrice.toFixed(2)}</span>
                      </>
                    ) : (
                      <span className="text-sm font-black text-gray-900 dark:text-white">{currencySymbol}{Number(item.price || 0).toFixed(2)}</span>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[auto_150px_120px_1fr_auto] md:items-end">
                  <label className="flex items-center gap-2 pb-2 text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={event => updateDraft(item, { enabled: event.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                    />
                    Enabled
                  </label>

                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-gray-400">Type</label>
                    <select
                      value={draft.type}
                      onChange={event => updateDraft(item, { type: event.target.value as MenuPromotionDiscount['type'] })}
                      className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    >
                      <option value="percentage">Discount %</option>
                      <option value="fixed">Amount Off</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-gray-400">Value</label>
                    <div className="relative">
                      {draft.type === 'fixed' && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">{valueLabel}</span>}
                      <input
                        type="number"
                        min="0"
                        max={draft.type === 'percentage' ? 100 : undefined}
                        step="0.01"
                        value={draft.value === 0 ? '' : draft.value}
                        onChange={event => updateDraft(item, { value: event.target.value === '' ? 0 : Number(event.target.value) })}
                        className={`h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 text-right text-xs font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white ${draft.type === 'fixed' ? 'pl-7' : 'pr-6'}`}
                        placeholder="0"
                      />
                      {draft.type === 'percentage' && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">{valueLabel}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-gray-400"><Calendar size={11} /> Start</label>
                      <input
                        type="date"
                        value={draft.startDate || ''}
                        onChange={event => updateDraft(item, { startDate: event.target.value })}
                        className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-gray-400"><Calendar size={11} /> End</label>
                      <input
                        type="date"
                        value={draft.endDate || ''}
                        onChange={event => updateDraft(item, { endDate: event.target.value })}
                        className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => savePromotion(item, getDefaultPromotionDiscount())}
                      disabled={savingItemId === item.id}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-red-900/20"
                      title="Clear promotion"
                    >
                      <X size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => savePromotion(item, draft)}
                      disabled={savingItemId === item.id}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-orange-600 disabled:opacity-50"
                    >
                      <Save size={14} /> Save
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PromotionDiscountManager;
