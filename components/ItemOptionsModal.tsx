import React, { useEffect, useMemo, useState } from 'react';
import { AddOnItem, CartItem, MenuItem, SelectedAddOn } from '../src/types';
import { Info, Minus, Plus, ThermometerSun, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface Props {
  item: MenuItem | null;
  restaurantId: string;
  onClose: () => void;
  onConfirm: (item: CartItem) => void;
}

const toSafeArray = <T,>(value: unknown): T[] => {
  return Array.isArray(value) ? value : [];
};

const ItemOptionsModal: React.FC<Props> = ({ item, restaurantId, onClose, onConfirm }) => {
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedTemp, setSelectedTemp] = useState<'Hot' | 'Cold' | undefined>(undefined);
  const [selectedOtherVariant, setSelectedOtherVariant] = useState('');
  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, SelectedAddOn>>({});

  const sizes = useMemo(() => {
    return toSafeArray<{ name: string; price: number }>(item?.sizes)
      .filter(size => size && typeof size.name === 'string' && typeof size.price === 'number');
  }, [item?.sizes]);

  const otherVariants = useMemo(() => {
    return toSafeArray<{ name: string; price: number }>(item?.otherVariants)
      .filter(option => option && typeof option.name === 'string' && typeof option.price === 'number');
  }, [item?.otherVariants]);

  const addOns = useMemo(() => {
    return toSafeArray<AddOnItem>(item?.addOns)
      .filter(addOn => addOn && typeof addOn.name === 'string' && typeof addOn.price === 'number');
  }, [item?.addOns]);

  const hasTempOptions = useMemo(() => {
    return !!item?.tempOptions && typeof item.tempOptions === 'object' && item.tempOptions.enabled === true;
  }, [item?.tempOptions]);

  useEffect(() => {
    if (!item) return;
    setSelectedSize(sizes[0]?.name || '');
    setSelectedTemp(hasTempOptions ? 'Hot' : undefined);
    setSelectedOtherVariant(item.otherVariantsEnabled ? (otherVariants[0]?.name || '') : '');
    setSelectedAddOns({});
  }, [item, sizes, hasTempOptions, otherVariants]);

  useEffect(() => {
    if (!item) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [item, onClose]);

  if (!item || typeof document === 'undefined') return null;

  const changeAddOnQuantity = (addOn: AddOnItem, delta: number) => {
    const current = selectedAddOns[addOn.name] || { name: addOn.name, price: addOn.price, quantity: 0 };
    const nextQuantity = Math.max(0, Math.min(addOn.maxQuantity || 99, current.quantity + delta));

    if (nextQuantity === 0) {
      setSelectedAddOns(prev => {
        const updated = { ...prev };
        delete updated[addOn.name];
        return updated;
      });
      return;
    }

    setSelectedAddOns(prev => ({
      ...prev,
      [addOn.name]: { name: addOn.name, price: addOn.price, quantity: nextQuantity },
    }));
  };

  const addOnTotal = Object.values(selectedAddOns).reduce((sum, addOn) => sum + addOn.price * addOn.quantity, 0);

  const totalPrice = useMemo(() => {
    let total = Number(item.price || 0);

    if (selectedSize) {
      const size = sizes.find(option => option.name === selectedSize);
      if (size) total += size.price;
    }

    if (selectedOtherVariant) {
      const variant = otherVariants.find(option => option.name === selectedOtherVariant);
      if (variant) total += variant.price;
    }

    if (selectedTemp === 'Hot') total += Number(item.tempOptions?.hot || 0);
    if (selectedTemp === 'Cold') total += Number(item.tempOptions?.cold || 0);

    total += addOnTotal;
    return total;
  }, [item.price, item.tempOptions?.hot, item.tempOptions?.cold, selectedSize, selectedOtherVariant, selectedTemp, sizes, otherVariants, addOnTotal]);

  const confirmSelection = () => {
    const cartItem: CartItem = {
      id: item.id,
      name: item.name,
      description: item.description,
      price: totalPrice,
      image: item.image,
      category: item.category,
      isArchived: item.isArchived,
      sizes,
      otherVariantName: item.otherVariantName,
      otherVariants,
      otherVariantsEnabled: item.otherVariantsEnabled,
      tempOptions: item.tempOptions,
      addOns,
      quantity: 1,
      restaurantId,
      selectedSize,
      selectedTemp,
      selectedOtherVariant,
      selectedAddOns: Object.values(selectedAddOns),
    };

    onConfirm(cartItem);
  };

  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Customize item"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(2px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl border dark:border-gray-700"
        style={{ maxHeight: '90vh', overflow: 'hidden' }}
      >
        <div className="p-5 border-b dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black dark:text-white uppercase tracking-tight">{item.name}</h3>
            <p className="text-[10px] text-orange-500 font-black uppercase tracking-widest">Customize item</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-5">
          {sizes.length > 0 && (
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Size</label>
              <div className="grid grid-cols-2 gap-2">
                {sizes.map(size => (
                  <button
                    key={size.name}
                    onClick={() => setSelectedSize(size.name)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedSize === size.name
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <p className="text-[10px] font-black uppercase">{size.name}</p>
                    <p className="text-xs font-black">+{size.price > 0 ? `RM${size.price.toFixed(2)}` : 'FREE'}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {item.otherVariantsEnabled && otherVariants.length > 0 && (
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                {item.otherVariantName || 'Additional Options'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelectedOtherVariant('')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedOtherVariant === ''
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <p className="text-[10px] font-black uppercase">None</p>
                  <p className="text-xs font-black">Default</p>
                </button>
                {otherVariants.map(option => (
                  <button
                    key={option.name}
                    onClick={() => setSelectedOtherVariant(option.name)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedOtherVariant === option.name
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <p className="text-[10px] font-black uppercase">{option.name}</p>
                    <p className="text-xs font-black">+{option.price > 0 ? `RM${option.price.toFixed(2)}` : 'FREE'}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasTempOptions && (
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Temperature</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelectedTemp('Hot')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    selectedTemp === 'Hot'
                      ? 'border-orange-500 bg-orange-50 text-orange-600'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <ThermometerSun size={18} className="text-orange-500" />
                  <span className="text-[10px] font-black uppercase">Hot</span>
                </button>
                <button
                  onClick={() => setSelectedTemp('Cold')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    selectedTemp === 'Cold'
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <Info size={18} className="text-blue-500" />
                  <span className="text-[10px] font-black uppercase">Cold</span>
                </button>
              </div>
            </div>
          )}

          {addOns.length > 0 && (
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Add-ons</label>
              <div className="space-y-2">
                {addOns.map((addOn, idx) => {
                  const quantity = selectedAddOns[addOn.name]?.quantity || 0;
                  return (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                      <div>
                        <p className="font-black text-xs dark:text-white">{addOn.name}</p>
                        <p className="text-[9px] text-orange-500 font-black">+RM{addOn.price.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => changeAddOnQuantity(addOn, -1)}
                          className="p-1.5 bg-white dark:bg-gray-800 rounded-lg text-gray-500 hover:bg-orange-500 hover:text-white transition-all"
                          disabled={quantity === 0}
                        >
                          <Minus size={14} />
                        </button>
                        <span className="font-black text-xs w-6 text-center dark:text-white">{quantity}</span>
                        <button
                          onClick={() => changeAddOnQuantity(addOn, 1)}
                          className="p-1.5 bg-white dark:bg-gray-800 rounded-lg text-gray-500 hover:bg-orange-500 hover:text-white transition-all"
                          disabled={quantity >= (addOn.maxQuantity || 99)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex items-center gap-4">
          <div>
            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Total</p>
            <p className="text-2xl font-black dark:text-white">RM{totalPrice.toFixed(2)}</p>
          </div>
          <button
            onClick={confirmSelection}
            className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ItemOptionsModal;
