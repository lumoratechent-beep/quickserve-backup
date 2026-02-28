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

const ItemOptionsModal: React.FC<Props> = ({ item, restaurantId, onClose, onConfirm }) => {
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedTemp, setSelectedTemp] = useState<'Hot' | 'Cold' | undefined>(undefined);
  const [selectedOtherVariant, setSelectedOtherVariant] = useState<string>('');
  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, SelectedAddOn>>({});

  useEffect(() => {
    if (!item) return;
    setSelectedSize(item.sizes?.[0]?.name || '');
    setSelectedTemp(item.tempOptions?.enabled ? 'Hot' : undefined);
    setSelectedOtherVariant(item.otherVariantsEnabled ? (item.otherVariants?.[0]?.name || '') : '');
    setSelectedAddOns({});
  }, [item]);

  if (!item) return null;

  const handleAddOnQuantityChange = (addOn: AddOnItem, change: number) => {
    const current = selectedAddOns[addOn.name] || { name: addOn.name, price: addOn.price, quantity: 0 };
    const newQuantity = Math.max(0, Math.min(addOn.maxQuantity || 99, current.quantity + change));

    if (newQuantity === 0) {
      const updated = { ...selectedAddOns };
      delete updated[addOn.name];
      setSelectedAddOns(updated);
      return;
    }

    setSelectedAddOns(prev => ({
      ...prev,
      [addOn.name]: { name: addOn.name, price: addOn.price, quantity: newQuantity },
    }));
  };

  const totalAddOnPrice = useMemo(() => {
    return Object.values(selectedAddOns).reduce((sum, addon) => sum + addon.price * addon.quantity, 0);
  }, [selectedAddOns]);

  const totalPrice = useMemo(() => {
    let finalPrice = item.price;

    if (selectedSize) {
      const sizeObj = item.sizes?.find(s => s.name === selectedSize);
      if (sizeObj) finalPrice += sizeObj.price;
    }

    if (selectedTemp === 'Hot' && item.tempOptions?.hot) finalPrice += item.tempOptions.hot;
    if (selectedTemp === 'Cold' && item.tempOptions?.cold) finalPrice += item.tempOptions.cold;

    if (selectedOtherVariant) {
      const otherObj = item.otherVariants?.find(v => v.name === selectedOtherVariant);
      if (otherObj) finalPrice += otherObj.price;
    }

    finalPrice += totalAddOnPrice;
    return finalPrice;
  }, [item, selectedSize, selectedTemp, selectedOtherVariant, totalAddOnPrice]);

  const handleConfirm = () => {
    const cartItem: CartItem = {
      id: item.id,
      name: item.name,
      description: item.description,
      price: totalPrice,
      image: item.image,
      category: item.category,
      isArchived: item.isArchived,
      sizes: item.sizes,
      otherVariantName: item.otherVariantName,
      otherVariants: item.otherVariants,
      otherVariantsEnabled: item.otherVariantsEnabled,
      tempOptions: item.tempOptions,
      addOns: item.addOns,
      quantity: 1,
      restaurantId,
      selectedSize,
      selectedTemp,
      selectedOtherVariant,
      selectedAddOns: Object.values(selectedAddOns),
    };

    onConfirm(cartItem);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[120] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border dark:border-gray-700">
        <div className="p-5 border-b dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black dark:text-white uppercase tracking-tight">{item.name}</h3>
            <p className="text-[10px] text-orange-500 font-black uppercase tracking-widest">Customize item</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="p-5 max-h-[62vh] overflow-y-auto space-y-5">
          {item.sizes && item.sizes.length > 0 && (
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Size</label>
              <div className="grid grid-cols-2 gap-2">
                {item.sizes.map(size => (
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

          {item.otherVariantsEnabled && item.otherVariants && item.otherVariants.length > 0 && (
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
                {item.otherVariants.map(variant => (
                  <button
                    key={variant.name}
                    onClick={() => setSelectedOtherVariant(variant.name)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedOtherVariant === variant.name
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <p className="text-[10px] font-black uppercase">{variant.name}</p>
                    <p className="text-xs font-black">+{variant.price > 0 ? `RM${variant.price.toFixed(2)}` : 'FREE'}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {item.tempOptions?.enabled && (
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

          {item.addOns && item.addOns.length > 0 && (
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Add-ons</label>
              <div className="space-y-2">
                {item.addOns.map((addon, idx) => {
                  const quantity = selectedAddOns[addon.name]?.quantity || 0;
                  return (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                      <div>
                        <p className="font-black text-xs dark:text-white">{addon.name}</p>
                        <p className="text-[9px] text-orange-500 font-black">+RM{addon.price.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAddOnQuantityChange(addon, -1)}
                          className="p-1.5 bg-white dark:bg-gray-800 rounded-lg text-gray-500 hover:bg-orange-500 hover:text-white transition-all"
                          disabled={quantity === 0}
                        >
                          <Minus size={14} />
                        </button>
                        <span className="font-black text-xs w-6 text-center dark:text-white">{quantity}</span>
                        <button
                          onClick={() => handleAddOnQuantityChange(addon, 1)}
                          className="p-1.5 bg-white dark:bg-gray-800 rounded-lg text-gray-500 hover:bg-orange-500 hover:text-white transition-all"
                          disabled={quantity >= (addon.maxQuantity || 99)}
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
            onClick={handleConfirm}
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
