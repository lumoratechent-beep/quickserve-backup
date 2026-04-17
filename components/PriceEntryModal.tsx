import React, { useState, useRef, useEffect } from 'react';
import { X, DollarSign } from 'lucide-react';

interface Props {
  itemName: string;
  onConfirm: (price: number) => void;
  onClose: () => void;
  currency?: string;
}

const PriceEntryModal: React.FC<Props> = ({ itemName, onConfirm, onClose, currency = '' }) => {
  const [price, setPrice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus the input when modal opens
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numPrice = Number(price);
    if (!price || numPrice <= 0) return;
    onConfirm(numPrice);
  };

  return (
    <div
      className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl border dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="font-black text-lg text-gray-900 dark:text-white uppercase tracking-tight">{itemName}</h2>
            <p className="text-[10px] text-orange-500 font-black uppercase tracking-widest">Enter price for this sale</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Sale Price {currency ? `(${currency})` : ''}
            </label>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-4 py-3 text-2xl font-black text-center border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
              />
            </div>
            <p className="text-[9px] text-gray-400 mt-1.5 text-center">
              This item has no set price. Enter the price for this sale.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-black text-xs uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!price || Number(price) <= 0}
              className="flex-1 py-3 rounded-xl bg-orange-500 text-white font-black text-xs uppercase tracking-widest hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add to Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PriceEntryModal;
