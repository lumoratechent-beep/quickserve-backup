import React, { useMemo, useState } from 'react';
import { MenuItem, CartItem, SelectedAddOn, ModifierData } from '../src/types';
import { X, Plus, Minus } from 'lucide-react';
import { toast } from './Toast';

interface Props {
  item: MenuItem | null;
  restaurantId: string;
  onClose: () => void;
  onConfirm: (item: CartItem) => void;
  modifiers?: ModifierData[];
}

const SimpleItemOptionsModal: React.FC<Props> = ({ item, restaurantId, onClose, onConfirm, modifiers = [] }) => {
  // If no item, don't show anything
  if (!item) return null;

  // Simple state - just selected choices
  const [size, setSize] = useState('');
  const [temp, setTemp] = useState('');
  const [variant, setVariant] = useState('');
  const [variantOption, setVariantOption] = useState('');
  const [addOns, setAddOns] = useState<Record<string, number>>({});
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string>>({});

  // Safety check - make sure arrays exist
  const sizes = Array.isArray(item.sizes) ? item.sizes : [];
  const variants = Array.isArray(item.otherVariants) ? item.otherVariants : [];
  const addOnList = Array.isArray(item.addOns) ? item.addOns : [];
  const hasTempOptions = item.tempOptions && item.tempOptions.enabled && item.tempOptions.options && item.tempOptions.options.length > 0;
  const hasVariantOptions = item.variantOptions && item.variantOptions.enabled && item.variantOptions.options && item.variantOptions.options.length > 0;

  // Build active modifiers from linkedModifiers (new) or fall back to legacy otherVariantName (old)
  const activeModifiers = useMemo(() => {
    const linked = item.linkedModifiers || [];
    if (linked.length > 0) {
      // New multi-modifier: look up each linked name in restaurant-level modifiers
      return linked
        .map(name => modifiers.find(m => m.name === name))
        .filter((m): m is ModifierData => !!m);
    }
    // Legacy fallback: single modifier via otherVariantName
    if (item.otherVariantsEnabled && item.otherVariantName) {
      const normalizedName = item.otherVariantName.trim().toLowerCase();
      const found = modifiers.find(m => m.name.trim().toLowerCase() === normalizedName);
      if (found) {
        const options = variants.length > 0 ? variants : found.options;
        return [{ ...found, options }];
      }
    }
    return [];
  }, [item.linkedModifiers, item.otherVariantsEnabled, item.otherVariantName, modifiers, variants]);

  // Show legacy variant UI only if no linked modifier matches and item has inline variants
  const shouldShowLegacyVariant = item.otherVariantsEnabled && variants.length > 0 && activeModifiers.length === 0;

  const handleAddOnChange = (name: string, qty: number) => {
    if (qty <= 0) {
      const copy = { ...addOns };
      delete copy[name];
      setAddOns(copy);
    } else {
      setAddOns({ ...addOns, [name]: qty });
    }
  };

  const calculateTotal = () => {
    let total = item.price || 0;

    // Add size price
    if (size) {
      const s = sizes.find(x => x.name === size);
      if (s) total += s.price;
    }

    // Add legacy variant price
    if (variant) {
      const v = variants.find(x => x.name === variant);
      if (v) total += v.price;
    }

    // Add temp price from options array
    if (temp && item.tempOptions?.options) {
      const t = item.tempOptions.options.find(x => x.name === temp);
      if (t) total += t.price;
    }

    // Add variant option price
    if (variantOption && item.variantOptions?.options) {
      const v = item.variantOptions.options.find(x => x.name === variantOption);
      if (v) total += v.price;
    }

    // Add modifier prices
    Object.entries(selectedModifiers).forEach(([modifierName, optionName]) => {
      const modifier = activeModifiers.find(m => m.name === modifierName);
      if (modifier) {
        const option = modifier.options.find(o => o.name === optionName);
        if (option) total += option.price;
      }
    });

    // Add add-ons total
    Object.entries(addOns).forEach(([name, qty]) => {
      const addon = addOnList.find(x => x.name === name);
      if (addon) total += addon.price * qty;
    });

    return total;
  };

  const handleConfirm = () => {
    // Validate size (always required if sizes exist)
    if (sizes.length > 0 && !size) {
      toast('Please select a size', 'warning');
      return;
    }

    // Validate temperature (always required if temp options exist)
    if (hasTempOptions && !temp) {
      toast('Please select a temperature', 'warning');
      return;
    }

    // Validate variant option (always required if variant options exist)
    if (hasVariantOptions && !variantOption) {
      toast('Please select a variant option', 'warning');
      return;
    }

    // Validate required modifiers
    for (const modifier of activeModifiers) {
      if (modifier.required && !selectedModifiers[modifier.name]) {
        toast(`Please select an option for ${modifier.name}`, 'warning');
        return;
      }
    }

    const selectedAddOns: SelectedAddOn[] = Object.entries(addOns).map(([name, qty]) => {
      const addon = addOnList.find(x => x.name === name);
      return { name, price: addon?.price || 0, quantity: qty };
    });

    // Build selectedOtherVariant for backward compat (first modifier's selection)
    const firstModSelection = activeModifiers.length > 0 ? (selectedModifiers[activeModifiers[0].name] || '') : '';

    const cartItem: CartItem = {
      id: item.id,
      name: item.name,
      description: item.description,
      price: calculateTotal(),
      image: item.image,
      category: item.category,
      isArchived: item.isArchived,
      sizes: sizes || [],
      otherVariantName: item.otherVariantName,
      otherVariants: variants || [],
      otherVariantsEnabled: item.otherVariantsEnabled,
      linkedModifiers: item.linkedModifiers,
      tempOptions: item.tempOptions,
      addOns: addOnList || [],
      quantity: 1,
      restaurantId,
      selectedSize: size,
      selectedTemp: temp || undefined,
      selectedOtherVariant: variant || firstModSelection,
      selectedModifiers: Object.keys(selectedModifiers).length > 0 ? selectedModifiers : undefined,
      selectedAddOns,
      selectedVariantOption: variantOption || undefined,
    };

    onConfirm(cartItem);
  };

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl border dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90vh', overflow: 'hidden' }}
      >
        {/* Header */}
        <div className="p-5 border-b dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="font-black text-lg text-gray-900 dark:text-white uppercase tracking-tight">{item.name}</h2>
            <p className="text-[10px] text-orange-500 font-black uppercase tracking-widest">Customize item</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Main Content - Image Left, Options Right */}
        <div className="p-5 flex gap-5">
          {/* Left: Image — hidden on mobile */}
          <div className="hidden sm:block w-36 h-36 flex-shrink-0 bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden shadow-inner">
            {item.image ? (
              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <span className="text-xs">No Image</span>
              </div>
            )}
          </div>

          {/* Right: Options, Sizes, Variants, Temperature */}
          <div className="flex-1 space-y-4 pr-1">
            {/* Sizes */}
            {sizes.length > 0 && (
              <div>
                <p className="text-sm font-black text-gray-700 dark:text-gray-100 uppercase tracking-widest mb-2 flex items-center gap-2">
                  Size
                  <span className="text-red-500 text-[9px]">Required</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {sizes.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => setSize(s.name)}
                      className={`px-3 py-1.5 rounded-xl border text-left transition-all ${
                        size === s.name
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <p className="text-sm font-black uppercase text-gray-800 dark:text-white">{s.name}</p>
                      <p className="text-xs font-black">{s.price > 0 ? `+RM${s.price.toFixed(2)}` : 'FREE'}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Legacy Variants */}
            {shouldShowLegacyVariant && (
              <div>
                <p className="text-sm font-black text-gray-700 dark:text-gray-100 uppercase tracking-widest mb-2">{item.otherVariantName || 'Options'}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setVariant('')}
                    className={`px-3 py-1.5 rounded-xl border text-left transition-all ${
                      variant === ''
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <p className="text-sm font-black uppercase text-gray-800 dark:text-white">None</p>
                    <p className="text-xs font-black">Default</p>
                  </button>
                  {variants.map((v) => (
                    <button
                      key={v.name}
                      onClick={() => setVariant(v.name)}
                      className={`px-3 py-1.5 rounded-xl border text-left transition-all ${
                        variant === v.name
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <p className="text-sm font-black uppercase text-gray-800 dark:text-white">{v.name}</p>
                      <p className="text-xs font-black">{v.price > 0 ? `+RM${v.price.toFixed(2)}` : 'FREE'}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Temperature */}
            {hasTempOptions && (
              <div>
                <p className="text-sm font-black text-gray-700 dark:text-gray-100 uppercase tracking-widest mb-2 flex items-center gap-2">
                  Temperature
                  <span className="text-red-500 text-[9px]">Required</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {item.tempOptions?.options?.map((opt) => (
                    <button
                      key={opt.name}
                      onClick={() => setTemp(opt.name)}
                      className={`px-3 py-1.5 rounded-xl border text-left transition-all ${
                        temp === opt.name
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <p className="text-sm font-black uppercase text-gray-800 dark:text-white">{opt.name}</p>
                      <p className="text-xs font-black">{opt.price > 0 ? `+RM${opt.price.toFixed(2)}` : 'FREE'}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Variant Options */}
            {hasVariantOptions && (
              <div>
                <p className="text-sm font-black text-gray-700 dark:text-gray-100 uppercase tracking-widest mb-2 flex items-center gap-2">
                  Variant
                  <span className="text-red-500 text-[9px]">Required</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {item.variantOptions?.options?.map((opt) => (
                    <button
                      key={opt.name}
                      onClick={() => setVariantOption(opt.name)}
                      className={`px-3 py-1.5 rounded-xl border text-left transition-all ${
                        variantOption === opt.name
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <p className="text-sm font-black uppercase text-gray-800 dark:text-white">{opt.name}</p>
                      <p className="text-xs font-black">{opt.price > 0 ? `+RM${opt.price.toFixed(2)}` : 'FREE'}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Modifiers */}
            {activeModifiers.map((modifier) => (
              <div key={modifier.name}>
                <p className="text-sm font-black text-gray-700 dark:text-gray-100 uppercase tracking-widest mb-2 flex items-center gap-2">
                  {modifier.name}
                  {modifier.required && (
                    <span className="text-red-500 text-[9px]">Required</span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {modifier.options.map((option) => (
                    <button
                      key={option.name}
                      onClick={() => setSelectedModifiers({ ...selectedModifiers, [modifier.name]: option.name })}
                      className={`px-3 py-1.5 rounded-xl border text-left transition-all ${
                        selectedModifiers[modifier.name] === option.name
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <p className="text-sm font-black uppercase text-gray-800 dark:text-white">{option.name}</p>
                      <p className="text-xs font-black">{option.price > 0 ? `+RM${option.price.toFixed(2)}` : 'FREE'}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add-ons - Full Width Below */}
        {addOnList.length > 0 && (
          <div className="p-5 border-t dark:border-gray-700">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Add-ons</p>
            <div className="grid grid-cols-2 gap-2">
              {addOnList.map((addon) => (
                <div key={addon.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div>
                    <p className="text-xs font-black dark:text-white">{addon.name}</p>
                    <p className="text-[9px] text-orange-500 font-black">+RM{addon.price.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAddOnChange(addon.name, (addOns[addon.name] || 0) - 1)}
                      className="p-1.5 bg-white dark:bg-gray-800 rounded-lg text-gray-500 hover:bg-orange-500 hover:text-white transition-all"
                      disabled={(addOns[addon.name] || 0) === 0}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center text-xs font-black dark:text-white">{addOns[addon.name] || 0}</span>
                    <button
                      onClick={() => handleAddOnChange(addon.name, (addOns[addon.name] || 0) + 1)}
                      className="p-1.5 bg-white dark:bg-gray-800 rounded-lg text-gray-500 hover:bg-orange-500 hover:text-white transition-all"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>{/* end scrollable content area */}

        {/* Footer */}
        <div className="p-5 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex items-center gap-4 flex-shrink-0">
          <div>
            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Total</p>
            <p className="text-2xl font-black dark:text-white">RM{calculateTotal().toFixed(2)}</p>
          </div>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};

export default SimpleItemOptionsModal;
