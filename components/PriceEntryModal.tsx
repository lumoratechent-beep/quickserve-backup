import React, { useState } from 'react';
import { X, Delete } from 'lucide-react';

interface Props {
  itemName: string;
  onConfirm: (price: number) => void;
  onClose: () => void;
  currency?: string;
}

const NUM_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;

const PriceEntryModal: React.FC<Props> = ({ itemName, onConfirm, onClose, currency = '' }) => {
  const [price, setPrice] = useState('');

  const handleKey = (key: string) => {
    if (key === 'del') {
      setPrice(prev => prev.slice(0, -1));
      return;
    }
    if (key === '.') {
      if (price.includes('.')) return; // only one decimal
      if (!price) { setPrice('0.'); return; }
    }
    // limit to 2 decimal places
    const dotIdx = price.indexOf('.');
    if (dotIdx !== -1 && price.length - dotIdx > 2 && key !== 'del') return;
    // limit total length
    if (price.length >= 10) return;
    setPrice(prev => prev + key);
  };

  const handleConfirm = () => {
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
        <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="font-black text-lg text-gray-900 dark:text-white uppercase tracking-tight">{itemName}</h2>
            <p className="text-[10px] text-orange-500 font-black uppercase tracking-widest">Enter price for this sale</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Display */}
        <div className="px-4 pt-4 pb-2">
          <div className="w-full py-3 px-4 text-3xl font-black text-center border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white min-h-[56px] flex items-center justify-center select-none">
            {price ? (
              <><span className="text-gray-400 text-xl mr-1">{currency || 'RM'}</span>{price}</>
            ) : (
              <span className="text-gray-300 dark:text-gray-500">0.00</span>
            )}
          </div>
          <p className="text-[9px] text-gray-400 mt-1.5 text-center">
            This item has no set price. Enter the price for this sale.
          </p>
        </div>

        {/* Number Pad */}
        <div className="px-4 pt-2 pb-3 grid grid-cols-3 gap-2">
          {NUM_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleKey(key)}
              className={`py-3.5 rounded-xl font-black text-lg transition-all active:scale-95 select-none ${
                key === 'del'
                  ? 'bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center justify-center'
                  : key === '.'
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {key === 'del' ? <Delete size={20} /> : key}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-black text-xs uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!price || Number(price) <= 0}
            className="flex-1 py-3 rounded-xl bg-orange-500 text-white font-black text-xs uppercase tracking-widest hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add to Order
          </button>
        </div>
      </div>
    </div>
  );
};

export default PriceEntryModal;
