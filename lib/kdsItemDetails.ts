import type { CartItem } from '../src/types';

export interface KdsPreparationDetail {
  key: string;
  label: string;
  value: string;
}

const clean = (value: unknown): string => String(value || '').trim();

const titleCase = (value: string): string => value
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase());

/**
 * One canonical description of every CartItem field that changes preparation.
 * Used by screen and printer rendering so neither path silently omits options.
 */
export const getKdsPreparationDetails = (item: CartItem): KdsPreparationDetail[] => {
  const details: KdsPreparationDetail[] = [];
  const push = (key: string, label: string, value: unknown) => {
    const cleanedValue = clean(value);
    if (cleanedValue) details.push({ key, label, value: cleanedValue });
  };

  push('variant-option', 'Variant', item.selectedVariantOption);

  const modifierEntries = Object.entries(item.selectedModifiers || {})
    .map(([label, value]) => [clean(label), clean(value)] as const)
    .filter(([label, value]) => label && value);
  const modifierValues = new Set(modifierEntries.map(([, value]) => value.toLowerCase()));
  const otherVariant = clean(item.selectedOtherVariant);
  if (otherVariant && !modifierValues.has(otherVariant.toLowerCase())) {
    push(
      'other-variant',
      clean(item.otherVariantName) ? titleCase(clean(item.otherVariantName)) : 'Variant',
      otherVariant,
    );
  }
  modifierEntries.forEach(([label, value], index) => {
    push(`modifier-${index}-${label}`, titleCase(label), value);
  });

  push('portion', 'Portion', item.selectedSize);
  push('thermal', 'Thermal Option', item.selectedTemp);

  const addOns = (item.selectedAddOns || [])
    .filter(addOn => clean(addOn.name) && Number(addOn.quantity || 0) > 0)
    .map(addOn => Number(addOn.quantity || 0) > 1
      ? `${clean(addOn.name)} x${Number(addOn.quantity)}`
      : clean(addOn.name));
  push('add-ons', 'Add-On', addOns.join(', '));

  const mixAndMatch = (item.selectedMixMatch || [])
    .filter(selection => clean(selection.choice))
    .map(selection => clean(selection.label)
      ? `${clean(selection.label)}: ${clean(selection.choice)}`
      : clean(selection.choice));
  push('mix-match', 'Mix & Match', mixAndMatch.join(' + '));

  push('remark', 'Remark', item.remark);
  return details;
};

/** Prevent differently configured items from being collapsed into one cart line. */
export const getKdsItemConfigurationKey = (item: CartItem): string => JSON.stringify({
  restaurantId: item.restaurantId || '',
  id: item.id,
  selectedSize: clean(item.selectedSize),
  selectedTemp: clean(item.selectedTemp),
  selectedOtherVariant: clean(item.selectedOtherVariant),
  selectedVariantOption: clean(item.selectedVariantOption),
  selectedModifiers: Object.entries(item.selectedModifiers || {}).sort(([a], [b]) => a.localeCompare(b)),
  selectedAddOns: (item.selectedAddOns || []).map(addOn => [clean(addOn.name), Number(addOn.quantity || 0)]),
  selectedMixMatch: (item.selectedMixMatch || []).map(selection => [clean(selection.label), clean(selection.choice)]),
  remark: clean(item.remark),
});
