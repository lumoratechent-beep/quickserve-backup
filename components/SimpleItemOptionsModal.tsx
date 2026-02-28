import React, { useState } from 'react';
import { MenuItem, CartItem, SelectedAddOn } from '../src/types';
import { X, Plus, Minus } from 'lucide-react';

interface Props {
  item: MenuItem | null;
  restaurantId: string;
  onClose: () => void;
  onConfirm: (item: CartItem) => void;
}

const SimpleItemOptionsModal: React.FC<Props> = ({ item, restaurantId, onClose, onConfirm }) => {
  // If no item, don't show anything
  if (!item) return null;

  // Simple state - just selected choices
  const [size, setSize] = useState('');
  const [temp, setTemp] = useState('');
  const [variant, setVariant] = useState('');
  const [addOns, setAddOns] = useState<Record<string, number>>({});

  // Safety check - make sure arrays exist
  const sizes = Array.isArray(item.sizes) ? item.sizes : [];
  const variants = Array.isArray(item.otherVariants) ? item.otherVariants : [];
  const addOnList = Array.isArray(item.addOns) ? item.addOns : [];
  const hasTempOptions = item.tempOptions && item.tempOptions.enabled;

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

    // Add variant price
    if (variant) {
      const v = variants.find(x => x.name === variant);
      if (v) total += v.price;
    }

    // Add temp price
    if (temp === 'Hot' && item.tempOptions?.hot) total += item.tempOptions.hot;
    if (temp === 'Cold' && item.tempOptions?.cold) total += item.tempOptions.cold;

    // Add add-ons total
    Object.entries(addOns).forEach(([name, qty]) => {
      const addon = addOnList.find(x => x.name === name);
      if (addon) total += addon.price * qty;
    });

    return total;
  };

  const handleConfirm = () => {
    const selectedAddOns: SelectedAddOn[] = Object.entries(addOns).map(([name, qty]) => {
      const addon = addOnList.find(x => x.name === name);
      return { name, price: addon?.price || 0, quantity: qty };
    });

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
      tempOptions: item.tempOptions,
      addOns: addOnList || [],
      quantity: 1,
      restaurantId,
      selectedSize: size,
      selectedTemp: (temp as 'Hot' | 'Cold' | undefined),
      selectedOtherVariant: variant,
      selectedAddOns,
    };

    onConfirm(cartItem);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-black text-gray-900 dark:text-white">{item.name}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-96 overflow-y-auto space-y-4">
          {/* Sizes */}
          {sizes.length > 0 && (
            <div>
              <p className="font-bold text-sm mb-2">Size</p>
              <div className="space-y-1">
                {sizes.map((s) => (
                  <label key={s.name} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="size"
                      checked={size === s.name}
                      onChange={() => setSize(s.name)}
                    />
                    <span>{s.name}</span>
                    {s.price > 0 && <span className="text-orange-500">+RM{s.price}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Variants */}
          {item.otherVariantsEnabled && variants.length > 0 && (
            <div>
              <p className="font-bold text-sm mb-2">{item.otherVariantName || 'Options'}</p>
              <div className="space-y-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="variant"
                    checked={variant === ''}
                    onChange={() => setVariant('')}
                  />
                  <span>None</span>
                </label>
                {variants.map((v) => (
                  <label key={v.name} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="variant"
                      checked={variant === v.name}
                      onChange={() => setVariant(v.name)}
                    />
                    <span>{v.name}</span>
                    {v.price > 0 && <span className="text-orange-500">+RM{v.price}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Temperature */}
          {hasTempOptions && (
            <div>
              <p className="font-bold text-sm mb-2">Temperature</p>
              <div className="space-y-1">
                {item.tempOptions?.hot !== undefined && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="temp"
                      checked={temp === 'Hot'}
                      onChange={() => setTemp('Hot')}
                    />
                    <span>Hot</span>
                    {item.tempOptions.hot > 0 && <span className="text-orange-500">+RM{item.tempOptions.hot}</span>}
                  </label>
                )}
                {item.tempOptions?.cold !== undefined && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="temp"
                      checked={temp === 'Cold'}
                      onChange={() => setTemp('Cold')}
                    />
                    <span>Cold</span>
                    {item.tempOptions.cold > 0 && <span className="text-orange-500">+RM{item.tempOptions.cold}</span>}
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Add-ons */}
          {addOnList.length > 0 && (
            <div>
              <p className="font-bold text-sm mb-2">Add-ons</p>
              <div className="space-y-2">
                {addOnList.map((addon) => (
                  <div key={addon.name} className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded">
                    <div>
                      <p className="text-sm font-bold">{addon.name}</p>
                      <p className="text-xs text-orange-500">RM{addon.price}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleAddOnChange(addon.name, (addOns[addon.name] || 0) - 1)}
                        className="p-1 bg-gray-300 dark:bg-gray-600 rounded"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center">{addOns[addon.name] || 0}</span>
                      <button
                        onClick={() => handleAddOnChange(addon.name, (addOns[addon.name] || 0) + 1)}
                        className="p-1 bg-gray-300 dark:bg-gray-600 rounded"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t dark:border-gray-700 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-xl font-black">RM{calculateTotal().toFixed(2)}</p>
          </div>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};

export default SimpleItemOptionsModal;
