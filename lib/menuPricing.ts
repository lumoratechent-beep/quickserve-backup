import type { MenuItem, MenuPromotionDiscount } from '../src/types';

export const getDefaultPromotionDiscount = (): MenuPromotionDiscount => ({
  enabled: false,
  type: 'percentage',
  value: 0,
  label: '',
  startDate: '',
  endDate: '',
});

export const normalizeMenuPromotionDiscount = (value?: Partial<MenuPromotionDiscount> | null): MenuPromotionDiscount => {
  const type = value?.type === 'fixed' ? 'fixed' : 'percentage';
  return {
    enabled: value?.enabled === true,
    type,
    value: Math.max(0, Number(value?.value || 0)),
    label: value?.label || '',
    startDate: value?.startDate || '',
    endDate: value?.endDate || '',
  };
};

const toLocalDateKey = (date: Date): string => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export const isMenuPromotionActive = (promotion?: Partial<MenuPromotionDiscount> | null, now = new Date()): boolean => {
  const normalized = normalizeMenuPromotionDiscount(promotion);
  if (!normalized.enabled || normalized.value <= 0) return false;

  const today = toLocalDateKey(now);
  if (normalized.startDate && normalized.startDate > today) return false;
  if (normalized.endDate && normalized.endDate < today) return false;
  return true;
};

export const getMenuPromotionDiscountAmount = (
  basePrice: number,
  promotion?: Partial<MenuPromotionDiscount> | null,
  now = new Date(),
): number => {
  if (!isMenuPromotionActive(promotion, now)) return 0;
  const normalized = normalizeMenuPromotionDiscount(promotion);
  const amount = normalized.type === 'percentage'
    ? basePrice * Math.min(100, normalized.value) / 100
    : normalized.value;
  return Math.min(basePrice, Math.max(0, amount));
};

export const getMenuItemEffectivePrice = (item: Pick<MenuItem, 'price' | 'promotionDiscount'>, now = new Date()): number => {
  const basePrice = Number(item.price || 0);
  return Math.max(0, basePrice - getMenuPromotionDiscountAmount(basePrice, item.promotionDiscount, now));
};
