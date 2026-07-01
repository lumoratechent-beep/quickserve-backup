import type { MenuItem, MenuPromotionDiscount } from '../src/types';

export const getDefaultPromotionDiscount = (): MenuPromotionDiscount => ({
  enabled: false,
  type: 'percentage',
  value: 0,
  label: '',
  startDate: '',
  endDate: '',
  appliesTo: 'all',
  variantDiscounts: [],
});

export const normalizeMenuPromotionDiscount = (value?: Partial<MenuPromotionDiscount> | null): MenuPromotionDiscount => {
  const type = value?.type === 'fixed' ? 'fixed' : 'percentage';
  const variantDiscounts = Array.isArray(value?.variantDiscounts)
    ? value.variantDiscounts
        .filter(discount => discount && typeof discount.key === 'string' && typeof discount.label === 'string')
        .map(discount => {
          const discountType: MenuPromotionDiscount['type'] = discount.type === 'fixed' ? 'fixed' : 'percentage';
          return {
            key: discount.key,
            label: discount.label,
            enabled: discount.enabled === true,
            type: discountType,
            value: Math.max(0, Number(discount.value || 0)),
          };
        })
    : [];

  return {
    enabled: value?.enabled === true,
    type,
    value: Math.max(0, Number(value?.value || 0)),
    label: value?.label || '',
    startDate: value?.startDate || '',
    endDate: value?.endDate || '',
    appliesTo: value?.appliesTo === 'variants' ? 'variants' : 'all',
    variantDiscounts,
  };
};

export const toLocalDateKey = (date: Date): string => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export const isMenuPromotionActive = (promotion?: Partial<MenuPromotionDiscount> | null, now = new Date()): boolean => {
  const normalized = normalizeMenuPromotionDiscount(promotion);
  if (!normalized.enabled) return false;

  const today = toLocalDateKey(now);
  if (normalized.startDate && normalized.startDate > today) return false;
  if (normalized.endDate && normalized.endDate < today) return false;

  if (normalized.appliesTo === 'variants') {
    return (normalized.variantDiscounts || []).some(discount => discount.enabled && discount.value > 0);
  }

  return normalized.value > 0;
};

export const isMenuPromotionArchived = (promotion?: Partial<MenuPromotionDiscount> | null, now = new Date()): boolean => {
  const normalized = normalizeMenuPromotionDiscount(promotion);
  if (!normalized.enabled || !normalized.endDate) return false;

  const hasDiscount = normalized.appliesTo === 'variants'
    ? (normalized.variantDiscounts || []).some(discount => discount.enabled && discount.value > 0)
    : normalized.value > 0;

  return hasDiscount && normalized.endDate < toLocalDateKey(now);
};

export const getMenuPromotionVariantKey = (selection?: {
  selectedSize?: string;
  selectedTemp?: string;
  selectedOtherVariant?: string;
  selectedVariantOption?: string;
}): string => {
  if (selection?.selectedVariantOption) return `variant:${selection.selectedVariantOption}`;
  if (selection?.selectedSize) return `size:${selection.selectedSize}`;
  if (selection?.selectedOtherVariant) return `other:${selection.selectedOtherVariant}`;
  if (selection?.selectedTemp) return `temp:${selection.selectedTemp}`;
  return 'base';
};

const getDiscountAmount = (
  basePrice: number,
  type: MenuPromotionDiscount['type'],
  value: number,
): number => {
  const amount = type === 'percentage'
    ? basePrice * Math.min(100, value) / 100
    : value;
  return Math.min(basePrice, Math.max(0, amount));
};

const getActiveVariantDiscount = (
  promotion: MenuPromotionDiscount,
  variantKey = 'base',
) => {
  if (promotion.appliesTo !== 'variants') return null;
  return (promotion.variantDiscounts || []).find(discount => (
    discount.key === variantKey && discount.enabled && discount.value > 0
  )) || null;
};

export const getMenuPromotionDiscountAmount = (
  basePrice: number,
  promotion?: Partial<MenuPromotionDiscount> | null,
  now = new Date(),
  variantKey = 'base',
): number => {
  if (!isMenuPromotionActive(promotion, now)) return 0;
  const normalized = normalizeMenuPromotionDiscount(promotion);

  if (normalized.appliesTo === 'variants') {
    const variantDiscount = getActiveVariantDiscount(normalized, variantKey);
    if (!variantDiscount) return 0;
    return getDiscountAmount(basePrice, variantDiscount.type, variantDiscount.value);
  }

  return getDiscountAmount(basePrice, normalized.type, normalized.value);
};

export const getMenuItemEffectivePrice = (
  item: Pick<MenuItem, 'price' | 'promotionDiscount'>,
  now = new Date(),
  variantKey = 'base',
): number => {
  const basePrice = Number(item.price || 0);
  return Math.max(0, basePrice - getMenuPromotionDiscountAmount(basePrice, item.promotionDiscount, now, variantKey));
};
